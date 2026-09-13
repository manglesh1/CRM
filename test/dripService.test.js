const test = require("node:test");
const assert = require("node:assert/strict");

const { durationMs, serializeEnrollment } = require("../src/modules/marketing/email/dripService");

test("drip delay durations support minutes, hours, and days", () => {
  assert.equal(durationMs(5, "minutes"), 5 * 60 * 1000);
  assert.equal(durationMs(2, "hours"), 2 * 60 * 60 * 1000);
  assert.equal(durationMs(3, "days"), 3 * 24 * 60 * 60 * 1000);
});

test("drip delay durations never schedule a zero-length step", () => {
  assert.equal(durationMs(0, "minutes"), 60 * 1000);
  assert.equal(durationMs(-4, "hours"), 60 * 60 * 1000);
});

test("drip enrollment serialization exposes progress without internal payload data", () => {
  const result = serializeEnrollment({
    id: "enrollment-1",
    campaignId: "campaign-1",
    recipient: "person@example.com",
    status: "active",
    currentStepIndex: 2,
    stepsSnapshot: [{ type: "email" }, { type: "wait" }, { type: "email" }],
    data: { private: "not returned" },
  });
  assert.equal(result.currentStepIndex, 2);
  assert.equal(result.totalSteps, 3);
  assert.equal(Object.hasOwn(result, "data"), false);
});
