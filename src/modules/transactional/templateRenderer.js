const repository = require("./repository");
const { renderDesign, applyTracking } = require("../marketing/email/builder/renderer");
const { createDefaultDesign } = require("../marketing/email/builder/defaultDesign");

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

function renderTemplate(template, payload, { tracking = null } = {}) {
  const subject = interpolate(template.subject, payload);

  if (template.editorType === "design") {
    const rendered = renderDesign(template.designJson || createDefaultDesign(), {
      title: template.name,
      data: payload || {},
      tracking,
    });
    return {
      subject,
      body: rendered.html,
      text: interpolate(template.plainText, payload),
      template,
    };
  }

  return {
    subject,
    body: applyTracking(interpolate(template.body, payload), tracking),
    text: interpolate(template.plainText, payload),
    template,
  };
}

async function renderTransactionalMessage(message, options = {}) {
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

  return renderTemplate(template, message.payload, options);
}

module.exports = {
  renderTransactionalMessage,
  renderTemplate,
  interpolate,
};
