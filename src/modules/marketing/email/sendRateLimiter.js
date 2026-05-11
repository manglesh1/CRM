const { Op } = require("sequelize");
const config = require("../../../config");
const { getModels } = require("../../../db/models");
const repository = require("./messageRepository");

class MarketingRateLimitError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "MarketingRateLimitError";
    this.code = "MARKETING_RATE_LIMITED";
    this.statusCode = 429;
    this.details = details;
    this.retryAfterSeconds = details.retryAfterSeconds || 60;
  }
}

function limits() {
  const perMinute = Math.max(0, Number(config.marketing?.rateLimits?.perMinute || 0));
  const perHour = Math.max(0, Number(config.marketing?.rateLimits?.perHour || 0));
  return {
    enabled: perMinute > 0 || perHour > 0,
    perMinute,
    perHour,
  };
}

async function getUsage(locationId) {
  const { CrmMarketingDeliveryEvent, CrmMarketingMessage } = getModels();
  const now = Date.now();
  const minuteCutoff = new Date(now - 60 * 1000);
  const hourCutoff = new Date(now - 60 * 60 * 1000);

  const [sentLastMinute, sentLastHour] = await Promise.all([
    countSentSince(CrmMarketingDeliveryEvent, CrmMarketingMessage, locationId, minuteCutoff),
    countSentSince(CrmMarketingDeliveryEvent, CrmMarketingMessage, locationId, hourCutoff),
  ]);

  return {
    sentLastMinute,
    sentLastHour,
    windowStartedAt: {
      minute: minuteCutoff.toISOString(),
      hour: hourCutoff.toISOString(),
    },
  };
}

async function assertCanSend(message, { queueType = null } = {}) {
  const currentLimits = limits();
  if (!currentLimits.enabled) return { allowed: true, limits: currentLimits };

  const usage = await getUsage(message.locationId);
  const minuteExceeded = currentLimits.perMinute > 0 && usage.sentLastMinute >= currentLimits.perMinute;
  const hourExceeded = currentLimits.perHour > 0 && usage.sentLastHour >= currentLimits.perHour;
  if (!minuteExceeded && !hourExceeded) {
    return { allowed: true, limits: currentLimits, usage };
  }

  const retryAfterSeconds = minuteExceeded ? 60 : 3600;
  const reason = minuteExceeded
    ? `Marketing rate limit reached: ${usage.sentLastMinute}/${currentLimits.perMinute} sent in the last minute.`
    : `Marketing rate limit reached: ${usage.sentLastHour}/${currentLimits.perHour} sent in the last hour.`;
  await repository.createDeliveryEvent({
    messageId: message.id,
    campaignId: message.campaignId,
    eventType: "rate_limited",
    payload: {
      source: "marketing-worker",
      queueType,
      reason,
      limits: currentLimits,
      usage,
      retryAfterSeconds,
    },
  });
  throw new MarketingRateLimitError(reason, {
    limits: currentLimits,
    usage,
    retryAfterSeconds,
    queueType,
  });
}

async function getRateLimitStatus(locationId) {
  const currentLimits = limits();
  const usage = locationId ? await getUsage(locationId) : { sentLastMinute: 0, sentLastHour: 0 };
  return {
    ...currentLimits,
    usage,
    remaining: {
      perMinute: currentLimits.perMinute > 0 ? Math.max(0, currentLimits.perMinute - usage.sentLastMinute) : null,
      perHour: currentLimits.perHour > 0 ? Math.max(0, currentLimits.perHour - usage.sentLastHour) : null,
    },
    limited: Boolean(
      (currentLimits.perMinute > 0 && usage.sentLastMinute >= currentLimits.perMinute) ||
      (currentLimits.perHour > 0 && usage.sentLastHour >= currentLimits.perHour)
    ),
  };
}

async function countSentSince(CrmMarketingDeliveryEvent, CrmMarketingMessage, locationId, cutoff) {
  return CrmMarketingDeliveryEvent.count({
    where: {
      eventType: "sent",
      occurredAt: { [Op.gte]: cutoff },
    },
    include: [
      {
        model: CrmMarketingMessage,
        as: "message",
        attributes: [],
        where: { locationId },
        required: true,
      },
    ],
  });
}

module.exports = {
  MarketingRateLimitError,
  assertCanSend,
  getRateLimitStatus,
  limits,
};
