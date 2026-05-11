require("dotenv").config();

const config = require("../config");
const logger = require("../shared/logger");
const sqs = require("../modules/messaging-core/aws/sqsClient");
const processor = require("../modules/transactional/workerProcessor");

const queues = [
  config.aws.queues.transactionalCritical,
  config.aws.queues.transactionalDefault,
].filter(Boolean);

let stopping = false;

process.on("SIGINT", () => {
  stopping = true;
});

process.on("SIGTERM", () => {
  stopping = true;
});

async function run() {
  if (queues.length === 0) {
    logger.warn("No transactional SQS queues configured; worker exiting");
    return;
  }

  logger.info({ queues: queues.length }, "transactional worker started");

  while (!stopping) {
    for (const queueUrl of queues) {
      await pollQueue(queueUrl);
    }
  }

  logger.info("transactional worker stopped");
}

async function pollQueue(queueUrl) {
  const messages = await sqs.receiveMessages(queueUrl, {
    maxMessages: 5,
    waitTimeSeconds: 10,
  });

  for (const message of messages) {
    try {
      const result = await processor.processTransactionalSqsMessage(message);
      await sqs.deleteMessage(queueUrl, message.ReceiptHandle);
      logger.info({ result }, "transactional message processed");
    } catch (err) {
      logger.error({ err }, "transactional message failed");
      // Do not delete the SQS message. SQS retry + DLQ policy owns redelivery.
    }
  }
}

run().catch((err) => {
  logger.fatal({ err }, "transactional worker crashed");
  process.exit(1);
});
