const repository = require("./repository");
const dispatcher = require("./dispatcher");
const { DELIVERY_EVENT, STATUS } = require("./constants");

async function processTransactionalSqsMessage(sqsMessage) {
  const body = parseBody(sqsMessage.Body);
  if (!body.messageId) {
    throw new Error("SQS message missing messageId");
  }

  const message = await repository.findMessageById(body.messageId);
  if (!message) {
    return { skipped: true, reason: "message_not_found", messageId: body.messageId };
  }

  if ([STATUS.SENT, STATUS.DELIVERED, STATUS.CANCELLED].includes(message.status)) {
    return {
      skipped: true,
      reason: `message_already_${message.status}`,
      messageId: message.id,
    };
  }

  try {
    await repository.markSending(message);
    await repository.createDeliveryEvent({
      messageId: message.id,
      eventType: DELIVERY_EVENT.SENDING,
      payload: { source: "transactional-worker" },
    });

    const result = await dispatcher.dispatch(message);

    await repository.markSent(message, result);
    await repository.createDeliveryEvent({
      messageId: message.id,
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      eventType: DELIVERY_EVENT.SENT,
      payload: { source: "transactional-worker" },
    });

    return {
      skipped: false,
      messageId: message.id,
      provider: result.provider,
      providerMessageId: result.providerMessageId,
    };
  } catch (err) {
    await repository.markFailed(message, err);
    await repository.createDeliveryEvent({
      messageId: message.id,
      eventType: DELIVERY_EVENT.FAILED,
      payload: {
        source: "transactional-worker",
        error: err.message,
      },
    });
    throw err;
  }
}

function parseBody(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  return JSON.parse(raw);
}

module.exports = {
  processTransactionalSqsMessage,
};
