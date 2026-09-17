const config = require("../../config");
const logger = require("../../shared/logger");
const queueJobs = require("./service");

let stopping = false;

process.on("SIGINT", () => {
  stopping = true;
});

process.on("SIGTERM", () => {
  stopping = true;
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runQueueWorker({ queueName, workerName, processJob }) {
  const workerId = `${process.env.HOSTNAME || "local"}:${process.pid}:${workerName}`;
  const marketingHeartbeat = workerName === "marketing-audience-worker"
    ? require("../marketing/email/workerHeartbeatService") : null;
  let lastHeartbeat = 0;
  logger.info({ workerId, queueName }, `${workerName} started`);

  try {
  while (!stopping) {
    if (marketingHeartbeat && Date.now() - lastHeartbeat >= 30000) {
      await marketingHeartbeat.recordHeartbeat({ workerType: workerName, workerId, status: "running" });
      lastHeartbeat = Date.now();
    }
    const jobs = await queueJobs.claimPendingJobs({
      workerId,
      queueName,
      limit: config.queueJobs.batchSize,
    });

    if (!jobs.length) {
      await sleep(config.queueJobs.pollMs);
      continue;
    }

    for (const job of jobs) {
      try {
        const result = await processJob(job);
        await queueJobs.completeJob(job, result);
        logger.info({ jobId: job.id, queueName, jobType: job.jobType, result }, `${workerName} job completed`);
      } catch (err) {
        await queueJobs.failJob(job, err);
        logger.error({ err, jobId: job.id, queueName, jobType: job.jobType }, `${workerName} job failed`);
      }
    }
  }
  } finally {
    if (marketingHeartbeat) {
      await marketingHeartbeat.recordHeartbeat({ workerType: workerName, workerId, status: "stopped", event: "stopped" });
    }
  }
  logger.info({ workerId, queueName }, `${workerName} stopped`);
}

module.exports = { runQueueWorker };
