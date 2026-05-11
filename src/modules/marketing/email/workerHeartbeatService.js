const os = require("os");
const { getModels } = require("../../../db/models");

function defaultWorkerId(workerType = "marketing-worker") {
  return `${workerType}:${os.hostname()}:${process.pid}`;
}

async function recordHeartbeat({
  workerType = "marketing-worker",
  workerId = defaultWorkerId(workerType),
  queueType = null,
  status = "running",
  event = "heartbeat",
  error = null,
  processedDelta = 0,
  failedDelta = 0,
  metadata = {},
} = {}) {
  const { CrmMarketingWorkerHeartbeat } = getModels();
  const now = new Date();
  const existing = await CrmMarketingWorkerHeartbeat.findOne({
    where: { workerType, workerId },
  });

  const patch = {
    workerType,
    workerId,
    queueType,
    status,
    lastHeartbeatAt: now,
    metadata: {
      ...(existing?.metadata || {}),
      ...metadata,
      lastEvent: event,
    },
  };

  if (event === "started") patch.lastStartedAt = now;
  if (event === "poll") patch.lastPollAt = now;
  if (processedDelta > 0) {
    patch.lastProcessedAt = now;
    patch.totalProcessed = Number(existing?.totalProcessed || 0) + processedDelta;
  }
  if (failedDelta > 0 || error) {
    patch.lastErrorAt = now;
    patch.lastError = error ? String(error.message || error).slice(0, 4000) : existing?.lastError || null;
    patch.totalFailed = Number(existing?.totalFailed || 0) + Math.max(0, Number(failedDelta) || 0);
  }

  if (existing) return existing.update(patch);
  return CrmMarketingWorkerHeartbeat.create({
    ...patch,
    lastStartedAt: patch.lastStartedAt || now,
    totalProcessed: Math.max(0, Number(processedDelta) || 0),
    totalFailed: Math.max(0, Number(failedDelta) || 0),
  });
}

async function safeHeartbeat(input, logger = null) {
  try {
    return await recordHeartbeat(input);
  } catch (err) {
    logger?.warn?.({ err }, "marketing worker heartbeat skipped");
    return null;
  }
}

module.exports = {
  defaultWorkerId,
  recordHeartbeat,
  safeHeartbeat,
};
