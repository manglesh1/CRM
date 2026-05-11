const repository = require("./repository");
const { validateCreateMessage } = require("./validation");
const { enqueueTransactionalMessage } = require("../messaging-core/aws/sqsClient");

async function enqueueMessage(body) {
  const validation = validateCreateMessage(body);
  if (!validation.ok) {
    const err = new Error(validation.errors.join("; "));
    err.statusCode = 400;
    throw err;
  }

  const existing = await repository.findByIdempotencyKey(validation.value.idempotencyKey);
  if (existing) {
    return {
      duplicate: true,
      message: existing,
      enqueue: null,
    };
  }

  const message = await repository.createMessage(validation.value);
  const enqueue = await enqueueTransactionalMessage({
    messageId: message.id,
    channel: message.channel,
    priority: message.priority,
  });
  const updated = await repository.markQueued(message, enqueue);

  return {
    duplicate: false,
    message: updated,
    enqueue,
  };
}

module.exports = {
  enqueueMessage,
};
