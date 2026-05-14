const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ALLOWED_CHANNELS = new Set(["email"]);
const ALLOWED_PRIORITIES = new Set(["critical", "high", "normal"]);

function validateIngestEvent(body = {}) {
  const errors = [];

  if (!body.eventType || typeof body.eventType !== "string") {
    errors.push("eventType is required");
  }
  if (body.locationId === undefined || body.locationId === null || body.locationId === "") {
    errors.push("locationId is required");
  } else if (Number.isNaN(Number(body.locationId))) {
    errors.push("locationId must be numeric");
  }
  if (!body.idempotencyKey || typeof body.idempotencyKey !== "string") {
    errors.push("idempotencyKey is required");
  }

  const channel = String(body.channel || "email").toLowerCase();
  if (!ALLOWED_CHANNELS.has(channel)) {
    errors.push("channel must be 'email' (other channels not yet supported)");
  }

  const recipient = body.recipient || {};
  if (channel === "email") {
    if (!recipient.email || !EMAIL_RE.test(recipient.email)) {
      errors.push("recipient.email is required and must be a valid email");
    }
  }

  if (body.priority && !ALLOWED_PRIORITIES.has(String(body.priority).toLowerCase())) {
    errors.push(`priority must be one of: ${[...ALLOWED_PRIORITIES].join(", ")}`);
  }

  if (body.payload !== undefined && (typeof body.payload !== "object" || Array.isArray(body.payload))) {
    errors.push("payload must be an object");
  }

  if (body.attachments !== undefined && !Array.isArray(body.attachments)) {
    errors.push("attachments must be an array");
  }

  return {
    ok: errors.length === 0,
    errors,
    value: {
      eventType: String(body.eventType || "").trim(),
      locationId: errors.length === 0 ? Number(body.locationId) : null,
      channel,
      priority: String(body.priority || "normal").toLowerCase(),
      recipient: {
        email: String(recipient.email || "").trim(),
        name: recipient.name ? String(recipient.name).trim() : null,
      },
      payload: body.payload && typeof body.payload === "object" ? body.payload : {},
      attachments: Array.isArray(body.attachments) ? body.attachments : [],
      idempotencyKey: String(body.idempotencyKey || "").trim(),
      sourceSystem: body.sourceSystem ? String(body.sourceSystem).trim() : null,
      sourceResourceType: body.sourceResourceType ? String(body.sourceResourceType).trim() : null,
      sourceResourceId: body.sourceResourceId ? String(body.sourceResourceId).trim() : null,
    },
  };
}

function validateBindingInput(body = {}, { partial = false } = {}) {
  const errors = [];

  if (!partial || body.eventType !== undefined) {
    if (!body.eventType || typeof body.eventType !== "string") {
      errors.push("eventType is required");
    }
  }
  if (!partial || body.templateKey !== undefined) {
    if (!body.templateKey || typeof body.templateKey !== "string") {
      errors.push("templateKey is required");
    }
  }

  const channel = body.channel ? String(body.channel).toLowerCase() : "email";
  if (!ALLOWED_CHANNELS.has(channel)) {
    errors.push("channel must be 'email' (other channels not yet supported)");
  }

  if (body.priority && !ALLOWED_PRIORITIES.has(String(body.priority).toLowerCase())) {
    errors.push(`priority must be one of: ${[...ALLOWED_PRIORITIES].join(", ")}`);
  }

  if (
    body.variableMap !== undefined &&
    (typeof body.variableMap !== "object" || Array.isArray(body.variableMap))
  ) {
    errors.push("variableMap must be an object");
  }

  if (
    body.locationId !== undefined &&
    body.locationId !== null &&
    Number.isNaN(Number(body.locationId))
  ) {
    errors.push("locationId must be numeric or null");
  }

  return {
    ok: errors.length === 0,
    errors,
    value: {
      eventType: body.eventType ? String(body.eventType).trim() : undefined,
      channel,
      locationId:
        body.locationId === null || body.locationId === undefined || body.locationId === ""
          ? null
          : Number(body.locationId),
      templateKey: body.templateKey ? String(body.templateKey).trim() : undefined,
      priority: body.priority ? String(body.priority).toLowerCase() : "normal",
      variableMap:
        body.variableMap && typeof body.variableMap === "object" ? body.variableMap : {},
      isActive: body.isActive === undefined ? true : Boolean(body.isActive),
      notes: body.notes ? String(body.notes) : null,
    },
  };
}

module.exports = {
  validateIngestEvent,
  validateBindingInput,
  ALLOWED_CHANNELS,
};
