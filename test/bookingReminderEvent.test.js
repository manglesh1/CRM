"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const registry = require("../src/modules/notifications/eventRegistry");

test("booking reminder is a registered transactional event", () => {
  assert.equal(registry.isRegistered("booking.reminder"), true);
  assert.equal(
    registry.getEvent("booking.reminder").sourceResourceType,
    "booking"
  );
});
