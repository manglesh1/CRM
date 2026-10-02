"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const registry = require("../src/modules/notifications/eventRegistry");

const refundEvents = [
  "booking.refund.requested",
  "booking.refund.staff.requested",
  "booking.refund.approved",
  "booking.refund.rejected",
  "booking.refund.completed",
];

test("all backend refund notification events are registered in CRM", () => {
  for (const eventType of refundEvents) {
    assert.equal(registry.isRegistered(eventType), true, eventType);
    const event = registry.getEvent(eventType);
    assert.equal(event.sourceResourceType, "refund_request", eventType);
    for (const field of event.requiredPayloadFields) {
      assert.ok(Object.hasOwn(event.samplePayload, field), `${eventType}: ${field}`);
    }
  }
});
