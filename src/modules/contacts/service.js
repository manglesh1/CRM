const { Op } = require("sequelize");
const config = require("../../config");
const { getModels } = require("../../db/models");
const segmentService = require("../segments/service");
const filterEngine = require("./filterEngine");
const catalog = require("./fieldCatalog");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_SOURCE_TYPES = new Set(["movira", "csv", "manual", "form", "api", "webhook", "imported"]);
const VALID_MARKETING_STATUSES = new Set(["subscribed", "unsubscribed", "bounced", "complained", "unknown"]);
const VALID_LIFECYCLES = new Set(["lead", "customer", "member", "guest", "prospect", "inactive", "vip"]);
const STALE_SEGMENT_NAMES = ["movira customers", "subscribed imported customers"];

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

function normalizeEmail(email) {
  const value = String(email || "").trim().toLowerCase();
  return value || null;
}

function normalizePhone(phone) {
  const value = String(phone || "").replace(/[^\d+]/g, "").trim();
  return value || null;
}

function cleanString(value, max = 240) {
  const text = String(value || "").trim();
  return text ? text.slice(0, max) : null;
}

function splitName(input) {
  const fullName = cleanString(input.fullName || input.name || [input.firstName, input.lastName].filter(Boolean).join(" "));
  const firstName = cleanString(input.firstName, 120);
  const lastName = cleanString(input.lastName, 120);
  if (firstName || lastName || !fullName) return { fullName, firstName, lastName };
  const parts = fullName.split(/\s+/);
  return {
    fullName,
    firstName: parts[0] || null,
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
  };
}

function normalizeTags(tags) {
  const list = Array.isArray(tags)
    ? tags
    : String(tags || "")
      .split(",")
      .map((item) => item.trim());
  return Array.from(new Set(list.map((item) => cleanString(item, 80)).filter(Boolean)));
}

function mergeTags(existing = [], incoming = []) {
  return Array.from(new Set([...normalizeTags(existing), ...normalizeTags(incoming)]));
}

function plain(row) {
  return row?.get ? row.get({ plain: true }) : row;
}

function contactPayload(input = {}, locationId) {
  const names = splitName(input);
  const email = cleanString(input.email || input.guestEmail, 320);
  const normalizedEmail = normalizeEmail(email);
  const phone = cleanString(input.phone || input.guestPhone, 60);
  const normalizedPhone = normalizePhone(phone);
  const sourceType = cleanString(input.sourceType || input.source || "manual", 40) || "manual";
  const lifecycle = cleanString(input.lifecycle || input.type || "lead", 40) || "lead";
  const marketingStatus = cleanString(input.marketingStatus || "subscribed", 40) || "subscribed";

  if (!normalizedEmail && !normalizedPhone) {
    throw badRequest("Contact requires at least email or phone");
  }
  if (normalizedEmail && !EMAIL_RE.test(normalizedEmail)) {
    throw badRequest("Valid email is required");
  }
  if (!VALID_SOURCE_TYPES.has(sourceType)) {
    throw badRequest(`Unsupported sourceType: ${sourceType}`);
  }
  if (!VALID_LIFECYCLES.has(lifecycle)) {
    throw badRequest(`Unsupported lifecycle: ${lifecycle}`);
  }
  if (!VALID_MARKETING_STATUSES.has(marketingStatus)) {
    throw badRequest(`Unsupported marketingStatus: ${marketingStatus}`);
  }

  return {
    locationId,
    ...names,
    email,
    normalizedEmail,
    phone,
    normalizedPhone,
    sourceType,
    sourceRefType: cleanString(input.sourceRefType || input.externalType, 80),
    sourceRefId: cleanString(input.sourceRefId || input.externalId, 120),
    lifecycle,
    marketingStatus,
    smsStatus: cleanString(input.smsStatus || "unknown", 40) || "unknown",
    doNotContact: Boolean(input.doNotContact),
    tags: normalizeTags(input.tags),
    customFields: input.customFields && typeof input.customFields === "object" ? input.customFields : {},
    sourceSnapshot: input.sourceSnapshot && typeof input.sourceSnapshot === "object" ? input.sourceSnapshot : {},
    lastEngagedAt: input.lastEngagedAt || null,
  };
}

function identityPayload(input = {}, contact, locationId) {
  const externalType = cleanString(input.externalType || input.sourceRefType, 80);
  const externalId = cleanString(input.externalId || input.sourceRefId, 160);
  if (!externalType || !externalId) return null;
  return {
    contactId: contact.id,
    locationId,
    provider: cleanString(input.provider || input.identityProvider || input.sourceType || "movira", 40) || "movira",
    externalType,
    externalId,
    metadata: input.identityMetadata && typeof input.identityMetadata === "object" ? input.identityMetadata : {},
  };
}

async function findExistingContact(models, payload, identity, transaction) {
  if (identity) {
    const existingIdentity = await models.CrmContactIdentity.findOne({
      where: {
        locationId: identity.locationId,
        provider: identity.provider,
        externalType: identity.externalType,
        externalId: identity.externalId,
      },
      include: [{ model: models.CrmContact, as: "contact" }],
      transaction,
    });
    if (existingIdentity?.contact) return existingIdentity.contact;
  }

  if (payload.normalizedEmail) {
    const byEmail = await models.CrmContact.findOne({
      where: { locationId: payload.locationId, normalizedEmail: payload.normalizedEmail },
      transaction,
    });
    if (byEmail) return byEmail;
  }

  if (payload.normalizedPhone) {
    return models.CrmContact.findOne({
      where: { locationId: payload.locationId, normalizedPhone: payload.normalizedPhone },
      transaction,
    });
  }
  return null;
}

async function upsertContact(input = {}) {
  const models = getModels();
  const locationId = requireLocation(input.locationId);
  const payload = contactPayload(input, locationId);
  const provisionalIdentity = identityPayload(input, { id: null }, locationId);

  return models.sequelize.transaction(async (transaction) => {
    const existing = await findExistingContact(models, payload, provisionalIdentity, transaction);
    let contact;
    let created = false;
    if (existing) {
      const next = {
        ...payload,
        fullName: payload.fullName || existing.fullName,
        firstName: payload.firstName || existing.firstName,
        lastName: payload.lastName || existing.lastName,
        email: payload.email || existing.email,
        normalizedEmail: payload.normalizedEmail || existing.normalizedEmail,
        phone: payload.phone || existing.phone,
        normalizedPhone: payload.normalizedPhone || existing.normalizedPhone,
        tags: mergeTags(existing.tags, payload.tags),
        customFields: { ...(existing.customFields || {}), ...(payload.customFields || {}) },
        sourceSnapshot: { ...(existing.sourceSnapshot || {}), ...(payload.sourceSnapshot || {}) },
        doNotContact: Boolean(existing.doNotContact || payload.doNotContact),
      };
      contact = await existing.update(next, { transaction });
    } else {
      contact = await models.CrmContact.create(payload, { transaction });
      created = true;
    }

    const identity = identityPayload(input, contact, locationId);
    if (identity) {
      await models.CrmContactIdentity.findOrCreate({
        where: {
          locationId,
          provider: identity.provider,
          externalType: identity.externalType,
          externalId: identity.externalId,
        },
        defaults: identity,
        transaction,
      });
    }

    return { contact: plain(contact), created };
  });
}

async function listContacts(query = {}) {
  const models = getModels();
  const locationId = requireLocation(query.locationId);
  const page = Math.max(1, Number(query.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 25)));
  const where = { locationId };
  const q = cleanString(query.search, 120);

  if (query.includeAllSources === true || query.includeAllSources === "true") {
    if (query.sourceType) where.sourceType = cleanString(query.sourceType, 40);
  } else {
    where.sourceType = cleanString(query.sourceType || "movira", 40);
  }
  if (query.marketingStatus) where.marketingStatus = cleanString(query.marketingStatus, 40);
  if (q) {
    where[Op.or] = [
      { fullName: { [Op.iLike]: `%${q}%` } },
      { email: { [Op.iLike]: `%${q}%` } },
      { phone: { [Op.iLike]: `%${q}%` } },
    ];
  }

  const result = await models.CrmContact.findAndCountAll({
    where,
    limit: pageSize,
    offset: (page - 1) * pageSize,
    order: [["updatedAt", "DESC"]],
  });

  return {
    items: result.rows.map(plain),
    page,
    pageSize,
    total: result.count,
  };
}

async function getContact(id, query = {}) {
  const models = getModels();
  const locationId = requireLocation(query.locationId);
  const contact = await models.CrmContact.findOne({
    where: { id, locationId },
    include: [{ model: models.CrmContactIdentity, as: "identities" }],
  });
  if (!contact) throw notFound("Contact");
  return plain(contact);
}

async function updateContact(id, input = {}) {
  const models = getModels();
  const locationId = requireLocation(input.locationId);
  const contact = await models.CrmContact.findOne({ where: { id, locationId } });
  if (!contact) throw notFound("Contact");
  const payload = contactPayload({ ...plain(contact), ...input }, locationId);
  const updated = await contact.update({
    ...payload,
    tags: normalizeTags(input.tags ?? contact.tags),
    customFields: input.customFields && typeof input.customFields === "object"
      ? { ...(contact.customFields || {}), ...input.customFields }
      : contact.customFields,
    sourceSnapshot: input.sourceSnapshot && typeof input.sourceSnapshot === "object"
      ? { ...(contact.sourceSnapshot || {}), ...input.sourceSnapshot }
      : contact.sourceSnapshot,
  });
  return plain(updated);
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function parseCsvText(csvText) {
  const lines = String(csvText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce((row, header, index) => {
      row[header] = values[index] || "";
      return row;
    }, {});
  });
}

function mapImportRow(row = {}, defaults = {}) {
  const pick = (...keys) => keys.map((key) => row[key]).find((value) => value !== undefined && value !== null && String(value).trim() !== "");
  return {
    ...defaults,
    fullName: pick("fullName", "Full Name", "name", "Name"),
    firstName: pick("firstName", "First Name", "firstname", "first_name"),
    lastName: pick("lastName", "Last Name", "lastname", "last_name"),
    email: pick("email", "Email", "guestEmail"),
    phone: pick("phone", "Phone", "guestPhone"),
    tags: pick("tags", "Tags"),
    lifecycle: pick("lifecycle", "Lifecycle", "type") || defaults.lifecycle,
    sourceRefType: pick("sourceRefType", "externalType"),
    sourceRefId: pick("sourceRefId", "externalId", "id", "ID"),
    customFields: row.customFields && typeof row.customFields === "object" ? row.customFields : {},
    sourceSnapshot: row,
  };
}

function mapCoreCustomerToContact(customer = {}, defaults = {}) {
  const rawTags = Array.isArray(customer.tags) ? customer.tags : [];
  const tags = new Set(rawTags.filter(Boolean));
  if (customer.waiverStatus && customer.waiverStatus !== "none") tags.add(`waiver:${customer.waiverStatus}`);
  if (Number(customer.bookingCount || 0) > 0) tags.add("booking-customer");
  if (Number(customer.visitCount || 0) > 0) tags.add("visited");

  return {
    ...defaults,
    fullName: customer.name,
    email: customer.email,
    phone: customer.phone,
    sourceType: "movira",
    sourceRefType: "guest",
    sourceRefId: String(customer.id || customer.guestId || ""),
    externalType: "guest",
    externalId: String(customer.id || customer.guestId || ""),
    lifecycle: customer.lifecycle || (Number(customer.bookingCount || 0) > 0 ? "customer" : "lead"),
    marketingStatus: customer.doNotContact ? "unsubscribed" : "subscribed",
    doNotContact: Boolean(customer.doNotContact),
    provider: "movira",
    tags: Array.from(tags),
    customFields: {
      address: customer.address || null,
      postcode: customer.postcode || null,
      gender: customer.gender || null,
      bookingCount: Number(customer.bookingCount || 0),
      totalSpend: Number(customer.totalSpend || 0),
      totalDiscount: Number(customer.totalDiscount || 0),
      visitCount: Number(customer.visitCount || 0),
      lastVisit: customer.lastVisit || null,
      waiverStatus: customer.waiverStatus || "none",
      engagementScore: Number(customer.engagementScore || 0),
      ...(customer.customAttributes && typeof customer.customAttributes === "object" ? customer.customAttributes : {}),
    },
    sourceSnapshot: customer,
    lastEngagedAt: customer.lastEngagedAt || customer.lastVisit || null,
  };
}

async function fetchCoreCustomersPage({ authorization, locationId, page, limit, search }) {
  if (!authorization) throw badRequest("Authorization token is required for customer sync");
  if (!config.integrations.coreApiBaseUrl) throw badRequest("MOVIRA_CORE_API_BASE_URL is not configured");

  const url = new URL(`${config.integrations.coreApiBaseUrl}/customers`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("locationId", String(locationId));
  if (search) url.searchParams.set("search", search);

  const response = await fetch(url, {
    headers: {
      Authorization: authorization,
      Accept: "application/json",
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(body.error || body.message || `Core customer sync failed with ${response.status}`);
    err.statusCode = response.status;
    throw err;
  }
  return body;
}

async function syncMoviraCustomers(input = {}) {
  const models = getModels();
  const locationId = requireLocation(input.locationId);
  const limit = Math.min(100, Math.max(1, Number(input.limit || input.pageSize || 100)));
  const maxPages = Math.min(50, Math.max(1, Number(input.maxPages || 10)));
  const search = cleanString(input.search, 120);
  const authorization = input.authorization;

  const errors = [];
  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let totalRows = 0;
  const synced = [];

  await models.sequelize.transaction(async (transaction) => {
    const nonMoviraContacts = await models.CrmContact.findAll({
      where: { locationId, sourceType: { [Op.ne]: "movira" } },
      attributes: ["id"],
      transaction,
    });
    const contactIds = nonMoviraContacts.map((contact) => contact.id);
    if (contactIds.length) {
      await models.CrmSegmentMember.destroy({ where: { locationId, contactId: { [Op.in]: contactIds } }, transaction });
      await models.CrmContactIdentity.destroy({ where: { locationId, contactId: { [Op.in]: contactIds } }, transaction });
      await models.CrmContact.destroy({ where: { locationId, id: { [Op.in]: contactIds } }, transaction });
    }
    await models.CrmContactImportJob.destroy({ where: { locationId, sourceType: { [Op.ne]: "movira" } }, transaction });

    const staleSegments = await models.CrmSegment.findAll({
      where: { locationId },
      attributes: ["id", "name"],
      transaction,
    });
    const staleSegmentIds = staleSegments
      .filter((segment) => STALE_SEGMENT_NAMES.includes(String(segment.name || "").trim().toLowerCase()))
      .map((segment) => segment.id);
    if (staleSegmentIds.length) {
      await models.CrmSegmentMember.destroy({ where: { locationId, segmentId: { [Op.in]: staleSegmentIds } }, transaction });
      await models.CrmSegment.destroy({ where: { locationId, id: { [Op.in]: staleSegmentIds } }, transaction });
    }
  });

  for (let page = 1; page <= maxPages; page += 1) {
    const body = await fetchCoreCustomersPage({ authorization, locationId, page, limit, search });
    const rows = Array.isArray(body.data) ? body.data : Array.isArray(body.items) ? body.items : [];
    if (!rows.length) break;
    totalRows += rows.length;

    for (let index = 0; index < rows.length; index += 1) {
      try {
        const mapped = mapCoreCustomerToContact(rows[index], { locationId });
        const result = await upsertContact(mapped);
        if (result.created) createdCount += 1;
        else updatedCount += 1;
        synced.push(result.contact);
      } catch (err) {
        skippedCount += 1;
        errors.push({ page, row: index + 1, sourceId: rows[index]?.id || rows[index]?.guestId, message: err.message });
      }
    }

    const totalAvailable = Number(body.total || 0);
    if (totalAvailable && page * limit >= totalAvailable) break;
    if (rows.length < limit) break;
  }

  const job = await models.CrmContactImportJob.create({
    locationId,
    sourceType: "movira",
    fileName: "Movira customer sync",
    status: errors.length ? "completed_with_errors" : "completed",
    totalRows,
    createdCount,
    updatedCount,
    skippedCount,
    errorCount: errors.length,
    fieldMapping: {
      id: "sourceRefId",
      name: "fullName",
      email: "email",
      phone: "phone",
      lifecycle: "lifecycle",
    },
    errors,
  });

  const dynamicSegments = await models.CrmSegment.findAll({
    where: { locationId, segmentType: "dynamic", status: "active" },
    attributes: ["id"],
  });
  for (const segment of dynamicSegments) {
    await segmentService.refreshSegment(segment.id, { locationId });
  }

  return {
    job: plain(job),
    contacts: synced.slice(0, 25),
    refreshedSegments: dynamicSegments.length,
  };
}

async function importContacts(input = {}) {
  const models = getModels();
  const locationId = requireLocation(input.locationId);
  const sourceType = cleanString(input.sourceType || "csv", 40) || "csv";
  const rows = Array.isArray(input.contacts) ? input.contacts : parseCsvText(input.csvText);
  if (!rows.length) throw badRequest("contacts or csvText is required");

  const errors = [];
  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const imported = [];

  for (let index = 0; index < rows.length; index += 1) {
    try {
      const mapped = mapImportRow(rows[index], {
        locationId,
        sourceType,
        lifecycle: input.lifecycle || "lead",
        provider: sourceType,
      });
      const result = await upsertContact(mapped);
      if (result.created) createdCount += 1;
      else updatedCount += 1;
      imported.push(result.contact);
    } catch (err) {
      skippedCount += 1;
      errors.push({ row: index + 1, message: err.message });
    }
  }

  const job = await models.CrmContactImportJob.create({
    locationId,
    sourceType,
    fileName: cleanString(input.fileName, 240),
    status: errors.length ? "completed_with_errors" : "completed",
    totalRows: rows.length,
    createdCount,
    updatedCount,
    skippedCount,
    errorCount: errors.length,
    fieldMapping: input.fieldMapping && typeof input.fieldMapping === "object" ? input.fieldMapping : {},
    errors,
  });

  return { job: plain(job), contacts: imported.slice(0, 25) };
}

async function listImportJobs(query = {}) {
  const models = getModels();
  const locationId = requireLocation(query.locationId);
  const limit = Math.min(50, Math.max(1, Number(query.limit || 20)));
  const where = { locationId };
  if (query.includeAllSources === true || query.includeAllSources === "true") {
    if (query.sourceType) where.sourceType = cleanString(query.sourceType, 40);
  } else {
    where.sourceType = cleanString(query.sourceType || "movira", 40);
  }
  const jobs = await models.CrmContactImportJob.findAll({
    where,
    limit,
    order: [["createdAt", "DESC"]],
  });
  return jobs.map(plain);
}

async function getContactStats(query = {}) {
  const models = getModels();
  const locationId = requireLocation(query.locationId);
  const sourceWhere = query.includeAllSources === true || query.includeAllSources === "true" ? { locationId } : { locationId, sourceType: "movira" };
  const [total, subscribed, doNotContact, movira] = await Promise.all([
    models.CrmContact.count({ where: sourceWhere }),
    models.CrmContact.count({ where: { ...sourceWhere, marketingStatus: "subscribed", doNotContact: false } }),
    models.CrmContact.count({ where: { ...sourceWhere, doNotContact: true } }),
    models.CrmContact.count({ where: { locationId, sourceType: "movira" } }),
  ]);
  return { total, subscribed, doNotContact, movira };
}

async function loadCustomFields(locationId) {
  const models = getModels();
  const fields = await models.CrmContactField.findAll({
    where: { locationId, archivedAt: null },
  });
  return fields.map(plain);
}

// Builds the shared query scope for the grid / export / bulk-target resolution.
// A selected segment is resolved through its materialized membership table
// (crm_segment_members) so both filter-computed AND manually added members show.
// Ad-hoc advanced filters + free-text search compile against crm_contacts.
function buildSearchScope(models, locationId, { segmentId, filters, search, customFields = [] }) {
  const and = [];
  if (filters) {
    const fragment = filterEngine.compile(filters, { customFields });
    if (Object.keys(fragment).length) and.push(fragment);
  }
  const searchFragment = filterEngine.searchFragment(search);
  if (searchFragment) and.push(searchFragment);

  const where = and.length ? { locationId, [Op.and]: and } : { locationId };
  const include = segmentId
    ? [{
        model: models.CrmSegmentMember,
        as: "segmentMemberships",
        where: { segmentId, status: "active" },
        attributes: [],
        required: true,
      }]
    : [];
  const hasConstraint = and.length > 0 || Boolean(segmentId);
  return { where, include, hasConstraint };
}

// Powers the customers grid: advanced filter tree + free-text
// search + optional saved segment, with sortable columns and pagination.
async function searchContacts(input = {}) {
  const models = getModels();
  const locationId = requireLocation(input.locationId);
  const page = Math.max(1, Number(input.page || 1));
  const pageSize = Math.min(200, Math.max(1, Number(input.pageSize || 50)));

  const sortBy = catalog.SORTABLE_COLUMNS.has(input.sortBy) ? input.sortBy : "updatedAt";
  const sortDir = String(input.sortDir || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";

  const customFields = await loadCustomFields(locationId);
  const { where, include } = buildSearchScope(models, locationId, {
    segmentId: input.segmentId,
    filters: input.filters,
    search: input.search,
    customFields,
  });

  const result = await models.CrmContact.findAndCountAll({
    where,
    include,
    distinct: include.length > 0,
    limit: pageSize,
    offset: (page - 1) * pageSize,
    order: [[sortBy, sortDir]],
  });

  return {
    items: result.rows.map(plain),
    page,
    pageSize,
    total: result.count,
    sortBy,
    sortDir: sortDir.toLowerCase(),
  };
}

async function resolveBulkTargetIds(models, locationId, input, customFields) {
  if (Array.isArray(input.ids) && input.ids.length) {
    const rows = await models.CrmContact.findAll({
      where: { locationId, id: { [Op.in]: input.ids.slice(0, 10000) } },
      attributes: ["id"],
    });
    return rows.map((row) => row.id);
  }
  const { where, include, hasConstraint } = buildSearchScope(models, locationId, {
    segmentId: input.segmentId,
    filters: input.filters,
    search: input.search,
    customFields,
  });
  if (!hasConstraint && !input.allowAll) return [];
  const rows = await models.CrmContact.findAll({ where, include, attributes: ["id"], limit: 10000 });
  return rows.map((row) => row.id);
}

// Multi-select bulk operations from the grid: tagging, status changes, deletes,
// and adding selections to a segment as manual members.
async function bulkUpdateContacts(input = {}) {
  const models = getModels();
  const locationId = requireLocation(input.locationId);
  const action = cleanString(input.action, 40);
  if (!action) throw badRequest("action is required");

  const customFields = await loadCustomFields(locationId);
  const ids = await resolveBulkTargetIds(models, locationId, input, customFields);
  if (!ids.length) return { action, affected: 0 };

  const scope = { locationId, id: { [Op.in]: ids } };

  if (action === "delete") {
    await models.sequelize.transaction(async (transaction) => {
      await models.CrmSegmentMember.destroy({ where: { locationId, contactId: { [Op.in]: ids } }, transaction });
      await models.CrmContactIdentity.destroy({ where: { locationId, contactId: { [Op.in]: ids } }, transaction });
      await models.CrmContact.destroy({ where: scope, transaction });
    });
    return { action, affected: ids.length };
  }

  if (action === "set_marketing_status") {
    const status = cleanString(input.marketingStatus, 40);
    if (!VALID_MARKETING_STATUSES.has(status)) throw badRequest(`Unsupported marketingStatus: ${status}`);
    const [affected] = await models.CrmContact.update({ marketingStatus: status }, { where: scope });
    return { action, affected };
  }

  if (action === "set_do_not_contact") {
    const value = Boolean(input.doNotContact);
    const [affected] = await models.CrmContact.update({ doNotContact: value }, { where: scope });
    return { action, affected };
  }

  if (action === "set_lifecycle") {
    const lifecycle = cleanString(input.lifecycle, 40);
    if (!VALID_LIFECYCLES.has(lifecycle)) throw badRequest(`Unsupported lifecycle: ${lifecycle}`);
    const [affected] = await models.CrmContact.update({ lifecycle }, { where: scope });
    return { action, affected };
  }

  if (action === "add_tags" || action === "remove_tags") {
    const tags = normalizeTags(input.tags);
    if (!tags.length) throw badRequest("tags is required");
    const removeSet = new Set(tags);
    const contacts = await models.CrmContact.findAll({ where: scope });
    await models.sequelize.transaction(async (transaction) => {
      for (const contact of contacts) {
        const next = action === "add_tags"
          ? mergeTags(contact.tags, tags)
          : normalizeTags(contact.tags).filter((tag) => !removeSet.has(tag));
        await contact.update({ tags: next }, { transaction });
      }
    });
    return { action, affected: contacts.length };
  }

  if (action === "add_to_segment") {
    // targetSegmentId is the destination; keep it distinct from input.segmentId,
    // which (if present) only scopes the selection source.
    const destinationId = input.targetSegmentId || input.segmentId;
    const segment = await models.CrmSegment.findOne({ where: { id: destinationId, locationId } });
    if (!segment) throw notFound("Segment");
    await models.sequelize.transaction(async (transaction) => {
      for (const contactId of ids) {
        await models.CrmSegmentMember.findOrCreate({
          where: { segmentId: segment.id, contactId },
          defaults: { segmentId: segment.id, contactId, locationId, source: "manual", status: "active", enteredAt: new Date() },
          transaction,
        });
      }
      const memberCount = await models.CrmSegmentMember.count({
        where: { segmentId: segment.id, status: "active" },
        transaction,
      });
      await segment.update({ memberCount }, { transaction });
    });
    return { action, affected: ids.length, segmentId: segment.id };
  }

  throw badRequest(`Unsupported bulk action: ${action}`);
}

// Distinct tags across a location's customers — powers tag autocomplete.
async function listContactTags(query = {}) {
  const models = getModels();
  const locationId = requireLocation(query.locationId);
  const search = cleanString(query.search, 80);
  const limit = Math.min(200, Math.max(1, Number(query.limit || 100)));
  const rows = await models.sequelize.query(
    `SELECT DISTINCT tag FROM (
       SELECT jsonb_array_elements_text(tags) AS tag
       FROM crm_contacts WHERE "locationId" = :locationId
     ) t
     WHERE tag <> ''${search ? " AND tag ILIKE :search" : ""}
     ORDER BY tag ASC
     LIMIT :limit`,
    {
      replacements: { locationId, limit, ...(search ? { search: `%${search}%` } : {}) },
      type: models.sequelize.QueryTypes.SELECT,
    }
  );
  return rows.map((row) => row.tag);
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Exports the matching customers (same filter as the grid) as a CSV string.
async function exportContacts(input = {}) {
  const models = getModels();
  const locationId = requireLocation(input.locationId);
  const cap = Math.min(50000, Math.max(1, Number(input.limit || 50000)));
  const customFields = await loadCustomFields(locationId);

  const { where, include } = buildSearchScope(models, locationId, {
    segmentId: input.segmentId,
    filters: input.filters,
    search: input.search,
    customFields,
  });

  const rows = await models.CrmContact.findAll({ where, include, order: [["updatedAt", "DESC"]], limit: cap });

  const baseHeaders = [
    ["fullName", "Name"], ["firstName", "First name"], ["lastName", "Last name"],
    ["email", "Email"], ["phone", "Phone"], ["lifecycle", "Lifecycle"],
    ["marketingStatus", "Marketing status"], ["smsStatus", "SMS status"],
    ["sourceType", "Source"], ["doNotContact", "Do not contact"], ["tags", "Tags"],
    ["createdAt", "Created"], ["updatedAt", "Last activity"],
  ];
  const header = [...baseHeaders.map((h) => h[1]), ...customFields.map((f) => f.label)];

  const lines = [header.map(csvCell).join(",")];
  for (const row of rows) {
    const contact = plain(row);
    const base = baseHeaders.map(([key]) => {
      if (key === "tags") return Array.isArray(contact.tags) ? contact.tags.join("; ") : "";
      if (key === "doNotContact") return contact.doNotContact ? "yes" : "no";
      return contact[key];
    });
    const custom = customFields.map((f) => (contact.customFields ? contact.customFields[f.key] : ""));
    lines.push([...base, ...custom].map(csvCell).join(","));
  }

  return { csv: lines.join("\n"), count: rows.length, fileName: `customers-${Date.now()}.csv` };
}

async function deleteContact(id, query = {}) {
  const models = getModels();
  const locationId = requireLocation(query.locationId);
  const contact = await models.CrmContact.findOne({ where: { id, locationId } });
  if (!contact) throw notFound("Contact");
  const data = plain(contact);
  await models.sequelize.transaction(async (transaction) => {
    await models.CrmSegmentMember.destroy({ where: { locationId, contactId: id }, transaction });
    await models.CrmContactIdentity.destroy({ where: { locationId, contactId: id }, transaction });
    await contact.destroy({ transaction });
  });
  return data;
}

module.exports = {
  upsertContact,
  listContacts,
  searchContacts,
  bulkUpdateContacts,
  listContactTags,
  exportContacts,
  deleteContact,
  getContact,
  updateContact,
  importContacts,
  syncMoviraCustomers,
  listImportJobs,
  getContactStats,
  normalizeEmail,
  normalizePhone,
};
