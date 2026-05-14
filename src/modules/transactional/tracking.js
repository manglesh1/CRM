const { getModels } = require("../../db/models");
const { DELIVERY_EVENT, STATUS } = require("./constants");
const repository = require("./repository");

const SES_EVENT_TO_STATUS = {
  delivered: { status: STATUS.DELIVERED, field: "deliveredAt", deliveryEvent: DELIVERY_EVENT.DELIVERED },
  bounce: { status: STATUS.FAILED, field: "failedAt", deliveryEvent: DELIVERY_EVENT.BOUNCED },
  complaint: { status: null, field: null, deliveryEvent: DELIVERY_EVENT.COMPLAINED },
  open: { status: null, field: null, deliveryEvent: DELIVERY_EVENT.OPENED },
  click: { status: null, field: null, deliveryEvent: DELIVERY_EVENT.CLICKED },
  sent: { status: null, field: null, deliveryEvent: DELIVERY_EVENT.SENT },
  failed: { status: STATUS.FAILED, field: "failedAt", deliveryEvent: DELIVERY_EVENT.FAILED },
};

async function findTransactionalMessage({ providerMessageId, taggedMessageId }) {
  const { TransactionalMessage } = getModels();
  if (taggedMessageId) {
    const byTag = await TransactionalMessage.findByPk(taggedMessageId);
    if (byTag) return byTag;
  }
  if (providerMessageId) {
    return TransactionalMessage.findOne({ where: { providerMessageId } });
  }
  return null;
}

async function recordTransactionalSesEvent({ eventType, providerMessageId, taggedMessageId, notification }) {
  const message = await findTransactionalMessage({ providerMessageId, taggedMessageId });
  if (!message) {
    return { matched: false, providerMessageId };
  }

  const mapping = SES_EVENT_TO_STATUS[eventType];
  if (!mapping) {
    return { matched: true, ignored: true, reason: "unmapped_event", eventType };
  }

  await repository.createDeliveryEvent({
    messageId: message.id,
    provider: "ses",
    providerMessageId,
    eventType: mapping.deliveryEvent,
    payload: {
      source: "ses_webhook",
      sesEventType: notification.eventType || notification.notificationType || null,
      bounce: notification.bounce || null,
      complaint: notification.complaint || null,
      delivery: notification.delivery || null,
      open: notification.open || null,
      click: notification.click || null,
    },
  });

  if (mapping.status) {
    const update = { status: mapping.status };
    if (mapping.field && !message[mapping.field]) {
      update[mapping.field] = new Date();
    }
    if (mapping.status === STATUS.FAILED && eventType === "bounce") {
      const bounceMsg =
        notification.bounce?.bounceType ||
        notification.bounce?.bouncedRecipients?.[0]?.diagnosticCode ||
        "Bounced";
      update.lastError = `bounce: ${bounceMsg}`;
    }
    await message.update(update);
  }

  return {
    matched: true,
    messageId: message.id,
    eventType: mapping.deliveryEvent,
  };
}

module.exports = {
  recordTransactionalSesEvent,
};
