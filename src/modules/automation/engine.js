// Automation execution engine. Runs a workflow's nodes in order against a
// single contact. Synchronous (no scheduler): `wait` steps are recorded as
// skipped. `if_else` acts as a gate — if the condition fails the run stops.
// dryRun evaluates without side effects (used by the test action).

const { getModels } = require("../../db/models");
const marketingEmail = require("../marketing/email/service");

const UPDATABLE_BUILTIN = new Set(["lifecycle", "marketingStatus", "smsStatus", "doNotContact", "firstName", "lastName", "fullName"]);
const SKIP_REASONS = {
  wait: "Wait steps run instantly in this engine (no scheduler yet)",
  send_sms: "SMS is not enabled in the email-only phase",
  notify_team: "Notify team is not implemented yet",
  create_task: "Tasks are not implemented yet",
};

function contactMergeData(contact) {
  return {
    email: contact.email,
    firstName: contact.firstName,
    lastName: contact.lastName,
    fullName: contact.fullName,
    phone: contact.phone,
    lifecycle: contact.lifecycle,
    tags: Array.isArray(contact.tags) ? contact.tags : [],
  };
}

function applyMerge(text, contact) {
  return String(text || "").replace(/\{\{\s*contact\.(\w+)\s*\}\}/g, (_, key) => {
    const value = contact[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

function readField(contact, field) {
  if (!field) return undefined;
  if (field.startsWith("cf:")) return contact.customFields ? contact.customFields[field.slice(3)] : undefined;
  return contact[field];
}

function evaluateCondition(contact, config = {}) {
  const operator = config.operator || "equals";
  const actual = String(readField(contact, config.field) ?? "").toLowerCase();
  const expected = String(config.value ?? "").toLowerCase();
  switch (operator) {
    case "equals": return actual === expected;
    case "not_equals": return actual !== expected;
    case "contains": return actual.includes(expected);
    case "is_empty": return actual === "";
    case "is_not_empty": return actual !== "";
    default: return actual === expected;
  }
}

function step(node, status, detail) {
  return { id: node.id, label: node.label, type: node.type, actionId: node.actionId || node.type, status, detail };
}

async function executeNode(node, ctx) {
  const { models, contact, locationId, dryRun } = ctx;
  const actionId = node.actionId || node.type;
  const config = node.config || {};

  if (node.type === "trigger") return step(node, "success", "Trigger");

  switch (actionId) {
    case "add_tag": {
      const tag = String(config.tag || "").trim();
      if (!tag) return step(node, "skipped", "No tag configured");
      const tags = Array.from(new Set([...(Array.isArray(contact.tags) ? contact.tags : []), tag]));
      contact.set("tags", tags); // applied in-memory so later steps see it (dry-run accurate)
      if (!dryRun) await contact.save();
      return step(node, "success", `Added tag “${tag}”`);
    }
    case "remove_tag": {
      const tag = String(config.tag || "").trim();
      if (!tag) return step(node, "skipped", "No tag configured");
      const tags = (Array.isArray(contact.tags) ? contact.tags : []).filter((t) => t !== tag);
      contact.set("tags", tags);
      if (!dryRun) await contact.save();
      return step(node, "success", `Removed tag “${tag}”`);
    }
    case "update_contact": {
      const field = config.field;
      const value = config.value;
      if (!field) return step(node, "skipped", "No field configured");
      if (field.startsWith("cf:")) {
        contact.set("customFields", { ...(contact.customFields || {}), [field.slice(3)]: value });
        if (!dryRun) await contact.save();
        return step(node, "success", `Set ${field} → ${value}`);
      }
      if (!UPDATABLE_BUILTIN.has(field)) return step(node, "skipped", `Field “${field}” is not updatable by automation`);
      contact.set(field, field === "doNotContact" ? value === true || value === "true" : value);
      if (!dryRun) await contact.save();
      return step(node, "success", `Set ${field} → ${value}`);
    }
    case "internal_note": {
      const body = applyMerge(config.note || "Automation note", contact);
      if (!dryRun) await models.CrmContactNote.create({ contactId: contact.id, locationId, body, authorName: "Automation" });
      return step(node, "success", "Note added to customer");
    }
    case "send_email": {
      if (dryRun) {
        return step(node, config.template ? "success" : "skipped", config.template ? `Would send template ${config.template}` : "No template selected");
      }
      const result = await marketingEmail.enqueueSingleMessage({
        locationId,
        templateId: config.template,
        recipient: contact.email,
        data: { contact: contactMergeData(contact) },
        source: "automation",
      });
      if (result.status === "skipped" || result.status === "suppressed") return step(node, "skipped", result.reason);
      return step(node, "success", `Email ${result.status}`);
    }
    case "if_else": {
      const passed = evaluateCondition(contact, config);
      return step(node, passed ? "success" : "stopped", passed ? "Condition met" : "Condition not met — run stopped");
    }
    case "wait":
    case "send_sms":
    case "notify_team":
    case "create_task":
      return step(node, "skipped", SKIP_REASONS[actionId] || "Not supported");
    default:
      return step(node, "skipped", `Unsupported action: ${actionId}`);
  }
}

// Execute a workflow for one contact. Returns { steps, status, currentNodeId }.
async function runForContact(workflow, contact, { dryRun = false } = {}) {
  const models = getModels();
  const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
  const ctx = { models, contact, locationId: workflow.locationId, dryRun };
  const steps = [];
  let status = "success";
  let lastNodeId = null;

  for (const node of nodes) {
    let result;
    try {
      result = await executeNode(node, ctx);
    } catch (err) {
      result = step(node, "failed", err.message || "Step failed");
    }
    steps.push(result);
    lastNodeId = node.id;
    if (result.status === "failed") { status = "failed"; break; }
    if (result.status === "stopped") { status = "stopped"; break; }
  }

  return { steps, status, currentNodeId: lastNodeId };
}

module.exports = { runForContact };
