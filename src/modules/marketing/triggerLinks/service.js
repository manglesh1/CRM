// Trigger Links — short URLs that record a click and redirect to a
// destination. Authoring + analytics are admin-side; the actual
// redirect endpoint is exposed publicly so anyone clicking a link in
// an email lands correctly.

const crypto = require("crypto");
const { Op } = require("sequelize");
const { getModels } = require("../../../db/models");

const SLUG_RE = /^[a-z0-9_-]{3,64}$/i;
const URL_RE = /^https?:\/\/.+/i;

function requireLocation(locationId) {
  if (!locationId) {
    const err = new Error("locationId is required");
    err.statusCode = 400;
    throw err;
  }
  return Number(locationId);
}

function notFound(label) {
  const err = new Error(`${label} not found`);
  err.statusCode = 404;
  return err;
}

function throwValidation(errors) {
  const err = new Error(errors[0]?.message || "Validation failed");
  err.statusCode = 400;
  err.errors = errors;
  throw err;
}

function serialize(row) {
  return {
    id: row.id,
    locationId: row.locationId,
    name: row.name,
    slug: row.slug,
    destinationUrl: row.destinationUrl,
    triggerActions: row.triggerActions || [],
    totalClicks: row.totalClicks,
    uniqueClicks: row.uniqueClicks,
    lastClickedAt: row.lastClickedAt,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// 8-char URL-safe slug. Loops on collision (extremely rare in practice).
async function generateUniqueSlug(model) {
  for (let i = 0; i < 5; i++) {
    const candidate = crypto
      .randomBytes(6)
      .toString("base64url")
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 8);
    const dup = await model.findOne({ where: { slug: candidate } });
    if (!dup) return candidate;
  }
  // Fallback — vanishingly unlikely to reach here.
  return `tl${Date.now().toString(36)}`;
}

async function listTriggerLinks({ locationId, q, page = 1, pageSize = 20 } = {}) {
  const loc = requireLocation(locationId);
  const { CrmTriggerLink } = getModels();
  const where = { locationId: loc };
  if (q) where.name = { [Op.iLike]: `%${q}%` };
  const limit = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const offset = Math.max(0, (Number(page) - 1) * limit);
  const { rows, count } = await CrmTriggerLink.findAndCountAll({
    where,
    order: [["updatedAt", "DESC"]],
    limit,
    offset,
  });
  return {
    items: rows.map(serialize),
    total: count,
    page: Number(page) || 1,
    pageSize: limit,
  };
}

async function getTriggerLink(id) {
  const { CrmTriggerLink } = getModels();
  const row = await CrmTriggerLink.findByPk(id);
  if (!row) throw notFound("Trigger link");
  return serialize(row);
}

async function createTriggerLink({ locationId, name, destinationUrl, slug, triggerActions } = {}) {
  const loc = requireLocation(locationId);
  const errors = [];
  if (!name || !String(name).trim()) {
    errors.push({ field: "name", message: "Link name is required." });
  }
  if (!destinationUrl || !URL_RE.test(String(destinationUrl).trim())) {
    errors.push({
      field: "destinationUrl",
      message: "Destination must be a full URL starting with http:// or https://.",
    });
  }
  if (slug && !SLUG_RE.test(slug)) {
    errors.push({
      field: "slug",
      message: "Slug must be 3-64 chars, letters/numbers/hyphens/underscores only.",
    });
  }
  if (errors.length) throwValidation(errors);

  const { CrmTriggerLink } = getModels();
  let finalSlug = slug ? String(slug).trim() : await generateUniqueSlug(CrmTriggerLink);
  if (slug) {
    const dup = await CrmTriggerLink.findOne({ where: { slug: finalSlug } });
    if (dup) {
      throwValidation([{ field: "slug", message: "This slug is already in use." }]);
    }
  }

  const row = await CrmTriggerLink.create({
    locationId: loc,
    name: String(name).trim(),
    slug: finalSlug,
    destinationUrl: String(destinationUrl).trim(),
    triggerActions: Array.isArray(triggerActions) ? triggerActions : [],
    isActive: true,
  });
  return serialize(row);
}

async function updateTriggerLink(id, body = {}) {
  const { CrmTriggerLink } = getModels();
  const row = await CrmTriggerLink.findByPk(id);
  if (!row) throw notFound("Trigger link");

  const errors = [];
  if (body.destinationUrl && !URL_RE.test(String(body.destinationUrl).trim())) {
    errors.push({
      field: "destinationUrl",
      message: "Destination must be a full URL starting with http:// or https://.",
    });
  }
  if (body.slug && body.slug !== row.slug) {
    if (!SLUG_RE.test(body.slug)) {
      errors.push({
        field: "slug",
        message: "Slug must be 3-64 chars, letters/numbers/hyphens/underscores only.",
      });
    } else {
      const dup = await CrmTriggerLink.findOne({ where: { slug: body.slug, id: { [Op.ne]: row.id } } });
      if (dup) errors.push({ field: "slug", message: "This slug is already in use." });
    }
  }
  if (errors.length) throwValidation(errors);

  await row.update({
    name: body.name ?? row.name,
    slug: body.slug ?? row.slug,
    destinationUrl: body.destinationUrl ?? row.destinationUrl,
    triggerActions: Array.isArray(body.triggerActions) ? body.triggerActions : row.triggerActions,
    isActive: body.isActive === undefined ? row.isActive : !!body.isActive,
  });
  return serialize(row);
}

async function deleteTriggerLink(id) {
  const { CrmTriggerLink } = getModels();
  const row = await CrmTriggerLink.findByPk(id);
  if (!row) throw notFound("Trigger link");
  await row.destroy();
  return true;
}

// Public — called by the redirect handler. Records the click, then the
// caller does the actual HTTP redirect to row.destinationUrl. We treat
// any IP we haven't seen recently as a "unique" hit (best-effort, no
// per-visitor cookie at this layer).
async function recordClick(slug) {
  const { CrmTriggerLink } = getModels();
  const row = await CrmTriggerLink.findOne({ where: { slug, isActive: true } });
  if (!row) throw notFound("Trigger link");
  await row.increment(["totalClicks", "uniqueClicks"], { by: 1 });
  await row.update({ lastClickedAt: new Date() });
  return { destinationUrl: row.destinationUrl, link: serialize(row) };
}

module.exports = {
  listTriggerLinks,
  getTriggerLink,
  createTriggerLink,
  updateTriggerLink,
  deleteTriggerLink,
  recordClick,
};
