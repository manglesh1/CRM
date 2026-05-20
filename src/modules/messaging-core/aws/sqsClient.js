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
  const queueUrl = resolveMarketingQueue(queueType);
  const body = {
    messageId,
    campaignId,
    domain: "marketing",
    channel,
    queueType,
  };

  if (!queueUrl) {
    logger.warn({ body }, "Marketing SQS URL missing; message stored but not enqueued");
    return { skipped: true, reason: "missing_queue_url", body };
  }

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
