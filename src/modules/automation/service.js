const { Op } = require("sequelize");
const { getModels } = require("../../db/models");
const engine = require("./engine");
const filterEngine = require("../contacts/filterEngine");

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

function cleanString(value, max = 240) {
  const text = String(value || "").trim();
  return text ? text.slice(0, max) : null;
}

function plain(row) {
  return row?.get ? row.get({ plain: true }) : row;
}

async function resolveEventContact(models, locationId, event = {}) {
  if (event.contactId) {
    const contact = await models.CrmContact.findOne({ where: { id: event.contactId, locationId } });
    if (contact) return contact;
  }
  const email = String(event.email || event.recipient?.email || event.payload?.email || event.payload?.guestEmail || "").trim().toLowerCase();
  if (email) {
    const contact = await models.CrmContact.findOne({ where: { locationId, normalizedEmail: email } });
    if (contact) return contact;
  }
  const phone = String(event.phone || event.recipient?.phone || event.payload?.phone || event.payload?.guestPhone || "").replace(/[^\d+]/g, "").trim();
  if (phone) {
    const contact = await models.CrmContact.findOne({ where: { locationId, normalizedPhone: phone } });
    if (contact) return contact;
  }
  return null;
}

function eventMatchesWorkflow(workflow, event = {}) {
  const settings = workflow.settings || {};
  if (settings.segmentId && event.segmentId && String(settings.segmentId) !== String(event.segmentId)) return false;
  if (settings.tag && event.tag && String(settings.tag).toLowerCase() !== String(event.tag).toLowerCase()) return false;
  return true;
}

async function executeWorkflowForContact(models, workflow, contact, input = {}) {
  const data = plain(workflow);
  const result = await engine.runForContact(workflow, contact, { dryRun: false });
  const run = await models.CrmAutomationRun.create({
    workflowId: workflow.id,
    locationId: data.locationId,
    contactId: contact.id,
    runType: input.runType || "production",
    status: result.status,
    triggerKey: data.triggerKey,
    currentNodeId: result.currentNodeId,
    input,
    result: { steps: result.steps },
    startedAt: new Date(),
    completedAt: new Date(),
  });
  return { run, result };
}

async function updateWorkflowRunStats(workflow, summary) {
  const data = plain(workflow);
  const stats = data.stats || {};
  const totalRuns = Number(stats.runs || 0) + Number(summary.enrolled || 0);
  const succeededTotal = Number(stats.succeeded || 0) + Number(summary.succeeded || 0);
  await workflow.update({
    stats: {
      ...stats,
      enrolled: Number(stats.enrolled || 0) + Number(summary.enrolled || 0),
      runs: totalRuns,
      succeeded: succeededTotal,
      stopped: Number(stats.stopped || 0) + Number(summary.stopped || 0),
      failed: Number(stats.failed || 0) + Number(summary.failed || 0),
      successRate: totalRuns ? `${Math.round((succeededTotal / totalRuns) * 100)}%` : "0%",
    },
  });
}

function cleanNodes(nodes, depth = 0) {
  if (!Array.isArray(nodes)) return [];
  return nodes.slice(0, 80).map((node, index) => {
    const cleaned = {
      id: cleanString(node.id, 120) || `node_${index + 1}`,
      actionId: cleanString(node.actionId, 120),
      type: cleanString(node.type, 40) || "action",
      label: cleanString(node.label, 180) || `Step ${index + 1}`,
      subtitle: cleanString(node.subtitle, 500),
      iconKey: cleanString(node.iconKey, 80),
      tone: cleanString(node.tone, 40),
      branches: Array.isArray(node.branches) ? node.branches.map((item) => cleanString(item, 80)).filter(Boolean).slice(0, 8) : undefined,
      config: node.config && typeof node.config === "object" ? node.config : {},
    };
    // Preserve if/else branch paths (recursively cleaned, depth-limited).
    if (node.paths && typeof node.paths === "object" && depth < 3) {
      cleaned.paths = {
        yes: cleanNodes(node.paths.yes, depth + 1),
        no: cleanNodes(node.paths.no, depth + 1),
      };
    }
    return cleaned;
  });
}

function validateWorkflowPayload(input = {}) {
  const errors = [];
  const name = cleanString(input.name, 180);
  const nodes = cleanNodes(input.nodes);
  // Triggers are optional on a draft (a brand-new workflow starts empty and the
  // user adds one or more triggers in the builder). triggerKey/Label default to
  // the first trigger node when present.
  const firstTrigger = nodes.find((node) => node.type === "trigger");
  const triggerKey = cleanString(input.triggerKey || input.trigger || firstTrigger?.actionId, 120) || "";
  const triggerLabel = cleanString(input.triggerLabel || input.trigger || firstTrigger?.label, 180) || "";
  if (!name) errors.push("name is required");
  if (errors.length) throw badRequest("Automation workflow is invalid", errors);
  return { name, triggerKey, triggerLabel, nodes };
}

function serializeWorkflow(row) {
  const workflow = plain(row);
  const stats = workflow.stats || {};
  return {
    ...workflow,
    trigger: workflow.triggerLabel,
    enrolled: Number(stats.enrolled || 0),
    successRate: stats.successRate || "0%",
    updatedAtLabel: workflow.updatedAt,
  };
}

async function listWorkflows(query = {}) {
  const models = getModels();
  const locationId = requireLocation(query.locationId);
  const where = { locationId };
  const q = cleanString(query.search, 120);
  if (query.status) where.status = cleanString(query.status, 40);
  if (q) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${q}%` } },
      { triggerLabel: { [Op.iLike]: `%${q}%` } },
    ];
  }
  const rows = await models.CrmAutomationWorkflow.findAll({
    where,
    order: [["updatedAt", "DESC"]],
    limit: Math.min(100, Math.max(1, Number(query.limit || 50))),
  });
  return rows.map(serializeWorkflow);
}

async function getWorkflow(id, query = {}) {
  const models = getModels();
  const locationId = requireLocation(query.locationId);
  const workflow = await models.CrmAutomationWorkflow.findOne({ where: { id, locationId } });
  if (!workflow) throw notFound("Automation workflow");
  return serializeWorkflow(workflow);
}

async function createWorkflow(input = {}) {
  const models = getModels();
  const locationId = requireLocation(input.locationId);
  const valid = validateWorkflowPayload(input);
  const workflow = await models.CrmAutomationWorkflow.create({
    locationId,
    name: valid.name,
    description: cleanString(input.description, 2000),
    status: cleanString(input.status || "draft", 40) || "draft",
    triggerKey: valid.triggerKey,
    triggerLabel: valid.triggerLabel,
    nodes: valid.nodes,
    settings: input.settings && typeof input.settings === "object" ? input.settings : {},
    stats: input.stats && typeof input.stats === "object" ? input.stats : {},
    publishedAt: input.status === "published" ? new Date() : null,
  });
  return serializeWorkflow(workflow);
}

async function updateWorkflow(id, input = {}) {
  const models = getModels();
  const locationId = requireLocation(input.locationId);
  const workflow = await models.CrmAutomationWorkflow.findOne({ where: { id, locationId } });
  if (!workflow) throw notFound("Automation workflow");
  const patch = {};
  if (input.name !== undefined) patch.name = cleanString(input.name, 180);
  if (input.description !== undefined) patch.description = cleanString(input.description, 2000);
  if (input.status !== undefined) {
    patch.status = cleanString(input.status, 40) || "draft";
    patch.publishedAt = patch.status === "published" ? (workflow.publishedAt || new Date()) : null;
  }
  if (input.nodes !== undefined) patch.nodes = cleanNodes(input.nodes);
  // triggerKey/Label follow the first trigger node when nodes change, else explicit input.
  const firstTrigger = (patch.nodes || []).find((node) => node.type === "trigger");
  if (input.triggerKey !== undefined || input.trigger !== undefined || firstTrigger) patch.triggerKey = cleanString(input.triggerKey || input.trigger || firstTrigger?.actionId, 120) || "";
  if (input.triggerLabel !== undefined || input.trigger !== undefined || firstTrigger) patch.triggerLabel = cleanString(input.triggerLabel || input.trigger || firstTrigger?.label, 180) || "";
  if (input.settings !== undefined) patch.settings = input.settings && typeof input.settings === "object" ? input.settings : {};
  if (input.stats !== undefined) patch.stats = input.stats && typeof input.stats === "object" ? input.stats : {};
  if (patch.name === null) throw badRequest("Workflow name is required");
  const updated = await workflow.update(patch);
  return serializeWorkflow(updated);
}

async function deleteWorkflow(id, query = {}) {
  const models = getModels();
  const locationId = requireLocation(query.locationId);
  const workflow = await models.CrmAutomationWorkflow.findOne({ where: { id, locationId } });
  if (!workflow) throw notFound("Automation workflow");
  const data = serializeWorkflow(workflow);
  await workflow.destroy();
  return data;
}

async function testWorkflow(id, input = {}) {
  const models = getModels();
  const locationId = requireLocation(input.locationId);
  const workflow = await models.CrmAutomationWorkflow.findOne({ where: { id, locationId } });
  if (!workflow) throw notFound("Automation workflow");
  const data = plain(workflow);
  const nodes = Array.isArray(data.nodes) ? data.nodes : [];
  if (!nodes.some((n) => n.type !== "trigger")) throw badRequest("Add at least one action before testing");

  // Dry-run the real engine against a sample contact (no side effects).
  let contact = null;
  if (input.contactId) contact = await models.CrmContact.findOne({ where: { id: input.contactId, locationId } });
  if (!contact) contact = await models.CrmContact.findOne({ where: { locationId }, order: [["updatedAt", "DESC"]] });

  let result;
  if (contact) {
    result = await engine.runForContact(workflow, contact, { dryRun: true });
  } else {
    result = {
      steps: nodes.map((node) => ({ id: node.id, label: node.label, type: node.type, status: "success", detail: "" })),
      status: "success",
      currentNodeId: nodes[nodes.length - 1]?.id || null,
    };
  }

  const run = await models.CrmAutomationRun.create({
    workflowId: workflow.id,
    locationId,
    contactId: contact?.id || null,
    runType: "test",
    status: result.status,
    triggerKey: data.triggerKey,
    currentNodeId: result.currentNodeId,
    input: input.sample || {},
    result: { steps: result.steps },
    startedAt: new Date(),
    completedAt: new Date(),
  });

  const stats = data.stats || {};
  await workflow.update({
    stats: { ...stats, testRuns: Number(stats.testRuns || 0) + 1 },
    lastTestedAt: new Date(),
  });
  return plain(run);
}

async function loadCustomFields(models, locationId) {
  const fields = await models.CrmContactField.findAll({ where: { locationId, archivedAt: null } });
  return fields.map(plain);
}

// Resolve which contacts to enroll: single, explicit ids, a segment, or an
// ad-hoc filter/search (mirrors the customers grid scope).
async function resolveEnrollContacts(models, locationId, input) {
  if (input.contactId) {
    const contact = await models.CrmContact.findOne({ where: { id: input.contactId, locationId } });
    return contact ? [contact] : [];
  }
  if (Array.isArray(input.ids) && input.ids.length) {
    return models.CrmContact.findAll({ where: { locationId, id: { [Op.in]: input.ids.slice(0, 2000) } } });
  }
  const and = [];
  if (input.filters) {
    const customFields = await loadCustomFields(models, locationId);
    const fragment = filterEngine.compile(input.filters, { customFields });
    if (Object.keys(fragment).length) and.push(fragment);
  }
  const searchFragment = filterEngine.searchFragment(input.search);
  if (searchFragment) and.push(searchFragment);
  const include = input.segmentId
    ? [{ model: models.CrmSegmentMember, as: "segmentMemberships", where: { segmentId: input.segmentId, status: "active" }, attributes: [], required: true }]
    : [];
  if (!and.length && !input.segmentId && !input.allowAll) return [];
  const where = and.length ? { locationId, [Op.and]: and } : { locationId };
  return models.CrmContact.findAll({ where, include, limit: 2000 });
}

// Manually enroll contacts/segment into a workflow and execute it for each.
async function enrollWorkflow(id, input = {}) {
  const models = getModels();
  const locationId = requireLocation(input.locationId);
  const workflow = await models.CrmAutomationWorkflow.findOne({ where: { id, locationId } });
  if (!workflow) throw notFound("Automation workflow");
  const data = plain(workflow);
  const nodes = Array.isArray(data.nodes) ? data.nodes : [];
  if (!nodes.some((n) => n.type !== "trigger")) throw badRequest("Add at least one action before enrolling");

  const contacts = await resolveEnrollContacts(models, locationId, input);
  const summary = { workflowId: id, enrolled: 0, succeeded: 0, stopped: 0, failed: 0 };
  if (!contacts.length) return summary;

  for (const contact of contacts) {
    const { result } = await executeWorkflowForContact(models, workflow, contact, { source: input.source || "manual_enroll" });
    summary.enrolled += 1;
    if (result.status === "success") summary.succeeded += 1;
    else if (result.status === "stopped") summary.stopped += 1;
    else summary.failed += 1;
  }

  await updateWorkflowRunStats(workflow, summary);
  return summary;
}

async function triggerWorkflowsForEvent(event = {}) {
  const models = getModels();
  const locationId = requireLocation(event.locationId);
  const eventType = cleanString(event.eventType || event.triggerKey, 120);
  if (!eventType) throw badRequest("eventType is required");

  const contact = await resolveEventContact(models, locationId, event);
  if (!contact) return { eventType, matched: 0, enrolled: 0, succeeded: 0, stopped: 0, failed: 0, skipped: "contact_not_found" };

  const workflows = await models.CrmAutomationWorkflow.findAll({
    where: { locationId, status: "published", triggerKey: eventType },
    order: [["updatedAt", "DESC"]],
  });
  const matched = workflows.filter((workflow) => eventMatchesWorkflow(plain(workflow), event));
  const summary = { eventType, contactId: contact.id, matched: matched.length, enrolled: 0, succeeded: 0, stopped: 0, failed: 0 };

  for (const workflow of matched) {
    try {
      const { result } = await executeWorkflowForContact(models, workflow, contact, {
        source: event.source || "event",
        eventType,
        eventId: event.eventId || event.idempotencyKey || null,
        segmentId: event.segmentId || null,
        tag: event.tag || null,
        payload: event.payload || {},
      });
      summary.enrolled += 1;
      if (result.status === "success") summary.succeeded += 1;
      else if (result.status === "stopped") summary.stopped += 1;
      else summary.failed += 1;
      await updateWorkflowRunStats(workflow, {
        enrolled: 1,
        succeeded: result.status === "success" ? 1 : 0,
        stopped: result.status === "stopped" ? 1 : 0,
        failed: result.status === "failed" ? 1 : 0,
      });
    } catch (_err) {
      summary.failed += 1;
    }
  }

  return summary;
}

async function listRuns(query = {}) {
  const models = getModels();
  const locationId = requireLocation(query.locationId);
  const where = { locationId };
  if (query.workflowId) where.workflowId = query.workflowId;
  if (query.status) where.status = cleanString(query.status, 40);
  if (query.runType) where.runType = cleanString(query.runType, 40);
  const rows = await models.CrmAutomationRun.findAll({
    where,
    order: [["createdAt", "DESC"]],
    limit: Math.min(100, Math.max(1, Number(query.limit || 50))),
    include: [
      { model: models.CrmAutomationWorkflow, as: "workflow", attributes: ["id", "name", "triggerLabel"] },
      { model: models.CrmContact, as: "contact", attributes: ["id", "fullName", "email"] },
    ],
  });
  return rows.map(plain);
}

async function getStats(query = {}) {
  const models = getModels();
  const locationId = requireLocation(query.locationId);
  const [total, published, draft, paused, runs] = await Promise.all([
    models.CrmAutomationWorkflow.count({ where: { locationId } }),
    models.CrmAutomationWorkflow.count({ where: { locationId, status: "published" } }),
    models.CrmAutomationWorkflow.count({ where: { locationId, status: "draft" } }),
    models.CrmAutomationWorkflow.count({ where: { locationId, status: "paused" } }),
    models.CrmAutomationRun.count({ where: { locationId } }),
  ]);
  return { total, published, draft, paused, runs };
}

module.exports = {
  createWorkflow,
  deleteWorkflow,
  enrollWorkflow,
  getStats,
  getWorkflow,
  listRuns,
  listWorkflows,
  testWorkflow,
  triggerWorkflowsForEvent,
  updateWorkflow,
};
