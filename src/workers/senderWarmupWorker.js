require("dotenv").config();
const logger = require("../shared/logger");
const warmupService = require("../modules/messaging-core/warmup/senderWarmupService");

const INTERVAL_MINUTES = Number(process.env.SENDER_WARMUP_EVALUATOR_INTERVAL_MINUTES || 60);

async function runOnce() {
  try {
    const results = await warmupService.evaluateAll();
    logger.info({ count: results.length, results }, "sender warmup evaluation completed");
  } catch (err) {
    logger.error({ err }, "sender warmup evaluation failed");
  }
}

async function start() {
  logger.info({ intervalMinutes: INTERVAL_MINUTES }, "sender warmup worker started");
  await runOnce();
  const handle = setInterval(runOnce, Math.max(1, INTERVAL_MINUTES) * 60 * 1000);
  if (handle.unref) handle.unref();
}

start();
