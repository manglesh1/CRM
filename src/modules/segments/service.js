const { Op } = require("sequelize");
const { getModels } = require("../../db/models");
const filterEngine = require("../contacts/filterEngine");

async function loadCustomFields(locationId) {
  const models = getModels();
  const fields = await models.CrmContactField.findAll({ where: { locationId, archivedAt: null } });
  return fields.map((row) => (row?.get ? row.get({ plain: true }) : row));
}

function badRequest(message, errors = []) {
  const err = new Error(message);
  err.statusCode = 400;
  err.errors = errors;
  return err;
}

function notFound(label) {
  const err = new Error(`${label} not found`);
  err.statusCode = 404;
  return err;
}

function requireLocation(locationId) {
  if (!locationId) throw badRequest("locationId is required");
  const value = Number(locationId);
  if (!Number.isInteger(value) || value <= 0) throw badRequest("locationId must be a positive integer");
  return value;
}

function cleanString(value, max = 240) {
  const text = String(value || "").trim();
  return text ? text.slice(0, max) : null;
}

function arrayOfStrings(value, maxItems = 20) {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  return Array.from(new Set(list.map((item) => cleanString(item, 80)).filter(Boolean))).slice(0, maxItems);
}

function plain(row) {
  return row?.get ? row.get({ plain: true }) : row;
}

const STALE_SEGMENT_NAMES = new Set([
  "movira customers",
  "subscribed imported customers",
]);

function isMoviraCompatibleSegment(segment = {}) {
  if (STALE_SEGMENT_NAMES.has(String(segment.name || "").trim().toLowerCase())) {
    return false;
  }
  const filters = segment.filters || {};
  const sourceTypes = arrayOfStrings(filters.sourceTypes || filters.sourceType);
  return !sourceTypes.length || sourceTypes.includes("movira");
}

// Delegates to the shared advanced-filter engine. Accepts both the new
// condition-tree shape and the legacy fixed-filter shape. Returns a where
// scoped to the location.
function buildContactWhere(locationId, filters = {}, customFields = []) {
  const compiled = filterEngine.compile(filters, { customFields });
  return Object.keys(compiled).length ? { locationId, [Op.and]: [compiled] } : { locationId };
}

async function evaluateSegmentFilters({ locationId, filters = {}, page = 1, pageSize = 25 } = {}) {
  const models = getModels();
  const loc = requireLocation(locationId);
  const limit = Math.min(100, Math.max(1, Number(pageSize || 25)));
  const currentPage = Math.max(1, Number(page || 1));
  const customFields = await loadCustomFields(loc);
  const where = buildContactWhere(loc, filters, customFields);
  const result = await models.CrmContact.findAndCountAll({
    where,
    limit,
    offset: (currentPage - 1) * limit,
    order: [["updatedAt", "DESC"]],
  });
  return {
    items: result.rows.map(plain),
    total: result.count,
    page: currentPage,
    pageSize: limit,
  };
}

async function refreshSegmentMembers(segment, transaction = null) {
  const models = getModels();
  const customFields = await loadCustomFields(segment.locationId);
  const contactRows = await models.CrmContact.findAll({
    where: buildContactWhere(segment.locationId, segment.filters || {}, customFields),
    attributes: ["id"],
    transaction,
  });
  const contactIds = contactRows.map((row) => row.id);

  // Preserve manually-added members; only recompute the filter-derived ones.
  const existingMembers = await models.CrmSegmentMember.findAll({
    where: { segmentId: segment.id },
    attributes: ["contactId", "source"],
    transaction,
  });
  const manualIds = new Set(existingMembers.filter((m) => m.source === "manual").map((m) => m.contactId));

  await models.CrmSegmentMember.destroy({
    where: { segmentId: segment.id, source: "filter" },
    transaction,
  });

  const filterIds = contactIds.filter((id) => !manualIds.has(id));
  if (filterIds.length) {
    await models.CrmSegmentMember.bulkCreate(
      filterIds.map((contactId) => ({
        segmentId: segment.id,
        contactId,
        locationId: segment.locationId,
        source: "filter",
        status: "active",
        enteredAt: new Date(),
      })),
      { transaction }
    );
  }

  const updated = await segment.update(
    {
      memberCount: manualIds.size + filterIds.length,
      lastCalculatedAt: new Date(),
    },
    { transaction }
  );
  return plain(updated);
}

async function listSegments(query = {}) {
  const models = getModels();
  const locationId = requireLocation(query.locationId);
  const where = { locationId };
  const q = cleanString(query.search, 120);
  if (query.status) where.status = cleanString(query.status, 40);
  if (q) where.name = { [Op.iLike]: `%${q}%` };
  const segments = await models.CrmSegment.findAll({
    where,
    order: [["updatedAt", "DESC"]],
    limit: Math.min(100, Math.max(1, Number(query.limit || 50))),
  });
  return segments.map(plain).filter(isMoviraCompatibleSegment);
}

async function getSegment(id, query = {}) {
  const models = getModels();
  const locationId = requireLocation(query.locationId);
  const segment = await models.CrmSegment.findOne({ where: { id, locationId } });
  if (!segment) throw notFound("Segment");
  return plain(segment);
}

async function createSegment(input = {}) {
  const models = getModels();
  const locationId = requireLocation(input.locationId);
  const name = cleanString(input.name, 180);
  if (!name) throw badRequest("Segment name is required");
  const filters = input.filters && typeof input.filters === "object" ? input.filters : {};

  return models.sequelize.transaction(async (transaction) => {
    const segment = await models.CrmSegment.create(
      {
        locationId,
        name,
        description: cleanString(input.description, 2000),
        segmentType: cleanString(input.segmentType || "dynamic", 40) || "dynamic",
        status: cleanString(input.status || "active", 40) || "active",
        filters,
      },
      { transaction }
    );
    return refreshSegmentMembers(segment, transaction);
  });
}

async function updateSegment(id, input = {}) {
  const models = getModels();
  const locationId = requireLocation(input.locationId);
  const segment = await models.CrmSegment.findOne({ where: { id, locationId } });
  if (!segment) throw notFound("Segment");
  const patch = {};
  if (input.name !== undefined) patch.name = cleanString(input.name, 180);
  if (input.description !== undefined) patch.description = cleanString(input.description, 2000);
  if (input.status !== undefined) patch.status = cleanString(input.status, 40);
  if (input.segmentType !== undefined) patch.segmentType = cleanString(input.segmentType, 40);
  if (input.filters !== undefined) patch.filters = input.filters && typeof input.filters === "object" ? input.filters : {};

  return models.sequelize.transaction(async (transaction) => {
    const updated = await segment.update(patch, { transaction });
    if (input.filters !== undefined || input.refresh === true) {
      return refreshSegmentMembers(updated, transaction);
    }
    return plain(updated);
  });
}

async function deleteSegment(id, query = {}) {
  const models = getModels();
  const locationId = requireLocation(query.locationId);
  const segment = await models.CrmSegment.findOne({ where: { id, locationId } });
  if (!segment) throw notFound("Segment");
  const data = plain(segment);
  await segment.destroy();
  return data;
}

async function refreshSegment(id, query = {}) {
  const models = getModels();
  const locationId = requireLocation(query.locationId);
  const segment = await models.CrmSegment.findOne({ where: { id, locationId } });
  if (!segment) throw notFound("Segment");
  return refreshSegmentMembers(segment);
}

async function listSegmentContacts(id, query = {}) {
  const models = getModels();
  const locationId = requireLocation(query.locationId);
  const segment = await models.CrmSegment.findOne({ where: { id, locationId } });
  if (!segment) throw notFound("Segment");
  const page = Math.max(1, Number(query.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 25)));
  const result = await models.CrmSegmentMember.findAndCountAll({
    where: { segmentId: id, locationId, status: "active" },
    include: [{ model: models.CrmContact, as: "contact" }],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    order: [["enteredAt", "DESC"]],
  });
  return {
    items: result.rows.map((row) => plain(row.contact)).filter(Boolean),
    total: result.count,
    page,
    pageSize,
  };
}

async function previewSegment(input = {}) {
  return evaluateSegmentFilters({
    locationId: input.locationId,
    filters: input.filters || {},
    page: input.page || 1,
    pageSize: input.pageSize || 25,
  });
}

async function getSegmentStats(query = {}) {
  const models = getModels();
  const locationId = requireLocation(query.locationId);
  const segments = await models.CrmSegment.findAll({
    where: { locationId },
    attributes: ["id", "status", "segmentType", "filters"],
  });
  const visibleSegments = segments.map(plain).filter(isMoviraCompatibleSegment);
  const visibleSegmentIds = visibleSegments.map((segment) => segment.id);
  const members = visibleSegmentIds.length
    ? await models.CrmSegmentMember.count({ where: { locationId, status: "active", segmentId: { [Op.in]: visibleSegmentIds } } })
    : 0;
  return {
    total: visibleSegments.length,
    active: visibleSegments.filter((segment) => segment.status === "active").length,
    dynamic: visibleSegments.filter((segment) => segment.segmentType === "dynamic").length,
    members,
  };
}

module.exports = {
  listSegments,
  getSegment,
  createSegment,
  updateSegment,
  deleteSegment,
  refreshSegment,
  listSegmentContacts,
  previewSegment,
  getSegmentStats,
  buildContactWhere,
};
