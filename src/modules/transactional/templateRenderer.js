const repository = require("./repository");

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

function getByPath(obj, path) {
  return String(path)
    .split(".")
    .reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function interpolate(input, payload) {
  if (!input) return "";
  return String(input).replace(TOKEN_RE, (_match, key) => {
    const value = getByPath(payload, key);
    return value == null ? "" : String(value);
  });
}

async function renderTransactionalMessage(message) {
  const template = await repository.findTemplate({
    locationId: message.locationId,
    key: message.templateKey,
    channel: message.channel,
  });

  if (!template) {
    throw new Error(
      `Transactional template not found: ${message.templateKey}/${message.channel}`
    );
  }

  return {
    subject: interpolate(template.subject, message.payload),
    body: interpolate(template.body, message.payload),
    template,
  };
}

module.exports = {
  renderTransactionalMessage,
  interpolate,
};
