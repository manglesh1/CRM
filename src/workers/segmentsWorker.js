require("dotenv").config();

const logger = require("../shared/logger");
const { QUEUES } = require("../modules/queueJobs/service");
const { runQueueWorker } = require("../modules/queueJobs/runner");
const { processSegmentQueueJob } = require("../modules/segments/queueProcessor");

runQueueWorker({
  queueName: QUEUES.SEGMENTS,
  workerName: "segments-worker",
  processJob: processSegmentQueueJob,
}).catch((err) => {
  logger.fatal({ err }, "segments worker crashed");
  process.exit(1);
});
