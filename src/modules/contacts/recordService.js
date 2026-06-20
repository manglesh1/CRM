// Customer "record" depth: notes and a per-contact activity timeline built from
// marketing + transactional messages plus automation runs.

const { Op } = require("sequelize");
const { getModels } = require("../../db/models");

function badRequest(message, errors = []) {
  const err = new Error(message);
  err.statusCode = 400;
  err.errors = errors;
  return err;
}
function notFound(label) {
  const err = new Error(`${label} not found`);
  err.statusCode = 404;
  return err;
}
function requireLocation(locationId) {
  if (!locationId) throw badRequest("locationId is required");
  const value = Number(locationId);
  if (!Number.isInteger(value) || value <= 0) throw badRequest("locationId must be a positive integer");
  return value;
}
function cleanString(value, max = 2000) {
  const text = String(value || "").trim();
  return text ? text.slice(0, max) : null;
}
function plain(row) {
  return row?.get ? row.get({ plain: true }) : row;
}

async function loadContact(models, id, locationId) {
  const contact = await models.CrmContact.findOne({ where: { id, locationId } });
  if (!contact) throw notFound("Contact");
  return contact;
}

// ---- Notes ----------------------------------------------------------------

async function listNotes(contactId, query = {}) {
  const models = getModels();
  const locationId = requireLocation(query.locationId);
  await loadContact(models, contactId, locationId);
  const notes = await models.CrmContactNote.findAll({
    where: { contactId, locationId },
    order: [["createdAt", "DESC"]],
    limit: Math.min(200, Math.max(1, Number(query.limit || 100))),
  });
  return notes.map(plain);
}

async function createNote(contactId, input = {}) {
  const models = getModels();
  const locationId = requireLocation(input.locationId);
  await loadContact(models, contactId, locationId);
  const body = cleanString(input.body, 4000);
  if (!body) throw badRequest("Note body is required");
  const note = await models.CrmContactNote.create({
    contactId,
    locationId,
    body,
    authorName: cleanString(input.authorName, 160),
    authorId: cleanString(input.authorId, 120),
  });
  return plain(note);
}

async function deleteNote(noteId, query = {}) {
  const models = getModels();
  const locationId = requireLocation(query.locationId);
  const note = await models.CrmContactNote.findOne({ where: { id: noteId, locationId } });
  if (!note) throw notFound("Note");
  const data = plain(note);
  await note.destroy();
  return data;
}

// ---- Activity timeline ----------------------------------------------------

function marketingItem(message) {
  return {
    id: `mk_${message.id}`,
    channel: message.channel || "email",
    category: "marketing",
    title: message.subject || "Marketing email",
    status: message.status,
    occurredAt: message.sentAt || message.queuedAt || message.createdAt,
    opened: Boolean(message.openedAt),
    clicked: Boolean(message.clickedAt),
    bounced: Boolean(message.bouncedAt),
    openedAt: message.openedAt || null,
    clickedAt: message.clickedAt || null,
  };
}

function transactionalItem(message) {
  return {
    id: `tx_${message.id}`,
    channel: message.channel || "email",
    category: "transactional",
    title: message.templateKey || message.sourceEventType || "Transactional email",
    status: message.status,
    occurredAt: message.sentAt || message.queuedAt || message.createdAt,
    failed: Boolean(message.failedAt),
    error: message.lastError || null,
  };
}

function automationItem(run) {
  const workflow = run.workflow || {};
  const steps = Array.isArray(run.result?.steps) ? run.result.steps : [];
  const failedStep = steps.find((step) => step.status === "failed");
  const stoppedStep = steps.find((step) => step.status === "stopped");
  return {
    id: `auto_${run.id}`,
    channel: "automation",
    category: "automation",
    title: workflow.name || run.triggerKey || "Automation workflow",
    status: run.status,
    occurredAt: run.completedAt || run.startedAt || run.createdAt,
    workflowId: run.workflowId,
    workflowName: workflow.name || null,
    trigger: workflow.triggerLabel || run.triggerKey || null,
    runType: run.runType,
    stepCount: steps.length,
    error: run.error || failedStep?.detail || stoppedStep?.detail || null,
  };
}

async function getActivity(contactId, query = {}) {
  const models = getModels();
  const locationId = requireLocation(query.locationId);
  const contact = await loadContact(models, contactId, locationId);
  const email = contact.email || contact.normalizedEmail;

  const limit = Math.min(100, Math.max(1, Number(query.limit || 60)));
  const [marketing, transactional, automationRuns] = await Promise.all([
    email
      ? models.CrmMarketingMessage.findAll({
          where: { locationId, recipient: { [Op.iLike]: email } },
          order: [["createdAt", "DESC"]],
          limit,
        })
      : [],
    email
      ? models.TransactionalMessage.findAll({
          where: { locationId, recipientAddress: { [Op.iLike]: email } },
          order: [["createdAt", "DESC"]],
          limit,
        })
      : [],
    models.CrmAutomationRun.findAll({
      where: { locationId, contactId },
      order: [["createdAt", "DESC"]],
      limit,
      include: [{ model: models.CrmAutomationWorkflow, as: "workflow", attributes: ["id", "name", "triggerLabel"] }],
    }),
  ]);

  const items = [
    ...marketing.map((m) => marketingItem(plain(m))),
    ...transactional.map((m) => transactionalItem(plain(m))),
    ...automationRuns.map((run) => automationItem(plain(run))),
  ]
    .filter((item) => item.occurredAt)
    .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))
    .slice(0, limit);

  return { items, email };
}

module.exports = {
  listNotes,
  createNote,
  deleteNote,
  getActivity,
};
