const { Op, fn, col } = require("sequelize");
const config = require("../../../config");
const { getModels } = require("../../../db/models");
const sendRateLimiter = require("./sendRateLimiter");

const MESSAGE_STATUSES = [
  "pending",
  "queued",
  "sending",
  "sent",
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "complained",
  "unsubscribed",
  "failed",
  "cancelled",
];

function requireLocation(locationId) {
  if (!locationId) {
    const err = new Error("locationId is required");
    err.statusCode = 400;
    throw err;
  }
  return Number(locationId);
}

async function getQueueMonitoring({ locationId, staleMinutes = 15 } = {}) {
  const loc = requireLocation(locationId);
  const staleMs = Math.max(1, Number(staleMinutes) || 15) * 60 * 1000;
  const staleCutoff = new Date(Date.now() - staleMs);
  const {
    CrmMarketingCampaign,
    CrmMarketingMessage,
    CrmMarketingDeliveryEvent,
    CrmMarketingWorkerHeartbeat,
  } = getModels();

  const statusRows = await CrmMarketingMessage.findAll({
    attributes: ["status", [fn("COUNT", col("id")), "count"]],
    where: { locationId: loc },
    group: ["status"],
    raw: true,
  });
  const statusCounts = MESSAGE_STATUSES.reduce((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {});
  for (const row of statusRows) {
    statusCounts[row.status] = Number(row.count || 0);
  }

  const [activeCampaigns, staleQueuedCount, stuckSendingCount, oldestQueued, recentFailures, recentEvents, heartbeats, rateLimit] = await Promise.all([
    CrmMarketingCampaign.count({
      where: {
        locationId: loc,
        status: { [Op.in]: ["scheduled", "sending", "paused"] },
      },
    }),
    CrmMarketingMessage.count({
      where: {
        locationId: loc,
        status: { [Op.in]: ["pending", "queued"] },
        createdAt: { [Op.lt]: staleCutoff },
      },
    }),
    CrmMarketingMessage.count({
      where: {
        locationId: loc,
        status: "sending",
        updatedAt: { [Op.lt]: staleCutoff },
      },
    }),
    CrmMarketingMessage.findOne({
      where: {
        locationId: loc,
        status: { [Op.in]: ["pending", "queued"] },
      },
      order: [["createdAt", "ASC"]],
    }),
    CrmMarketingMessage.findAll({
      where: { locationId: loc, status: "failed" },
      order: [["updatedAt", "DESC"]],
      limit: 8,
    }),
    CrmMarketingDeliveryEvent.findAll({
      include: [
        {
          model: CrmMarketingMessage,
          as: "message",
          attributes: ["locationId", "recipient"],
          where: { locationId: loc },
          required: true,
        },
      ],
      order: [["occurredAt", "DESC"]],
      limit: 12,
    }),
    CrmMarketingWorkerHeartbeat.findAll({
      where: { workerType: "marketing-worker" },
      order: [["lastHeartbeatAt", "DESC"]],
      limit: 10,
    }),
    sendRateLimiter.getRateLimitStatus(loc),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    queues: {
      bulkConfigured: Boolean(config.aws.queues.marketingBulk),
      journeyConfigured: Boolean(config.aws.queues.marketingJourney),
      webhookEventsConfigured: Boolean(config.aws.queues.webhookEvents),
    },
    summary: {
      activeCampaigns,
      waiting: statusCounts.pending + statusCounts.queued,
      inFlight: statusCounts.sending,
      failed: statusCounts.failed,
      terminal:
        statusCounts.sent +
        statusCounts.delivered +
        statusCounts.opened +
        statusCounts.clicked +
        statusCounts.bounced +
        statusCounts.complained +
        statusCounts.unsubscribed +
        statusCounts.cancelled,
      staleQueued: staleQueuedCount,
      stuckSending: stuckSendingCount,
      oldestQueuedAt: oldestQueued?.createdAt || null,
    },
    statusCounts,
    rateLimit,
    recentFailures: recentFailures.map(serializeFailure),
    recentEvents: recentEvents.map(serializeEvent),
    workers: heartbeats.map(serializeHeartbeat),
  };
}

function serializeFailure(row) {
  return {
    id: row.id,
    campaignId: row.campaignId,
    recipient: row.recipient,
    subject: row.subject,
    status: row.status,
    lastError: row.metadata?.lastError || row.metadata?.error || null,
    retryCount: row.metadata?.retryCount || 0,
    updatedAt: row.updatedAt,
  };
}

function serializeEvent(row) {
  return {
    id: row.id,
    messageId: row.messageId,
    campaignId: row.campaignId,
    recipient: row.message?.recipient || null,
    eventType: row.eventType,
    provider: row.provider,
    providerMessageId: row.providerMessageId,
    occurredAt: row.occurredAt,
    payload: row.payload || {},
  };
}

function serializeHeartbeat(row) {
  const lastHeartbeatAt = row.lastHeartbeatAt ? new Date(row.lastHeartbeatAt) : null;
  const ageSeconds = lastHeartbeatAt ? Math.round((Date.now() - lastHeartbeatAt.getTime()) / 1000) : null;
  const health = ageSeconds === null
    ? "unknown"
    : ageSeconds <= 120
      ? "online"
      : ageSeconds <= 600
        ? "stale"
        : "offline";
  return {
    id: row.id,
    workerType: row.workerType,
    workerId: row.workerId,
    queueType: row.queueType,
    status: row.status,
    health,
    ageSeconds,
    lastStartedAt: row.lastStartedAt,
    lastHeartbeatAt: row.lastHeartbeatAt,
    lastPollAt: row.lastPollAt,
    lastProcessedAt: row.lastProcessedAt,
    lastErrorAt: row.lastErrorAt,
    lastError: row.lastError,
    totalProcessed: row.totalProcessed,
    totalFailed: row.totalFailed,
    metadata: row.metadata || {},
    updatedAt: row.updatedAt,
  };
}

module.exports = {
  getQueueMonitoring,
};
