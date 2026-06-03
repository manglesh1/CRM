require("dotenv").config();

const logger = require("../shared/logger");
const { QUEUES } = require("../modules/queueJobs/service");
const { runQueueWorker } = require("../modules/queueJobs/runner");
const { processContactQueueJob } = require("../modules/contacts/queueProcessor");

runQueueWorker({
  queueName: QUEUES.CONTACTS,
  workerName: "contacts-worker",
  processJob: processContactQueueJob,
}).catch((err) => {
  logger.fatal({ err }, "contacts worker crashed");
  process.exit(1);
});
