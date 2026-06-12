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

async function markSent(message, { provider, providerMessageId, providerConfigId = null, senderDomainId = null, senderDomain = null }) {
  return message.update({
    status: STATUS.SENT,
    provider,
    providerMessageId,
    sentAt: new Date(),
    lastError: null,
    payload: {
      ...(message.payload || {}),
      _sender: {
        providerConfigId,
        senderDomainId,
        senderDomain,
      },
    },
  });
}

async function markFailed(message, error) {
  return message.update({
    status: STATUS.FAILED,
    failedAt: new Date(),
    lastError: error?.message || String(error || "Unknown error"),
  });
}

async function markSuppressed(message, suppression) {
  await message.update({
    status: STATUS.CANCELLED,
    lastError: "recipient_suppressed",
  });
  await createDeliveryEvent({
    messageId: message.id,
    eventType: "suppressed",
    payload: {
      source: "transactional-suppression",
      suppressionId: suppression?.id || null,
      reason: suppression?.reason || null,
    },
  });
  return message;
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

async function findTemplateByKey({ locationId = null, key, channel = "email" }) {
  const { TransactionalTemplate } = getModels();
  const { Op } = require("sequelize");
  return TransactionalTemplate.findOne({
    where: {
      locationId: locationId === null ? { [Op.is]: null } : locationId,
      key,
      channel,
    },
  });
}

async function createTemplate(data) {
  const { TransactionalTemplate } = getModels();
  return TransactionalTemplate.create(data);
}

async function updateTemplate(template, data) {
  return template.update(data);
}

async function deleteTemplate(template) {
  return template.destroy();
}

async function findBindingsForTemplate(templateKey) {
  const { CrmEventTemplateBinding } = getModels();
  return CrmEventTemplateBinding.findAll({
    where: { templateKey },
    order: [
      ["eventType", "ASC"],
      ["locationId", "ASC"],
    ],
  });
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
  markSuppressed,
  createDeliveryEvent,
  listTemplates,
  findTemplateById,
  findTemplateByKey,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  findBindingsForTemplate,
};
