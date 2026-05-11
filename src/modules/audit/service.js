const { Op } = require("sequelize");
const { getModels } = require("../../db/models");

const ALLOWED_ENTITY_TYPES = new Set([
  "marketing_template",
  "marketing_campaign",
  "marketing_message",
  "marketing_asset",
  "marketing_snippet",
  "marketing_suppression",
  "marketing_folder",
  "system",
]);

function actorFromUser(user = {}) {
  return {
    actorUserId: Number(user.user_id || user.id || user.userId) || null,
    actorName: user.name || user.fullName || user.username || null,
    actorEmail: user.email || user.user_email || null,
  };
}

function requestContext(req) {
  if (!req) return {};
  return {
    ...actorFromUser(req.user || {}),
    ipAddress: req.ip || req.headers?.["x-forwarded-for"] || null,
    userAgent: req.headers?.["user-agent"] || null,
    requestId: req.id || req.headers?.["x-request-id"] || null,
  };
}

function serializeAuditLog(row) {
  return {
    id: row.id,
    locationId: row.locationId,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    entityName: row.entityName,
    actorUserId: row.actorUserId,
    actorName: row.actorName,
    actorEmail: row.actorEmail,
    outcome: row.outcome,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    requestId: row.requestId,
    metadata: row.metadata || {},
    createdAt: row.createdAt,
  };
}

function compactMetadata(metadata = {}) {
  const cleaned = JSON.parse(JSON.stringify(metadata || {}));
  const text = JSON.stringify(cleaned);
  if (text.length <= 12000) return cleaned;
  return {
    truncated: true,
    originalBytes: Buffer.byteLength(text),
    summary: cleaned.summary || cleaned.message || null,
  };
}

async function recordAuditLog(input = {}) {
  const { CrmAuditLog } = getModels();
  const entityType = ALLOWED_ENTITY_TYPES.has(input.entityType) ? input.entityType : "system";
  const row = await CrmAuditLog.create({
    locationId: input.locationId ? Number(input.locationId) : null,
    action: String(input.action || "unknown").slice(0, 100),
    entityType,
    entityId: input.entityId ? String(input.entityId).slice(0, 120) : null,
    entityName: input.entityName ? String(input.entityName).slice(0, 240) : null,
    actorUserId: input.actorUserId || null,
    actorName: input.actorName || null,
    actorEmail: input.actorEmail || null,
    outcome: input.outcome || "success",
    ipAddress: input.ipAddress || null,
    userAgent: input.userAgent || null,
    requestId: input.requestId || null,
    metadata: compactMetadata(input.metadata || {}),
  });
  return serializeAuditLog(row);
}

async function listAuditLogs({
  locationId,
  entityType,
  entityId,
  action,
  outcome,
  actorUserId,
  q,
  from,
  to,
  page = 1,
  pageSize = 40,
} = {}) {
  const { CrmAuditLog } = getModels();
  const where = {};
  if (locationId) where.locationId = Number(locationId);
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = String(entityId);
  if (action) where.action = action;
  if (outcome) where.outcome = outcome;
  if (actorUserId) where.actorUserId = Number(actorUserId);
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt[Op.gte] = new Date(from);
    if (to) where.createdAt[Op.lte] = new Date(to);
  }
  if (q) {
    const needle = `%${String(q).trim()}%`;
    where[Op.or] = [
      { action: { [Op.iLike]: needle } },
      { entityType: { [Op.iLike]: needle } },
      { entityId: { [Op.iLike]: needle } },
      { entityName: { [Op.iLike]: needle } },
      { actorName: { [Op.iLike]: needle } },
      { actorEmail: { [Op.iLike]: needle } },
    ];
  }

  const limit = Math.min(100, Math.max(1, Number(pageSize) || 40));
  const currentPage = Math.max(1, Number(page) || 1);
  const offset = (currentPage - 1) * limit;
  const { rows, count } = await CrmAuditLog.findAndCountAll({
    where,
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });

  return {
    items: rows.map(serializeAuditLog),
    total: count,
    page: currentPage,
    pageSize: limit,
  };
}

module.exports = {
  requestContext,
  recordAuditLog,
  listAuditLogs,
};
