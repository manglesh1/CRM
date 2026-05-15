const renderer = require("./templateRenderer");
const emailProvider = require("../messaging-core/providers/emailProviderRouter");

async function dispatch(message) {
  if (message.channel !== "email") {
    throw new Error(`Transactional channel not implemented yet: ${message.channel}`);
  }

  const rendered = await renderer.renderTransactionalMessage(message);
  const attachments = (message.attachments || []).map((a) => ({
    filename: a.filename || "attachment",
    content: a.encoding === "base64" && typeof a.content === "string"
      ? Buffer.from(a.content, "base64")
      : a.content,
    contentType: a.contentType || undefined,
  }));
  return emailProvider.sendTransactionalEmail({
    locationId: message.locationId,
    to: message.recipientAddress,
    subject: rendered.subject,
    html: rendered.body,
    text: rendered.text || rendered.template.config?.textFallback,
    from: rendered.template.config?.from,
    attachments,
    messageId: message.id,
  });
}

module.exports = {
  dispatch,
};
