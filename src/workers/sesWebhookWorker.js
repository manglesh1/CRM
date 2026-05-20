require("dotenv").config();

const config = require("../config");
const logger = require("../shared/logger");
const sqs = require("../modules/messaging-core/aws/sqsClient");
const sesService = require("../modules/webhooks/sesService");
const heartbeat = require("../modules/marketing/email/workerHeartbeatService");

const queueUrl = config.aws.queues.webhookEvents;
let stopping = false;
const workerId = heartbeat.defaultWorkerId("webhook-events-worker");

process.on("SIGINT", () => {
  stopping = true;
});

process.on("SIGTERM", () => {
  stopping = true;
});

async function run() {
  if (!queueUrl) {
    logger.warn("No webhook events SQS queue configured; worker exiting");
    await heartbeat.safeHeartbeat({
      workerType: "webhook-events-worker",
      workerId,
      status: "stopped",
      event: "no_queues",
      metadata: { queuesConfigured: 0 },
    }, logger);
    return;
  }

  logger.info("SES webhook worker started");
  await heartbeat.safeHeartbeat({
    workerType: "webhook-events-worker",
    workerId,
    queueType: "ses_events",
    status: "running",
    event: "started",
    metadata: { queuesConfigured: 1 },
  }, logger);

  while (!stopping) {
    await pollQueue();
  }

  logger.info("SES webhook worker stopped");
  await heartbeat.safeHeartbeat({
    workerType: "webhook-events-worker",
    workerId,
    queueType: "ses_events",
    status: "stopped",
    event: "stopped",
  }, logger);
}

async function pollQueue() {
  await heartbeat.safeHeartbeat({
    workerType: "webhook-events-worker",
    workerId,
    queueType: "ses_events",
    status: "polling",
    event: "poll",
  }, logger);

  const messages = await sqs.receiveMessages(queueUrl, {
    maxMessages: 10,
    waitTimeSeconds: 10,
  });

  for (const message of messages) {
    try {
      const body = parseSqsBody(message.Body);
      const result = await sesService.handleSesWebhook(body);
      await sqs.deleteMessage(queueUrl, message.ReceiptHandle);
      logger.info({ result }, "SES webhook event processed");
      await heartbeat.safeHeartbeat({
        workerType: "webhook-events-worker",
        workerId,
        queueType: "ses_events",
        status: "running",
        event: "processed",
        processedDelta: 1,
        metadata: {
          lastResultType: result?.type || null,
          lastDomain: result?.domain || null,
        },
      }, logger);
    } catch (err) {
      logger.error({ err }, "SES webhook event failed");
      await heartbeat.safeHeartbeat({
        workerType: "webhook-events-worker",
        workerId,
        queueType: "ses_events",
        status: "error",
        event: "failed",
        failedDelta: 1,
        error: err,
      }, logger);
      // Keep the SQS message so AWS retry + DLQ policy can handle it.
    }
  }
}

function parseSqsBody(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  return JSON.parse(raw);
}

run().catch((err) => {
  logger.fatal({ err }, "SES webhook worker crashed");
  process.exit(1);
});
