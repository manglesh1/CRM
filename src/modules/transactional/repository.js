const { getModels } = require("../../db/models");
const { STATUS } = require("./constants");

async function findByIdempotencyKey(idempotencyKey) {
  const { TransactionalMessage } = getModels();
  return TransactionalMessage.findOne({ where: { idempotencyKey } });
}

async function createMessage(data) {
  const { TransactionalMessage } = getModels();
  return TransactionalMessage.create({
    ...data,
    status: STATUS.PENDING,
  });
}

async function markQueued(message, enqueueResult) {
  const status = enqueueResult?.skipped ? STATUS.ENQUEUE_SKIPPED : STATUS.QUEUED;
  return message.update({
    status,
    queuedAt: enqueueResult?.skipped ? null : new Date(),
    lastError: enqueueResult?.skipped ? enqueueResult.reason : null,
  });
}

async function findMessageById(id) {
  const { TransactionalMessage } = getModels();
  return TransactionalMessage.findByPk(id);
}

async function findTemplate({ locationId, key, channel }) {
  const { TransactionalTemplate } = getModels();
  const { Op } = require("sequelize");

  return (
    (await TransactionalTemplate.findOne({
      where: {
        locationId,
        key,
        channel,
        isActive: true,
      },
    })) ||
    (await TransactionalTemplate.findOne({
      where: {
        locationId: { [Op.is]: null },
        key,
        channel,
        isSystem: true,
        isActive: true,
      },
    }))
  );
}

async function markSending(message) {
  return message.update({
    status: STATUS.SENDING,
    lastError: null,
  });
}

async function markSent(message, { provider, providerMessageId }) {
  return message.update({
    status: STATUS.SENT,
    provider,
    providerMessageId,
    sentAt: new Date(),
    lastError: null,
  });
}

async function markFailed(message, error) {
  return message.update({
    status: STATUS.FAILED,
    failedAt: new Date(),
    lastError: error?.message || String(error || "Unknown error"),
  });
}

async function createDeliveryEvent({
  messageId,
  provider = null,
  providerMessageId = null,
  eventType,
  payload = {},
  occurredAt = new Date(),
}) {
  const { TransactionalDeliveryEvent } = getModels();
  return TransactionalDeliveryEvent.create({
    messageId,
    provider,
    providerMessageId,
    eventType,
    payload,
    occurredAt,
  });
}

async function listTemplates({ locationId = null, channel = null } = {}) {
  const { TransactionalTemplate } = getModels();
  const { Op } = require("sequelize");
  const where = {
    isActive: true,
  };

  if (locationId) {
    where[Op.or] = [{ locationId }, { locationId: { [Op.is]: null } }];
  }
  if (channel) where.channel = channel;

  return TransactionalTemplate.findAll({
    where,
    order: [
      ["category", "ASC"],
      ["name", "ASC"],
    ],
  });
}

async function findTemplateById(id) {
  const { TransactionalTemplate } = getModels();
  return TransactionalTemplate.findByPk(id);
}

module.exports = {
  findByIdempotencyKey,
  createMessage,
  markQueued,
  findMessageById,
  findTemplate,
  markSending,
  markSent,
  markFailed,
  createDeliveryEvent,
  listTemplates,
  findTemplateById,
};
