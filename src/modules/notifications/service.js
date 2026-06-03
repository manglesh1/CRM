const repository = require("./repository");
const eventRegistry = require("./eventRegistry");
const { buildVariables } = require("./variableMapper");
const { validateIngestEvent, validateBindingInput } = require("./validation");
const transactionalService = require("../transactional/service");
const auditService = require("../audit/service");
const contactService = require("../contacts/service");
const queueJobs = require("../queueJobs/service");

async function safeAudit(input) {
  try {
    await auditService.recordAuditLog(input);
  } catch (err) {
    console.error("[audit] failed:", err.message);
  }
}

function httpError(statusCode, message, extra = {}) {
  const err = new Error(message);
  err.statusCode = statusCode;
  Object.assign(err, extra);
  return err;
}

async function ingestEvent(body) {
  const validation = validateIngestEvent(body);
  if (!validation.ok) {
    throw httpError(400, validation.errors.join("; "));
  }

  const event = validation.value;

  if (!eventRegistry.isRegistered(event.eventType)) {
    throw httpError(400, `Unknown eventType: ${event.eventType}`, {
      code: "unknown_event_type",
    });
  }

  const binding = await repository.findActiveBinding({
    eventType: event.eventType,
    channel: event.channel,
    locationId: event.locationId,
  });

  if (!binding) {
    throw httpError(
      422,
      `No active binding found for eventType=${event.eventType} channel=${event.channel}`,
      { code: "binding_not_found" }
    );
  }

  const variables = buildVariables(event.payload, binding.variableMap);
  const eventMeta = eventRegistry.getEvent(event.eventType) || {};

  const transactionalRequest = {
    locationId: event.locationId,
    sourceSystem: event.sourceSystem || eventMeta.sourceSystem || "aeroSportsAdmin",
    sourceEventType: event.eventType,
    sourceResourceType: event.sourceResourceType || eventMeta.sourceResourceType || null,
    sourceResourceId: event.sourceResourceId || null,
    channel: event.channel,
    recipientAddress: event.recipient.email,
    templateKey: binding.templateKey,
    payload: variables,
    attachments: event.attachments || [],
    priority: event.priority || binding.priority || "normal",
    idempotencyKey: event.idempotencyKey,
  };

  const result = await transactionalService.enqueueMessage(transactionalRequest);
  if (result.duplicate) {
    return {
      duplicate: true,
      messageId: result.message.id,
      status: result.message.status,
      eventType: event.eventType,
      templateKey: binding.templateKey,
      bindingId: binding.id,
      contactId: null,
      contactCreated: false,
      automation: [{ skipped: "duplicate_event" }],
    };
  }

  let contact = null;
  let contactCreated = false;
  let automation = [];
  try {
    const contactResult = await contactService.upsertContact({
      locationId: event.locationId,
      fullName: event.recipient.name || event.payload.guestName || event.payload.customerName,
      email: event.recipient.email,
      phone: event.recipient.phone || event.payload.guestPhone || event.payload.phone,
      sourceType: "webhook",
      sourceRefType: event.sourceResourceType || eventMeta.sourceResourceType || "event",
      sourceRefId: event.sourceResourceId || event.idempotencyKey,
      externalType: event.sourceResourceType || eventMeta.sourceResourceType || "event",
      externalId: event.sourceResourceId || event.idempotencyKey,
      lifecycle: event.eventType.startsWith("booking.") ? "customer" : "lead",
      tags: event.eventType.startsWith("booking.") ? ["booking-customer"] : [],
      customFields: {
        source: event.sourceSystem || eventMeta.sourceSystem || "aeroSportsAdmin",
        lastEventType: event.eventType,
        bookingNumber: event.payload.bookingNumber || null,
        venueName: event.payload.venueName || null,
      },
      sourceSnapshot: event.payload,
    });
    contact = contactResult.contact;
    contactCreated = Boolean(contactResult.created);

    const automationEvents = [];
    if (contactCreated) {
      automationEvents.push({
        locationId: event.locationId,
        eventType: "customer.created",
        contactId: contact.id,
        source: "notification_event",
        payload: { eventType: event.eventType },
      });
    }
    for (const tag of contactResult.tagsAdded || []) {
      automationEvents.push({
        locationId: event.locationId,
        eventType: "contact.tag_added",
        contactId: contact.id,
        tag,
        source: "notification_event",
        payload: { eventType: event.eventType },
      });
    }
    automationEvents.push({
      locationId: event.locationId,
      eventType: event.eventType,
      contactId: contact.id,
      email: event.recipient.email,
      source: "notification_event",
      eventId: event.idempotencyKey,
      payload: event.payload,
    });
    automation.push(await queueJobs.enqueueAutomationEvents(automationEvents, {
      locationId: event.locationId,
      source: "notification_event",
    }));
  } catch (err) {
    automation = [{ skipped: "automation_or_contact_bridge_failed", reason: err.message }];
  }

  return {
    duplicate: result.duplicate,
    messageId: result.message.id,
    status: result.message.status,
    eventType: event.eventType,
    templateKey: binding.templateKey,
    bindingId: binding.id,
    contactId: contact?.id || null,
    contactCreated,
    automation: automation.filter(Boolean),
  };
}

async function listBindings(query = {}) {
  const filter = {
    eventType: query.eventType || undefined,
    channel: query.channel || undefined,
    includeInactive: query.includeInactive === "true" || query.includeInactive === true,
  };
  if (query.locationId !== undefined) {
    filter.locationId =
      query.locationId === "null" || query.locationId === ""
        ? null
        : Number(query.locationId);
  }
  return repository.listBindings(filter);
}

async function getBinding(id) {
  const binding = await repository.findBindingById(id);
  if (!binding) throw httpError(404, "Binding not found");
  return binding;
}

async function createBinding(body) {
  const validation = validateBindingInput(body);
  if (!validation.ok) throw httpError(400, validation.errors.join("; "));

  const data = validation.value;
  if (!eventRegistry.isRegistered(data.eventType)) {
    throw httpError(400, `Unknown eventType: ${data.eventType}`);
  }

  try {
    const created = await repository.createBinding(data);
    await safeAudit({
      locationId: created.locationId,
      action: "binding.create",
      entityType: "notification_binding",
      entityId: created.id,
      entityName: `${created.eventType} -> ${created.templateKey}`,
      metadata: { eventType: created.eventType, channel: created.channel, templateKey: created.templateKey },
    });
    return created;
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") {
      throw httpError(
        409,
        `Binding already exists for ${data.eventType}/${data.channel}/${data.locationId ?? "default"}`
      );
    }
    throw err;
  }
}

async function updateBinding(id, body) {
  const binding = await getBinding(id);
  const validation = validateBindingInput({ ...binding.toJSON(), ...body }, { partial: true });
  if (!validation.ok) throw httpError(400, validation.errors.join("; "));

  if (validation.value.eventType && !eventRegistry.isRegistered(validation.value.eventType)) {
    throw httpError(400, `Unknown eventType: ${validation.value.eventType}`);
  }

  const updated = await repository.updateBinding(binding, validation.value);
  await safeAudit({
    locationId: updated.locationId,
    action: "binding.update",
    entityType: "notification_binding",
    entityId: updated.id,
    entityName: `${updated.eventType} -> ${updated.templateKey}`,
    metadata: { changedFields: Object.keys(body || {}), isActive: updated.isActive },
  });
  return updated;
}

async function deleteBinding(id) {
  const binding = await getBinding(id);
  await repository.deleteBinding(binding);
  await safeAudit({
    locationId: binding.locationId,
    action: "binding.delete",
    entityType: "notification_binding",
    entityId: binding.id,
    entityName: `${binding.eventType} -> ${binding.templateKey}`,
    metadata: { eventType: binding.eventType, templateKey: binding.templateKey },
  });
  return { id };
}

function listEvents() {
  return eventRegistry.listEvents();
}

module.exports = {
  ingestEvent,
  listBindings,
  getBinding,
  createBinding,
  updateBinding,
  deleteBinding,
  listEvents,
};
