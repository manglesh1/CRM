const marketingTrackingService = require("../marketing/tracking/service");
const transactionalTracking = require("../transactional/tracking");

const MAILGUN_EVENT_MAP = {
  accepted: "sent",
  delivered: "delivered",
  opened: "open",
  clicked: "click",
  failed: "bounce",
  complained: "complaint",
  unsubscribed: "unsubscribe",
};

const POSTMARK_EVENT_MAP = {
  delivery: "delivered",
  open: "open",
  click: "click",
  bounce: "bounce",
  spamcomplaint: "complaint",
  subscriptionchange: "unsubscribe",
};

const SENDGRID_EVENT_MAP = {
  processed: "sent",
  delivered: "delivered",
  open: "open",
  click: "click",
  bounce: "bounce",
  dropped: "failed",
  spamreport: "complaint",
  unsubscribe: "unsubscribe",
  group_unsubscribe: "unsubscribe",
};

async function handleMailgunWebhook(body = {}) {
  const eventData = body["event-data"] || body.eventData || body;
  const rawEvent = String(eventData.event || eventData.Event || "").toLowerCase();
  const eventType = MAILGUN_EVENT_MAP[rawEvent] || null;
  const variables = eventData["user-variables"] || eventData.userVariables || eventData["user_variables"] || {};
  const taggedMessageId = variables.message_id || variables.messageId || null;
  const domain = String(variables.domain || "").toLowerCase();
  const providerMessageId =
    eventData.id ||
    eventData.message?.headers?.["message-id"] ||
    eventData.message?.headers?.messageId ||
    null;

  return routeProviderEvent({
    provider: "mailgun",
    domain,
    eventType,
    providerMessageId,
    taggedMessageId,
    notification: body,
  });
}

async function handlePostmarkWebhook(body = {}) {
  const rawEvent = String(body.RecordType || body.recordType || body.Type || "").toLowerCase();
  const eventType = POSTMARK_EVENT_MAP[rawEvent] || null;
  const metadata = body.Metadata || body.metadata || {};
  const taggedMessageId = metadata.message_id || metadata.messageId || null;
  const domain = String(metadata.domain || "").toLowerCase();
  const providerMessageId = body.MessageID || body.MessageId || body.MessageID || null;

  return routeProviderEvent({
    provider: "postmark",
    domain,
    eventType,
    providerMessageId,
    taggedMessageId,
    notification: body,
  });
}

async function handleSendgridWebhook(body = {}) {
  const events = Array.isArray(body) ? body : [body];
  const results = [];
  for (const event of events) {
    const rawEvent = String(event.event || "").toLowerCase();
    const eventType = SENDGRID_EVENT_MAP[rawEvent] || null;
    const taggedMessageId = event.message_id || event.messageId || null;
    const domain = String(event.domain || "").toLowerCase();
    const providerMessageId = event.sg_message_id || event.smtp_id || null;
    results.push(await routeProviderEvent({
      provider: "sendgrid",
      domain,
      eventType,
      providerMessageId,
      taggedMessageId,
      notification: event,
    }));
  }
  return {
    type: "sendgrid_events",
    total: results.length,
    results,
  };
}

async function routeProviderEvent({ provider, domain, eventType, providerMessageId, taggedMessageId, notification }) {
  if (!eventType) {
    return { ignored: true, reason: "unsupported_event_type", provider, providerMessageId, taggedMessageId };
  }

  if (domain === "transactional") {
    const result = await transactionalTracking.recordTransactionalProviderEvent({
      provider,
      eventType,
      providerMessageId,
      taggedMessageId,
      notification,
    });
    return { type: `${provider}_event`, domain: "transactional", result };
  }

  if (domain === "marketing") {
    if (!taggedMessageId) {
      return { type: `${provider}_event`, domain: "marketing", result: { ignored: true, reason: "message_id_missing", providerMessageId } };
    }
    const result = await marketingTrackingService.recordMarketingEvent(taggedMessageId, eventType, {
      source: `${provider}_webhook`,
      provider,
      providerMessageId,
      notification,
    });
    return { type: `${provider}_event`, domain: "marketing", result };
  }

  const transactionalResult = await transactionalTracking.recordTransactionalProviderEvent({
    provider,
    eventType,
    providerMessageId,
    taggedMessageId,
    notification,
  });
  if (transactionalResult.matched) {
    return { type: `${provider}_event`, domain: "transactional", result: transactionalResult };
  }

  return {
    type: `${provider}_event`,
    domain: "unmatched",
    result: transactionalResult,
  };
}

module.exports = {
  handleMailgunWebhook,
  handlePostmarkWebhook,
  handleSendgridWebhook,
};
