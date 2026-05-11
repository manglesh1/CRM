const { CHANNELS, PRIORITIES } = require("./constants");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_RE = /^\+[1-9]\d{6,14}$/;

function validateRecipient(channel, recipientAddress) {
  if (!recipientAddress) return "recipientAddress is required";
  if (channel === "email" && !EMAIL_RE.test(recipientAddress)) {
    return "recipientAddress must be a valid email address";
  }
  if ((channel === "sms" || channel === "whatsapp") && !E164_RE.test(recipientAddress)) {
    return "recipientAddress must be E.164 format for SMS/WhatsApp";
  }
  return null;
}

function validateCreateMessage(body = {}) {
  const errors = [];

  const channel = String(body.channel || "email").toLowerCase();
  const priority = String(body.priority || "normal").toLowerCase();

  if (!body.locationId) errors.push("locationId is required");
  if (!body.sourceEventType) errors.push("sourceEventType is required");
  if (!body.templateKey) errors.push("templateKey is required");
  if (!body.idempotencyKey) errors.push("idempotencyKey is required");
  if (!CHANNELS.has(channel)) errors.push(`channel must be one of: ${[...CHANNELS].join(", ")}`);
  if (!PRIORITIES.has(priority)) {
    errors.push(`priority must be one of: ${[...PRIORITIES].join(", ")}`);
  }

  const recipientError = validateRecipient(channel, body.recipientAddress);
  if (recipientError) errors.push(recipientError);

  return {
    ok: errors.length === 0,
    errors,
    value: {
      locationId: Number(body.locationId),
      sourceSystem: body.sourceSystem || "aeroSportsAdmin",
      sourceEventType: String(body.sourceEventType || "").trim(),
      sourceResourceType: body.sourceResourceType || null,
      sourceResourceId: body.sourceResourceId ? String(body.sourceResourceId) : null,
      channel,
      recipientAddress: String(body.recipientAddress || "").trim(),
      templateKey: String(body.templateKey || "").trim(),
      templateVersionId: body.templateVersionId || null,
      payload: body.payload && typeof body.payload === "object" ? body.payload : {},
      priority,
      idempotencyKey: String(body.idempotencyKey || "").trim(),
    },
  };
}

module.exports = {
  validateCreateMessage,
};
