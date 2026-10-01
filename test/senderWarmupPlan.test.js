const test = require("node:test");
const assert = require("node:assert/strict");

const warmupService = require("../src/modules/messaging-core/warmup/senderWarmupService");

test("sender warmup exposes the complete customer-facing sending plan", () => {
  assert.deepEqual(warmupService.getWarmupPlan(), [
    { stage: 1, dailyLimit: 50, hourlyLimit: 10 },
    { stage: 2, dailyLimit: 100, hourlyLimit: 20 },
    { stage: 3, dailyLimit: 200, hourlyLimit: 40 },
    { stage: 4, dailyLimit: 400, hourlyLimit: 80 },
    { stage: 5, dailyLimit: 800, hourlyLimit: 160 },
    { stage: 6, dailyLimit: 1500, hourlyLimit: 300 },
    { stage: 7, dailyLimit: 2500, hourlyLimit: 500 },
    { stage: 8, dailyLimit: 4000, hourlyLimit: 800 },
    { stage: 9, dailyLimit: 6000, hourlyLimit: 1200 },
    { stage: 10, dailyLimit: 10000, hourlyLimit: 2000 },
  ]);
});
