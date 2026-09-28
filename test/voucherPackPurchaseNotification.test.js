const test = require("node:test");
const assert = require("node:assert/strict");
const registry = require("../src/modules/notifications/eventRegistry");
const service = require("../src/modules/notifications/service");
const repository = require("../src/modules/notifications/repository");
const transactional = require("../src/modules/transactional/service");
const contacts = require("../src/modules/contacts/service");
const jobs = require("../src/modules/queueJobs/service");

const event = {
  eventType: "voucher.pack.purchased",
  locationId: 4,
  recipient: { email: "guest@example.com", name: "Guest" },
  payload: {
    guestName: "Guest",
    bookingNumber: "BK-VP-1",
    venueName: "Movira Park",
    voucherPackName: "Family Pack",
  },
  idempotencyKey: "voucher_pack_purchase:test",
  priority: "high",
};

test("voucher pack purchase is a registered notification event", () => {
  assert.equal(registry.isRegistered(event.eventType), true);
  assert.equal(registry.getEvent(event.eventType).sourceResourceType, "booking");
});

test("voucher pack purchase reaches the configured transactional binding", async (t) => {
  const requests = [];
  t.mock.method(repository, "findActiveBinding", async (scope) => {
    assert.deepEqual(scope, {
      eventType: "voucher.pack.purchased",
      channel: "email",
      locationId: 4,
    });
    return { id: 8, templateKey: "bookingConfirmation", variableMap: {} };
  });
  t.mock.method(transactional, "enqueueMessage", async (request) => {
    requests.push(request);
    return { duplicate: false, message: { id: 9, status: "queued" } };
  });
  t.mock.method(contacts, "upsertContact", async () => ({
    contact: { id: 10 }, created: false, tagsAdded: [],
  }));
  t.mock.method(jobs, "enqueueAutomationEvents", async () => ({ queued: true }));

  const result = await service.ingestEvent(event);

  assert.equal(result.eventType, "voucher.pack.purchased");
  assert.equal(result.templateKey, "bookingConfirmation");
  assert.equal(result.status, "queued");
  assert.equal(requests[0].sourceEventType, "voucher.pack.purchased");
});
