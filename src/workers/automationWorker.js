require("dotenv").config();

const logger = require("../shared/logger");
const { QUEUES } = require("../modules/queueJobs/service");
const { runQueueWorker } = require("../modules/queueJobs/runner");
const { processAutomationQueueJob } = require("../modules/automation/queueProcessor");

runQueueWorker({
  queueName: QUEUES.AUTOMATION,
  workerName: "automation-worker",
  processJob: processAutomationQueueJob,
}).catch((err) => {
  logger.fatal({ err }, "automation worker crashed");
  process.exit(1);
});
