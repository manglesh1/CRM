const renderer = require("./templateRenderer");
const sesEmailProvider = require("../messaging-core/providers/sesEmailProvider");

async function dispatch(message) {
  if (message.channel !== "email") {
    throw new Error(`Transactional channel not implemented yet: ${message.channel}`);
  }

  const rendered = await renderer.renderTransactionalMessage(message);
  return sesEmailProvider.sendTransactionalEmail({
    to: message.recipientAddress,
    subject: rendered.subject,
    html: rendered.body,
    text: rendered.template.config?.textFallback,
    from: rendered.template.config?.from,
  });
}

module.exports = {
  dispatch,
};
