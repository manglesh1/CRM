const repository = require("./repository");
const { validateCreateMessage } = require("./validation");
const { enqueueTransactionalMessage } = require("../messaging-core/aws/sqsClient");
const { STATUS } = require("./constants");
const suppressionService = require("../marketing/email/suppressionService");

function shouldProcessInline(enqueue) {
  if (!enqueue?.skipped || enqueue.reason !== "missing_queue_url") return false;
  if (process.env.TRANSACTIONAL_INLINE_ON_MISSING_QUEUE === "true") return true;
  if (process.env.TRANSACTIONAL_INLINE_ON_MISSING_QUEUE === "false") return false;
  return process.env.NODE_ENV !== "production";
}

function shouldRecoverSkippedMessage(message) {
  return (
    message?.status === STATUS.ENQUEUE_SKIPPED &&
    message?.lastError === "missing_queue_url" &&
    (process.env.TRANSACTIONAL_INLINE_ON_MISSING_QUEUE === "true" ||
      (process.env.TRANSACTIONAL_INLINE_ON_MISSING_QUEUE !== "false" &&
        process.env.NODE_ENV !== "production"))
  );
}

async function processInline(message) {
  const workerProcessor = require("./workerProcessor");
  const result = await workerProcessor.processTransactionalSqsMessage({
    Body: JSON.stringify({
      messageId: message.id,
      domain: "transactional",
      channel: message.channel,
      priority: message.priority,
    }),
  });
  const refreshed = await repository.findMessageById(message.id);
  return { result, message: refreshed || message };
}

async function enqueueMessage(body) {
  const validation = validateCreateMessage(body);
  if (!validation.ok) {
    const err = new Error(validation.errors.join("; "));
    err.statusCode = 400;
    throw err;
  }

  const existing = await repository.findByIdempotencyKey(validation.value.idempotencyKey);
  if (existing) {
    if (shouldRecoverSkippedMessage(existing)) {
      const inline = await processInline(existing);
      return {
        duplicate: false,
        message: inline.message,
        enqueue: {
          skipped: true,
          reason: "missing_queue_url",
          inlineProcessed: true,
        },
        inline: inline.result,
      };
    }

    return {
      duplicate: true,
      message: existing,
      enqueue: null,
    };
  }

  const message = await repository.createMessage(validation.value);
  if (message.channel === "email") {
    const suppression = await suppressionService.isSuppressed(message.locationId, message.recipientAddress);
    if (suppression) {
      const suppressed = await repository.markSuppressed(message, suppression);
      return {
        duplicate: false,
        message: suppressed,
        enqueue: { skipped: true, reason: "recipient_suppressed", suppressionId: suppression.id },
      };
    }
  }
  const enqueue = await enqueueTransactionalMessage({
    messageId: message.id,
    channel: message.channel,
    priority: message.priority,
  });
  const updated = await repository.markQueued(message, enqueue);

  if (shouldProcessInline(enqueue)) {
    const inline = await processInline(updated);
    return {
      duplicate: false,
      message: inline.message,
      enqueue: {
        ...enqueue,
        inlineProcessed: true,
      },
      inline: inline.result,
    };
  }

  return {
    duplicate: false,
    message: updated,
    enqueue,
  };
}

module.exports = {
  enqueueMessage,
};
