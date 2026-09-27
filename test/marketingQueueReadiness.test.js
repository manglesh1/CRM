const test = require("node:test");
const assert = require("node:assert/strict");
const config = require("../src/config");
const sqs = require("../src/modules/messaging-core/aws/sqsClient");
const repository = require("../src/modules/marketing/email/messageRepository");

test("missing marketing queue fails explicitly without a skipped-success result", async () => {
  const previous = config.aws.queues.marketingBulk;
  config.aws.queues.marketingBulk = "";
  try {
    await assert.rejects(sqs.enqueueMarketingMessage({ messageId: "test", queueType: "bulk" }), { code: "MARKETING_QUEUE_UNAVAILABLE", statusCode: 503 });
  } finally { config.aws.queues.marketingBulk = previous; }
});

test("invalid queue types are rejected instead of silently using bulk", () => {
  assert.throws(() => sqs.assertMarketingQueueConfigured("unknown"), { code: "INVALID_MARKETING_QUEUE" });
});

test("repository never marks a skipped enqueue as queued", async () => {
  let updated = false;
  await assert.rejects(repository.markQueued({ update() { updated = true; } }, { skipped: true }), { code: "MARKETING_ENQUEUE_FAILED" });
  assert.equal(updated, false);
});

test("offline marketing workers block queueing and drip requires an audience worker", async () => {
  const { assertMarketingWorkerOnline } = require("../src/modules/marketing/email/sqsWorkerVerificationService");
  const heartbeat = { findOne: async () => null };
  const models = { CrmMarketingWorkerHeartbeat: heartbeat };

  await assert.rejects(assertMarketingWorkerOnline({ models }), { code: "MARKETING_WORKER_UNAVAILABLE" });
  heartbeat.findOne = async ({ where }) => where.workerType === "marketing-worker" ? { status: "polling" } : null;
  await assert.doesNotReject(assertMarketingWorkerOnline({ models }));
  await assert.rejects(assertMarketingWorkerOnline({ audience: true, models }), /audience\/drip worker is not online/);
});
