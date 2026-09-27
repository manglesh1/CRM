const {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  GetQueueAttributesCommand,
} = require("@aws-sdk/client-sqs");
const config = require("../../../config");
const logger = require("../../../shared/logger");

let client = null;

function getClient() {
  if (!client) {
    client = new SQSClient({ region: config.aws.region });
  }
  return client;
}

function resolveTransactionalQueue(priority) {
  if (priority === "critical" || priority === "high") {
    return config.aws.queues.transactionalCritical;
  }
  return config.aws.queues.transactionalDefault;
}

function resolveMarketingQueue(queueType) {
  if (queueType === "journey") return config.aws.queues.marketingJourney;
  return config.aws.queues.marketingBulk;
}

function assertMarketingQueueConfigured(queueType = "bulk") {
  if (!["bulk", "journey"].includes(queueType)) {
    const error = new Error("Choose a valid marketing queue: bulk or journey.");
    error.statusCode = 400;
    error.code = "INVALID_MARKETING_QUEUE";
    throw error;
  }
  if (!resolveMarketingQueue(queueType)) {
    const error = new Error(`Marketing ${queueType} queue is unavailable. Configure its SQS URL and explicitly enable real SQS in development before sending.`);
    error.statusCode = 503;
    error.code = "MARKETING_QUEUE_UNAVAILABLE";
    throw error;
  }
}

async function enqueueTransactionalMessage({ messageId, channel, priority }) {
  const queueUrl = resolveTransactionalQueue(priority);
  const body = {
    messageId,
    domain: "transactional",
    channel,
    priority,
  };

  if (!queueUrl) {
    logger.warn({ body }, "Transactional SQS URL missing; message stored but not enqueued");
    return { skipped: true, reason: "missing_queue_url", body };
  }

  const result = await getClient().send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(body),
      MessageAttributes: {
        domain: { DataType: "String", StringValue: "transactional" },
        channel: { DataType: "String", StringValue: channel },
        priority: { DataType: "String", StringValue: priority },
      },
    })
  );

  return { skipped: false, sqsMessageId: result.MessageId };
}

async function enqueueMarketingMessage({ messageId, channel = "email", queueType = "bulk", campaignId = null }) {
  assertMarketingQueueConfigured(queueType);
  const queueUrl = resolveMarketingQueue(queueType);
  const body = {
    messageId,
    campaignId,
    domain: "marketing",
    channel,
    queueType,
  };

  const result = await getClient().send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(body),
      MessageAttributes: {
        domain: { DataType: "String", StringValue: "marketing" },
        channel: { DataType: "String", StringValue: channel },
        queueType: { DataType: "String", StringValue: queueType },
      },
    })
  );

  return { skipped: false, sqsMessageId: result.MessageId };
}

module.exports = {
  enqueueTransactionalMessage,
  enqueueMarketingMessage,
  receiveMessages,
  deleteMessage,
  getQueueAttributes,
  resolveTransactionalQueue,
  resolveMarketingQueue,
  assertMarketingQueueConfigured,
};

async function receiveMessages(queueUrl, { maxMessages = 5, waitTimeSeconds = 10 } = {}) {
  const result = await getClient().send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: maxMessages,
      WaitTimeSeconds: waitTimeSeconds,
      MessageAttributeNames: ["All"],
    })
  );
  return result.Messages || [];
}

async function deleteMessage(queueUrl, receiptHandle) {
  await getClient().send(
    new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    })
  );
}

async function getQueueAttributes(queueUrl) {
  const result = await getClient().send(
    new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: [
        "ApproximateNumberOfMessages",
        "ApproximateNumberOfMessagesNotVisible",
        "ApproximateNumberOfMessagesDelayed",
        "VisibilityTimeout",
        "MessageRetentionPeriod",
        "RedrivePolicy",
      ],
    })
  );
  return result.Attributes || {};
}
