const repository = require("./repository");
const { renderTemplate } = require("./templateRenderer");
const emailProvider = require("../messaging-core/providers/emailProviderRouter");
const auditService = require("../audit/service");

async function safeAudit(input) {
  try {
    await auditService.recordAuditLog(input);
  } catch (err) {
    // Audit must never block the operation
    console.error("[audit] failed:", err.message);
  }
}

const ALLOWED_EDITOR_TYPES = new Set(["code", "design", "plain"]);
const ALLOWED_CHANNELS = new Set(["email"]);
const KEY_RE = /^[a-zA-Z0-9_-]+$/;

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function serializeTemplate(row, { bindings } = {}) {
  return {
    id: row.id,
    locationId: row.locationId,
    key: row.key,
    slug: row.key,
    channel: row.channel,
    channels: ["email"],
    name: row.name,
    category: row.category,
    family: row.family || null,
    description: row.description || null,
    templateType: "email",
    subject: row.subject,
    body: row.body,
    editorType: row.editorType,
    designJson: row.designJson || null,
    plainText: row.plainText || null,
    config: row.config || {},
    defaults: row.defaults || {},
    variables: row.variables || [],
    isSystem: row.isSystem,
    isActive: row.isActive,
    updatedByUserId: row.updatedByUserId,
    updatedByName: row.updatedByName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(bindings ? { bindings: bindings.map(serializeBinding) } : {}),
  };
}

function serializeBinding(b) {
  return {
    id: b.id,
    eventType: b.eventType,
    channel: b.channel,
    locationId: b.locationId,
    priority: b.priority,
    isActive: b.isActive,
  };
}

async function listTemplates(query = {}) {
  const rows = await repository.listTemplates({
    locationId: query.locationId ? Number(query.locationId) : null,
    channel: query.channel || null,
  });

  if (!query.includeBindings) return rows.map((r) => serializeTemplate(r));

  const out = [];
  for (const row of rows) {
    const bindings = await repository.findBindingsForTemplate(row.key);
    out.push(serializeTemplate(row, { bindings }));
  }
  return out;
}

async function getTemplate(id, { includeBindings = true } = {}) {
  const row = await repository.findTemplateById(id);
  if (!row) throw httpError(404, "Template not found");
  const bindings = includeBindings ? await repository.findBindingsForTemplate(row.key) : null;
  return serializeTemplate(row, bindings ? { bindings } : {});
}

function validateInput(body, { partial = false } = {}) {
  const errors = [];

  if (!partial || body.name !== undefined) {
    if (!body.name || typeof body.name !== "string") errors.push("name is required");
  }
  if (!partial || body.key !== undefined) {
    if (!body.key || typeof body.key !== "string") {
      errors.push("key is required");
    } else if (!KEY_RE.test(body.key)) {
      errors.push("key must be alphanumeric with hyphens/underscores only");
    }
  }

  const channel = body.channel ? String(body.channel).toLowerCase() : "email";
  if (!ALLOWED_CHANNELS.has(channel)) errors.push("channel must be 'email'");

  const editorType = body.editorType ? String(body.editorType).toLowerCase() : "code";
  if (!ALLOWED_EDITOR_TYPES.has(editorType)) {
    errors.push(`editorType must be one of: ${[...ALLOWED_EDITOR_TYPES].join(", ")}`);
  }

  if (editorType !== "design" && !partial && !body.body) {
    errors.push("body is required for code/plain editor types");
  }
  if (editorType === "design" && !partial && !body.designJson) {
    errors.push("designJson is required when editorType is 'design'");
  }

  if (
    body.designJson !== undefined &&
    body.designJson !== null &&
    (typeof body.designJson !== "object" || Array.isArray(body.designJson))
  ) {
    errors.push("designJson must be an object");
  }
  if (body.variables !== undefined && !Array.isArray(body.variables)) {
    errors.push("variables must be an array of strings");
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
      name: body.name?.trim(),
      key: body.key?.trim(),
      channel,
      editorType,
      locationId:
        body.locationId === null || body.locationId === undefined || body.locationId === ""
          ? null
          : Number(body.locationId),
      category: body.category ? String(body.category).trim() : "booking",
      family: body.family ? String(body.family).trim() : null,
      description: body.description ? String(body.description) : null,
      subject: body.subject ? String(body.subject) : null,
      body: body.body != null ? String(body.body) : "",
      designJson: body.designJson || null,
      plainText: body.plainText != null ? String(body.plainText) : null,
      config: body.config && typeof body.config === "object" ? body.config : {},
      defaults: body.defaults && typeof body.defaults === "object" ? body.defaults : {},
      variables: Array.isArray(body.variables) ? body.variables : [],
      isSystem: body.isSystem === true,
      isActive: body.isActive !== false,
    },
  };
}

async function createTemplate(body, user) {
  const v = validateInput(body);
  if (!v.ok) throw httpError(400, v.errors.join("; "));

  const existing = await repository.findTemplateByKey({
    locationId: v.value.locationId,
    key: v.value.key,
    channel: v.value.channel,
  });
  if (existing) {
    throw httpError(
      409,
      `Template already exists with key '${v.value.key}' for ${v.value.locationId == null ? "system" : `location ${v.value.locationId}`}`
    );
  }

  const created = await repository.createTemplate({
    ...v.value,
    updatedByUserId: user?.id || null,
    updatedByName: user?.name || null,
  });
  await safeAudit({
    locationId: created.locationId,
    action: "template.create",
    entityType: "transactional_template",
    entityId: created.id,
    entityName: created.name,
    actorUserId: user?.id || null,
    actorName: user?.name || null,
    metadata: { key: created.key, channel: created.channel, family: created.family },
  });
  return serializeTemplate(created);
}

async function updateTemplate(id, body, user) {
  const row = await repository.findTemplateById(id);
  if (!row) throw httpError(404, "Template not found");

  if (row.isSystem) {
    // System templates are read-only. Only isActive toggle is permitted
    // so admins can deactivate a system template without cloning. To
    // customize content, callers must clone first.
    const allowedFields = new Set(["isActive"]);
    const requested = Object.keys(body || {}).filter((k) => body[k] !== undefined);
    const disallowed = requested.filter((k) => !allowedFields.has(k));
    if (disallowed.length > 0) {
      throw httpError(
        400,
        `System templates are read-only. Clone this template first to customize. (rejected fields: ${disallowed.join(", ")})`
      );
    }
    if (body.isActive === undefined) return serializeTemplate(row);
    const updated = await repository.updateTemplate(row, {
      isActive: Boolean(body.isActive),
    });
    await safeAudit({
      locationId: updated.locationId,
      action: "template.toggle_active",
      entityType: "transactional_template",
      entityId: updated.id,
      entityName: updated.name,
      actorUserId: user?.id || null,
      actorName: user?.name || null,
      metadata: { isActive: updated.isActive, isSystem: true },
    });
    return serializeTemplate(updated);
  }

  const merged = { ...row.toJSON(), ...body };
  const v = validateInput(merged, { partial: true });
  if (!v.ok) throw httpError(400, v.errors.join("; "));

  const patch = {};
  for (const key of [
    "name",
    "category",
    "family",
    "description",
    "subject",
    "body",
    "editorType",
    "designJson",
    "plainText",
    "config",
    "defaults",
    "variables",
    "isActive",
  ]) {
    if (body[key] !== undefined) patch[key] = v.value[key];
  }
  if (body.key !== undefined) patch.key = v.value.key;
  if (user) {
    patch.updatedByUserId = user.id || null;
    patch.updatedByName = user.name || null;
  }

  const updated = await repository.updateTemplate(row, patch);
  await safeAudit({
    locationId: updated.locationId,
    action: "template.update",
    entityType: "transactional_template",
    entityId: updated.id,
    entityName: updated.name,
    actorUserId: user?.id || null,
    actorName: user?.name || null,
    metadata: { changedFields: Object.keys(patch), key: updated.key },
  });
  return serializeTemplate(updated);
}

async function deleteTemplate(id) {
  const row = await repository.findTemplateById(id);
  if (!row) throw httpError(404, "Template not found");
  if (row.isSystem) {
    throw httpError(400, "System templates cannot be deleted (set isActive=false instead)");
  }
  const bindings = await repository.findBindingsForTemplate(row.key);
  if (bindings.length > 0) {
    throw httpError(
      409,
      `Template is referenced by ${bindings.length} active binding(s); remove them first`
    );
  }
  await repository.deleteTemplate(row);
  await safeAudit({
    locationId: row.locationId,
    action: "template.delete",
    entityType: "transactional_template",
    entityId: row.id,
    entityName: row.name,
    metadata: { key: row.key },
  });
  return { id };
}

async function cloneTemplate(id, body = {}, user) {
  const row = await repository.findTemplateById(id);
  if (!row) throw httpError(404, "Template not found");

  const newKey = body.key || `${row.key}-copy-${Date.now()}`;
  const newName = body.name || `${row.name} (copy)`;

  const existing = await repository.findTemplateByKey({
    locationId: body.locationId ?? row.locationId,
    key: newKey,
    channel: row.channel,
  });
  if (existing) throw httpError(409, `Template '${newKey}' already exists`);

  const clone = await repository.createTemplate({
    locationId: body.locationId ?? row.locationId,
    key: newKey,
    channel: row.channel,
    name: newName,
    category: row.category,
    family: row.family,
    description: row.description,
    subject: row.subject,
    body: row.body,
    editorType: row.editorType,
    designJson: row.designJson,
    plainText: row.plainText,
    config: row.config,
    defaults: row.defaults,
    variables: row.variables,
    isSystem: false,
    isActive: true,
    updatedByUserId: user?.id || null,
    updatedByName: user?.name || null,
  });
  await safeAudit({
    locationId: clone.locationId,
    action: "template.clone",
    entityType: "transactional_template",
    entityId: clone.id,
    entityName: clone.name,
    actorUserId: user?.id || null,
    actorName: user?.name || null,
    metadata: { sourceId: row.id, sourceKey: row.key, newKey },
  });
  return serializeTemplate(clone);
}

async function testSendTemplate(id, { to, data, subject, from, locationId } = {}) {
  if (!to) throw httpError(400, "'to' is required");
  const row = await repository.findTemplateById(id);
  if (!row) throw httpError(404, "Template not found");

  const samplePayload = data && typeof data === "object" ? data : {};
  const rendered = renderTemplate(row, samplePayload);
  const effectiveLocationId =
    row.locationId || (locationId === null || locationId === undefined || locationId === "" ? null : Number(locationId));

  let result;
  try {
    result = await emailProvider.sendTransactionalEmail({
      locationId: effectiveLocationId,
      to,
      subject: subject || `[Test] ${rendered.subject || row.name}`,
      html: rendered.body,
      text: rendered.text || row.config?.textFallback,
      from: from || row.config?.from,
    });
  } catch (err) {
    throw httpError(502, err?.message || "Email provider test send failed");
  }

  return {
    sent: true,
    provider: result?.provider || "ses",
    providerMessageId: result?.providerMessageId || null,
  };
}

async function renderDraft({ designJson, htmlBody, plainText, subject, name, editorType = "design", data = {} } = {}) {
  const fakeTemplate = {
    name: name || "Draft",
    subject,
    body: htmlBody || "",
    plainText: plainText || "",
    designJson: designJson || null,
    editorType,
    config: {},
  };
  const rendered = renderTemplate(fakeTemplate, data);
  return {
    subject: rendered.subject,
    html: rendered.body,
    text: rendered.text,
  };
}

module.exports = {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  cloneTemplate,
  testSendTemplate,
  renderDraft,
};
