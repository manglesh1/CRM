"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const registry = require("../src/modules/notifications/eventRegistry");
const service = require("../src/modules/notifications/service");
const repository = require("../src/modules/notifications/repository");
const transactional = require("../src/modules/transactional/service");
const contacts = require("../src/modules/contacts/service");
const jobs = require("../src/modules/queueJobs/service");
const migration = require("../migrations/20260928093000-add-member-password-reset-notification");

const eventType = "member.password_reset.requested";
const event = {
  eventType,
  locationId: 4,
  recipient: { email: "member@example.com", name: "Alex" },
  payload: {
    guestName: "Alex",
    venueName: "Park",
    resetUrl: "https://example.com/account/reset?token=redacted",
    expiryMinutes: 60,
  },
  idempotencyKey: "member_password_reset:test",
  priority: "critical",
};

test("member password reset is registered as a security event", () => {
  const meta = registry.getEvent(eventType);
  assert.equal(Boolean(meta), true);
  assert.equal(meta.skipContactAutomation, true);
  assert.deepEqual(meta.requiredPayloadFields, ["resetUrl", "expiryMinutes", "venueName"]);
});

test("member password reset queues the secure link without marketing automation", async (t) => {
  t.mock.method(repository, "findActiveBinding", async () => ({
    id: 8,
    templateKey: "memberPasswordReset",
    variableMap: {},
  }));
  const requests = [];
  t.mock.method(transactional, "enqueueMessage", async (request) => {
    requests.push(request);
    return { duplicate: false, message: { id: 9, status: "queued" } };
  });
  const contact = t.mock.method(contacts, "upsertContact", async () => ({ contact: { id: 1 } }));
  const automation = t.mock.method(jobs, "enqueueAutomationEvents", async () => ({ queued: true }));

  const result = await service.ingestEvent(event);
  assert.equal(result.status, "queued");
  assert.equal(result.contactId, null);
  assert.equal(result.automation[0].skipped, "security_event");
  assert.equal(requests[0].templateKey, "memberPasswordReset");
  assert.equal(requests[0].payload.resetUrl, event.payload.resetUrl);
  assert.equal(contact.mock.callCount(), 0);
  assert.equal(automation.mock.callCount(), 0);
});

test("migration installs the reset template and its default binding", async () => {
  const inserted = [];
  await migration.up({
    sequelize: { query: async () => [[]] },
    bulkInsert: async (table, rows) => inserted.push({ table, rows }),
    bulkUpdate: async () => assert.fail("new install should insert"),
  });

  assert.equal(inserted.length, 2);
  const template = inserted.find((entry) => entry.table.tableName === "crm_transactional_templates").rows[0];
  const binding = inserted.find((entry) => entry.table.tableName === "crm_event_template_bindings").rows[0];
  assert.equal(template.key, "memberPasswordReset");
  assert.match(template.body, /\{\{resetUrl\}\}/);
  assert.equal(binding.eventType, eventType);
  assert.equal(binding.templateKey, template.key);
  assert.equal(binding.isActive, true);
});
