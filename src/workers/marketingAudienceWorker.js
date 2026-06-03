require("dotenv").config();

const logger = require("../shared/logger");
const { QUEUES } = require("../modules/queueJobs/service");
const { runQueueWorker } = require("../modules/queueJobs/runner");
const { processMarketingQueueJob } = require("../modules/marketing/email/queueProcessor");

runQueueWorker({
  queueName: QUEUES.MARKETING,
  workerName: "marketing-audience-worker",
  processJob: processMarketingQueueJob,
}).catch((err) => {
  logger.fatal({ err }, "marketing audience worker crashed");
  process.exit(1);
});
