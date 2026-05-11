const marketingTrackingService = require("../marketing/tracking/service");
const { Op } = require("sequelize");
const { getModels } = require("../../db/models");

async function handleSesWebhook(body = {}) {
  const notification = unwrapSnsEnvelope(body);

  if (notification.kind === "subscription_confirmation") {
    return {
      type: "subscription_confirmation",
      subscribeUrl: notification.subscribeUrl,
      note: "Confirm this SNS subscription from AWS or an admin task.",
    };
  }

  if (!notification.payload) {
    return { ignored: true, reason: "empty_payload" };
  }

  const result = await marketingTrackingService.recordSesEvent(notification.payload);
  return {
    type: "ses_event",
    result,
  };
}

async function listSimulatorMessages({ locationId, q, status, page = 1, pageSize = 25 } = {}) {
  if (!locationId) {
    const err = new Error("locationId is required");
    err.statusCode = 400;
    throw err;
  }
  const { CrmMarketingMessage, CrmMarketingCampaign } = getModels();
  const where = { locationId: Number(locationId) };
  if (status) where.status = status;
  if (q) {
    where[Op.or] = [
      { recipient: { [Op.iLike]: `%${q}%` } },
      { subject: { [Op.iLike]: `%${q}%` } },
      { providerMessageId: { [Op.iLike]: `%${q}%` } },
    ];
  }
  const limit = Math.min(100, Math.max(1, Number(pageSize) || 25));
  const offset = Math.max(0, (Number(page) - 1) * limit);
  const { rows, count } = await CrmMarketingMessage.findAndCountAll({
    where,
    include: [{ model: CrmMarketingCampaign, as: "campaign", required: false }],
    order: [["updatedAt", "DESC"]],
    limit,
    offset,
  });
  return {
    items: rows.map(serializeMessage),
    total: count,
    page: Number(page) || 1,
    pageSize: limit,
  };
}

async function simulateSesWebhook({ messageId, eventType = "Delivery", snsEnvelope = false, bounceType = "Permanent", complaintFeedbackType = "abuse", destinationUrl } = {}) {
  if (!messageId) {
    const err = new Error("messageId is required");
    err.statusCode = 400;
    throw err;
  }
  const { CrmMarketingMessage } = getModels();
  const message = await CrmMarketingMessage.findByPk(messageId);
  if (!message) {
    const err = new Error("Marketing message not found");
    err.statusCode = 404;
    throw err;
  }

  const payload = buildSesNotification(message, {
    eventType,
    bounceType,
    complaintFeedbackType,
    destinationUrl,
  });
  const body = snsEnvelope
    ? {
        Type: "Notification",
        MessageId: `local-sns-${message.id}`,
        TopicArn: "arn:aws:sns:local:000000000000:movira-ses-simulator",
        Message: JSON.stringify(payload),
        Timestamp: new Date().toISOString(),
      }
    : payload;
  const result = await handleSesWebhook(body);
  return {
    input: {
      messageId,
      eventType,
      snsEnvelope,
      bounceType,
      complaintFeedbackType,
    },
    payload,
    body,
    result,
  };
}

function unwrapSnsEnvelope(body = {}) {
  if (body.Type === "SubscriptionConfirmation") {
    return {
      kind: "subscription_confirmation",
      subscribeUrl: body.SubscribeURL || body.SubscribeUrl || null,
    };
  }

  if (body.Type === "Notification" && body.Message) {
    try {
      return { kind: "notification", payload: JSON.parse(body.Message) };
    } catch (_err) {
      return { kind: "notification", payload: null };
    }
  }

  return { kind: "notification", payload: body };
}

function serializeMessage(row) {
  return {
    id: row.id,
    campaignId: row.campaignId,
    templateId: row.templateId,
    recipient: row.recipient,
    subject: row.subject,
    status: row.status,
    provider: row.provider,
    providerMessageId: row.providerMessageId,
    campaign: row.campaign ? {
      id: row.campaign.id,
      name: row.campaign.name,
      status: row.campaign.status,
    } : null,
    sentAt: row.sentAt,
    deliveredAt: row.deliveredAt,
    openedAt: row.openedAt,
    clickedAt: row.clickedAt,
    bouncedAt: row.bouncedAt,
    complainedAt: row.complainedAt,
    unsubscribedAt: row.unsubscribedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function buildSesNotification(message, { eventType, bounceType, complaintFeedbackType, destinationUrl }) {
  const normalized = normalizeSimulatorEvent(eventType);
  const providerMessageId = message.providerMessageId || `simulated-ses-${message.id}`;
  const timestamp = new Date().toISOString();
  const mail = {
    timestamp,
    source: message.payload?.from || "local-ses-simulator@movira.test",
    messageId: providerMessageId,
    destination: [message.recipient],
    tags: {
      domain: ["marketing"],
      message_id: [message.id],
      ...(message.campaignId ? { campaign_id: [message.campaignId] } : {}),
      ...(message.templateId ? { template_id: [message.templateId] } : {}),
    },
  };
  const payload = {
    eventType: normalized,
    mail,
  };

  if (normalized === "Delivery") {
    payload.delivery = {
      timestamp,
      processingTimeMillis: 482,
      recipients: [message.recipient],
      smtpResponse: "250 2.0.0 Ok: queued as local-simulator",
    };
  } else if (normalized === "Bounce") {
    payload.bounce = {
      timestamp,
      bounceType,
      bounceSubType: bounceType === "Permanent" ? "General" : "MailboxFull",
      bouncedRecipients: [
        {
          emailAddress: message.recipient,
          action: "failed",
          status: bounceType === "Permanent" ? "5.1.1" : "4.2.2",
          diagnosticCode: bounceType === "Permanent"
            ? "smtp; 550 5.1.1 user unknown"
            : "smtp; 452 4.2.2 mailbox full",
        },
      ],
    };
  } else if (normalized === "Complaint") {
    payload.complaint = {
      timestamp,
      complainedRecipients: [{ emailAddress: message.recipient }],
      complaintFeedbackType,
      arrivalDate: timestamp,
    };
  } else if (normalized === "Open") {
    payload.open = {
      timestamp,
      ipAddress: "127.0.0.1",
      userAgent: "Movira SES Simulator",
    };
  } else if (normalized === "Click") {
    payload.click = {
      timestamp,
      ipAddress: "127.0.0.1",
      userAgent: "Movira SES Simulator",
      link: destinationUrl || "https://example.test/ses-simulator-click",
      linkTags: null,
    };
  } else if (normalized === "Reject") {
    payload.reject = {
      reason: "Local SES simulator forced reject",
    };
  }

  return payload;
}

function normalizeSimulatorEvent(value) {
  const key = String(value || "").toLowerCase();
  if (key === "delivery" || key === "delivered") return "Delivery";
  if (key === "bounce" || key === "bounced") return "Bounce";
  if (key === "complaint" || key === "complained") return "Complaint";
  if (key === "open" || key === "opened") return "Open";
  if (key === "click" || key === "clicked") return "Click";
  if (key === "send" || key === "sent") return "Send";
  if (key === "reject" || key === "failed") return "Reject";
  return value || "Delivery";
}

module.exports = {
  handleSesWebhook,
  listSimulatorMessages,
  simulateSesWebhook,
};
