const test = require("node:test");
const assert = require("node:assert/strict");
const registry = require("../src/modules/notifications/eventRegistry");
const service = require("../src/modules/notifications/service");
const repository = require("../src/modules/notifications/repository");
const transactional = require("../src/modules/transactional/service");
const contacts = require("../src/modules/contacts/service");
const jobs = require("../src/modules/queueJobs/service");
const audit = require("../src/modules/audit/service");

const eventType = "employee.password_reset.otp_requested";
const event = {
  eventType,
  locationId: 4,
  recipient: { email: "employee@example.com", name: "Alex" },
  payload: { otpCode: "042913", expiryMinutes: 10, venueName: "Park" },
  idempotencyKey: "employee_password_recovery:test",
  priority: "critical",
};

function mockDelivery(t, { duplicate = false, binding = true } = {}) {
  const requests = [];
  t.mock.method(repository, "findActiveBinding", async (scope) => {
    assert.equal(scope.locationId, 4);
    return binding ? { id: 8, templateKey: "employeePasswordRecoveryOtp", variableMap: {} } : null;
  });
  t.mock.method(transactional, "enqueueMessage", async (request) => {
    requests.push(request);
    return { duplicate, message: { id: 9, status: "queued" } };
  });
  const contact = t.mock.method(contacts, "upsertContact", async () => ({
    contact: { id: 10 }, created: false, tagsAdded: [],
  }));
  const automation = t.mock.method(jobs, "enqueueAutomationEvents", async () => ({ queued: true }));
  return { requests, contact, automation };
}

test("employee recovery appears in the CRM binding event catalogue", () => {
  assert.equal(service.listEvents().some((row) => row.eventType === eventType), true);
  assert.equal(registry.getEvent(eventType).skipContactAutomation, true);
  assert.notEqual(registry.getEvent("booking.confirmed").skipContactAutomation, true);
});

test("employee recovery queues the OTP without creating contacts or marketing jobs", async (t) => {
  const mocks = mockDelivery(t);
  const result = await service.ingestEvent(event);
  assert.equal(result.duplicate, false);
  assert.equal(result.status, "queued");
  assert.equal(result.contactId, null);
  assert.equal(result.automation[0].skipped, "security_event");
  assert.equal(mocks.requests[0].payload.otpCode, "042913");
  assert.equal(mocks.requests[0].priority, "critical");
  assert.equal(mocks.requests[0].templateKey, "employeePasswordRecoveryOtp");
  assert.equal(mocks.contact.mock.callCount(), 0);
  assert.equal(mocks.automation.mock.callCount(), 0);
});

test("CRM UI can create a park-scoped recovery template binding", async (t) => {
  t.mock.method(repository, "createBinding", async (data) => ({ id: 12, ...data }));
  t.mock.method(audit, "recordAuditLog", async () => {});
  const binding = await service.createBinding({
    eventType, locationId: 4, templateKey: "employeePasswordRecoveryOtp", priority: "critical",
  }, { locationId: 4, isSuperAdmin: false });
  assert.equal(binding.eventType, eventType);
  assert.equal(binding.locationId, 4);
  assert.equal(binding.isActive, true);
});

test("duplicate recovery delivery does not trigger customer workflows", async (t) => {
  const mocks = mockDelivery(t, { duplicate: true });
  const result = await service.ingestEvent(event);
  assert.equal(result.duplicate, true);
  assert.equal(result.automation[0].skipped, "duplicate_event");
  assert.equal(mocks.contact.mock.callCount(), 0);
  assert.equal(mocks.automation.mock.callCount(), 0);
});

test("recovery still requires an active UI-configured binding", async (t) => {
  const mocks = mockDelivery(t, { binding: false });
  await assert.rejects(service.ingestEvent(event), (error) => error.code === "binding_not_found");
  assert.equal(mocks.requests.length, 0);
});

test("booking notifications retain customer and automation processing", async (t) => {
  const mocks = mockDelivery(t);
  const result = await service.ingestEvent({ ...event, eventType: "booking.confirmed", payload: { bookingNumber: "BK1" } });
  assert.equal(result.contactId, 10);
  assert.equal(mocks.contact.mock.callCount(), 1);
  assert.equal(mocks.automation.mock.callCount(), 1);
});

test("unregistered events still fail before delivery", async (t) => {
  const mocks = mockDelivery(t);
  await assert.rejects(service.ingestEvent({ ...event, eventType: "unknown.event" }), (error) => error.code === "unknown_event_type");
  assert.equal(mocks.requests.length, 0);
});
