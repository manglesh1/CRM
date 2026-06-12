const { getModels } = require("../../../db/models");

async function createMessage(input) {
  const { CrmMarketingMessage } = getModels();
  return CrmMarketingMessage.create({
    locationId: input.locationId,
    campaignId: input.campaignId || null,
    templateId: input.templateId || null,
    channel: input.channel || "email",
    recipient: input.recipient,
    subject: input.subject || null,
    status: "pending",
    payload: input.payload || {},
    metadata: input.metadata || {},
  });
}

async function findMessageById(id) {
  const { CrmMarketingMessage } = getModels();
  return CrmMarketingMessage.findByPk(id);
}

async function findMessageByProviderMessageId(providerMessageId) {
  const { CrmMarketingMessage } = getModels();
  return CrmMarketingMessage.findOne({ where: { providerMessageId } });
}

async function markQueued(message, enqueueResult) {
  const metadata = {
    ...(message.metadata || {}),
    enqueue: enqueueResult || null,
  };
  return message.update({
    status: enqueueResult?.skipped ? "pending" : "queued",
    queuedAt: enqueueResult?.skipped ? message.queuedAt : new Date(),
    metadata,
  });
}

async function markSending(message) {
  return message.update({ status: "sending" });
}

async function markSent(message, { provider, providerMessageId, providerConfigId = null, senderDomainId = null, senderDomain = null }) {
  return message.update({
    status: "sent",
    provider,
    providerMessageId,
    sentAt: new Date(),
    metadata: {
      ...(message.metadata || {}),
      providerConfigId,
      senderDomainId,
      senderDomain,
    },
  });
}

async function markFailed(message, error) {
  return message.update({
    status: "failed",
    metadata: {
      ...(message.metadata || {}),
      lastError: error?.message || String(error || "Unknown error"),
      failedAt: new Date().toISOString(),
    },
  });
}

async function createDeliveryEvent(input) {
  const { CrmMarketingDeliveryEvent } = getModels();
  return CrmMarketingDeliveryEvent.create({
    messageId: input.messageId,
    campaignId: input.campaignId || null,
    provider: input.provider || "movira",
    providerMessageId: input.providerMessageId || null,
    eventType: input.eventType,
    payload: input.payload || {},
    occurredAt: input.occurredAt || new Date(),
  });
}

module.exports = {
  createMessage,
  findMessageById,
  findMessageByProviderMessageId,
  markQueued,
  markSending,
  markSent,
  markFailed,
  createDeliveryEvent,
};
