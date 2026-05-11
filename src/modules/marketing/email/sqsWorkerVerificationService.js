const config = require("../../../config");
const { getModels } = require("../../../db/models");
const sqs = require("../../messaging-core/aws/sqsClient");

const QUEUES = [
  { key: "bulk", label: "Marketing bulk", env: "SQS_MARKETING_BULK_URL", url: () => config.aws.queues.marketingBulk },
  { key: "journey", label: "Marketing journey", env: "SQS_MARKETING_JOURNEY_URL", url: () => config.aws.queues.marketingJourney },
];

async function getWorkerVerification() {
  const latestWorker = await latestHeartbeat();
  const queues = QUEUES.map((queue) => queueSummary(queue));
  const credentials = credentialSummary();
  const workerHealth = latestWorker ? heartbeatHealth(latestWorker.lastHeartbeatAt) : "missing";

  return {
    generatedAt: new Date().toISOString(),
    dryRun: true,
    region: config.aws.region,
    credentials,
    queues,
    worker: latestWorker ? serializeHeartbeat(latestWorker) : null,
    commands: {
      startWorker: "npm run worker:marketing",
      runServer: "npm run dev",
      requiredEnv: ["AWS_REGION", "SQS_MARKETING_BULK_URL", "SQS_MARKETING_JOURNEY_URL"],
    },
    checks: [
      check("aws_region", Boolean(config.aws.region), `AWS region: ${config.aws.region || "missing"}`),
      check("aws_credentials", credentials.configured, credentials.message),
      check("bulk_queue_url", Boolean(config.aws.queues.marketingBulk), "Bulk queue URL is configured."),
      check("journey_queue_url", Boolean(config.aws.queues.marketingJourney), "Journey queue URL is configured."),
      check("worker_heartbeat", workerHealth === "online", latestWorker ? `Latest worker is ${workerHealth}.` : "No marketing worker heartbeat found."),
      check("worker_polled", Boolean(latestWorker?.lastPollAt), latestWorker?.lastPollAt ? "Worker has polled SQS." : "Worker has not polled SQS yet."),
    ],
  };
}

async function probeSqsQueues({ queueType = "all" } = {}) {
  const selected = QUEUES.filter((queue) => queueType === "all" || queue.key === queueType);
  const results = [];
  for (const queue of selected) {
    const url = queue.url();
    if (!url) {
      results.push({
        key: queue.key,
        label: queue.label,
        configured: false,
        ok: false,
        error: `${queue.env} is missing.`,
      });
      continue;
    }
    try {
      const attributes = await sqs.getQueueAttributes(url);
      results.push({
        key: queue.key,
        label: queue.label,
        configured: true,
        ok: true,
        url: redactQueueUrl(url),
        attributes: normalizeAttributes(attributes),
      });
    } catch (err) {
      results.push({
        key: queue.key,
        label: queue.label,
        configured: true,
        ok: false,
        url: redactQueueUrl(url),
        error: err.message,
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    probe: "GetQueueAttributes",
    queueType,
    results,
    ok: results.length > 0 && results.every((result) => result.ok),
  };
}

function queueSummary(queue) {
  const url = queue.url();
  return {
    key: queue.key,
    label: queue.label,
    env: queue.env,
    configured: Boolean(url),
    url: url ? redactQueueUrl(url) : null,
  };
}

async function latestHeartbeat() {
  const { CrmMarketingWorkerHeartbeat } = getModels();
  return CrmMarketingWorkerHeartbeat.findOne({
    where: { workerType: "marketing-worker" },
    order: [["lastHeartbeatAt", "DESC"]],
  });
}

function credentialSummary() {
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return { configured: true, source: "env_access_key", message: "AWS access key environment variables are present." };
  }
  if (process.env.AWS_PROFILE) {
    return { configured: true, source: "aws_profile", message: `AWS_PROFILE is set to ${process.env.AWS_PROFILE}.` };
  }
  if (process.env.AWS_WEB_IDENTITY_TOKEN_FILE || process.env.AWS_ROLE_ARN) {
    return { configured: true, source: "web_identity", message: "AWS web identity/role environment is present." };
  }
  if (process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI || process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI) {
    return { configured: true, source: "container_credentials", message: "AWS container credential environment is present." };
  }
  return {
    configured: false,
    source: "default_chain_unknown",
    message: "No explicit AWS credentials env found. The SDK may still use instance/SSO credentials, but run probe to confirm.",
  };
}

function heartbeatHealth(lastHeartbeatAt) {
  if (!lastHeartbeatAt) return "missing";
  const ageSeconds = Math.round((Date.now() - new Date(lastHeartbeatAt).getTime()) / 1000);
  if (ageSeconds <= 120) return "online";
  if (ageSeconds <= 600) return "stale";
  return "offline";
}

function serializeHeartbeat(row) {
  const ageSeconds = row.lastHeartbeatAt
    ? Math.round((Date.now() - new Date(row.lastHeartbeatAt).getTime()) / 1000)
    : null;
  return {
    workerId: row.workerId,
    status: row.status,
    health: heartbeatHealth(row.lastHeartbeatAt),
    ageSeconds,
    queueType: row.queueType,
    lastStartedAt: row.lastStartedAt,
    lastHeartbeatAt: row.lastHeartbeatAt,
    lastPollAt: row.lastPollAt,
    lastProcessedAt: row.lastProcessedAt,
    lastErrorAt: row.lastErrorAt,
    lastError: row.lastError,
    totalProcessed: row.totalProcessed,
    totalFailed: row.totalFailed,
  };
}

function check(key, ok, message) {
  return { key, ok, message };
}

function redactQueueUrl(url) {
  return String(url || "").replace(/(https:\/\/sqs\.[^/]+\.amazonaws\.com\/)\d+(\/.+)/, "$1***$2");
}

function normalizeAttributes(attributes = {}) {
  let redrivePolicy = null;
  if (attributes.RedrivePolicy) {
    try {
      const parsed = JSON.parse(attributes.RedrivePolicy);
      redrivePolicy = {
        maxReceiveCount: parsed.maxReceiveCount,
        deadLetterTargetArn: parsed.deadLetterTargetArn ? parsed.deadLetterTargetArn.replace(/:\d+:/, ":***:") : null,
      };
    } catch (_err) {
      redrivePolicy = { raw: "unparseable" };
    }
  }
  return {
    visible: Number(attributes.ApproximateNumberOfMessages || 0),
    inFlight: Number(attributes.ApproximateNumberOfMessagesNotVisible || 0),
    delayed: Number(attributes.ApproximateNumberOfMessagesDelayed || 0),
    oldestAgeSeconds: Number(attributes.ApproximateAgeOfOldestMessage || 0),
    visibilityTimeoutSeconds: Number(attributes.VisibilityTimeout || 0),
    retentionSeconds: Number(attributes.MessageRetentionPeriod || 0),
    redrivePolicy,
  };
}

module.exports = {
  getWorkerVerification,
  probeSqsQueues,
};
