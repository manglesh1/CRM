const { Op } = require("sequelize");
const { getModels } = require("../../../db/models");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_REASONS = ["manual", "unsubscribe", "complaint", "hard_bounce", "bounce", "invalid", "admin_block"];

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function validate(rules) {
  const errors = rules.filter(Boolean);
  if (errors.length) {
    const err = new Error(errors[0].message || "Validation failed");
    err.statusCode = 400;
    err.errors = errors;
    throw err;
  }
}

function notFound(label) {
  const err = new Error(`${label} not found`);
  err.statusCode = 404;
  return err;
}

function serialize(row) {
  return {
    id: row.id,
    locationId: row.locationId,
    email: row.email,
    reason: row.reason,
    source: row.source,
    scope: row.scope,
    campaignId: row.campaignId,
    messageId: row.messageId,
    metadata: row.metadata || {},
    active: row.active,
    suppressedAt: row.suppressedAt,
    releasedAt: row.releasedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function listSuppressions({ locationId, q, reason, active = "true", page = 1, pageSize = 25 } = {}) {
  validate([!locationId && { field: "locationId", message: "locationId is required" }]);
  const { CrmMarketingSuppression } = getModels();
  const where = { locationId: Number(locationId) };
  if (active !== "") where.active = String(active) !== "false";
  if (reason) where.reason = reason;
  if (q) where.email = { [Op.iLike]: `%${normalizeEmail(q)}%` };
  const limit = Math.min(100, Math.max(1, Number(pageSize) || 25));
  const offset = Math.max(0, (Number(page) - 1) * limit);
  const { rows, count } = await CrmMarketingSuppression.findAndCountAll({
    where,
    order: [["suppressedAt", "DESC"]],
    limit,
    offset,
  });
  return { items: rows.map(serialize), total: count, page: Number(page) || 1, pageSize: limit };
}

async function findActiveSuppression(locationId, email) {
  const { CrmMarketingSuppression } = getModels();
  return CrmMarketingSuppression.findOne({
    where: {
      locationId: Number(locationId),
      email: normalizeEmail(email),
      active: true,
    },
    order: [["suppressedAt", "DESC"]],
  });
}

async function suppressEmail({ locationId, email, reason = "manual", source = "manual", scope = "global", campaignId = null, messageId = null, metadata = {} } = {}) {
  const normalized = normalizeEmail(email);
  validate([
    !locationId && { field: "locationId", message: "locationId is required" },
    !EMAIL_RE.test(normalized) && { field: "email", message: "Valid email is required" },
    !VALID_REASONS.includes(reason) && { field: "reason", message: `Reason must be one of: ${VALID_REASONS.join(", ")}.` },
  ]);

  const { CrmMarketingSuppression } = getModels();
  const existing = await findActiveSuppression(locationId, normalized);
  if (existing) {
    await existing.update({
      reason,
      source,
      campaignId: campaignId || existing.campaignId,
      messageId: messageId || existing.messageId,
      metadata: { ...(existing.metadata || {}), ...metadata },
      suppressedAt: existing.suppressedAt || new Date(),
    });
    return serialize(existing);
  }

  const row = await CrmMarketingSuppression.create({
    locationId: Number(locationId),
    email: normalized,
    reason,
    source,
    scope: scope || "global",
    campaignId,
    messageId,
    metadata,
    active: true,
    suppressedAt: new Date(),
  });
  return serialize(row);
}

async function releaseSuppression(id) {
  const { CrmMarketingSuppression } = getModels();
  const row = await CrmMarketingSuppression.findByPk(id);
  if (!row) throw notFound("Suppression");
  await row.update({ active: false, releasedAt: new Date() });
  return serialize(row);
}

async function isSuppressed(locationId, email) {
  const row = await findActiveSuppression(locationId, email);
  return row ? serialize(row) : null;
}

module.exports = {
  listSuppressions,
  suppressEmail,
  releaseSuppression,
  isSuppressed,
  normalizeEmail,
};
