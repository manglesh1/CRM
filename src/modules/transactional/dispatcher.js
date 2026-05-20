const renderer = require("./templateRenderer");
const emailProvider = require("../messaging-core/providers/emailProviderRouter");
const config = require("../../config");

function trackingUrls(messageId) {
  const base = config.urls.trackingBaseUrl || config.urls.publicBaseUrl;
  if (!base) return null;
  return {
    openPixelUrl: `${base}/t/open/${messageId}.gif`,
    clickBaseUrl: `${base}/t/click/${messageId}`,
  };
}

async function dispatch(message) {
  if (message.channel !== "email") {
    throw new Error(`Transactional channel not implemented yet: ${message.channel}`);
  }

  const rendered = await renderer.renderTransactionalMessage(message, {
    tracking: trackingUrls(message.id),
  });
  const attachments = (message.attachments || []).map((a) => ({
    filename: a.filename || "attachment",
    content: a.encoding === "base64" && typeof a.content === "string"
      ? Buffer.from(a.content, "base64")
      : a.content,
    contentType: a.contentType || undefined,
  }));
  const testOverrides = message.payload?.__test || {};
  return emailProvider.sendTransactionalEmail({
    locationId: message.locationId,
    to: message.recipientAddress,
    subject: testOverrides.requestedSubject || rendered.subject,
    html: rendered.body,
    text: rendered.text || rendered.template.config?.textFallback,
    from: testOverrides.requestedFrom || rendered.template.config?.from,
    attachments,
    messageId: message.id,
  });
}

module.exports = {
  dispatch,
};
