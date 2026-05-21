// CRUD for admin-defined custom customer fields (crm_contact_fields) plus the
// field catalog endpoint that drives the advanced-filter builder, the
// "Manage fields" drawer and the grid column set.

const { Op } = require("sequelize");
const { getModels } = require("../../db/models");
const catalog = require("../contacts/fieldCatalog");

const KEY_RE = /^[a-z][a-z0-9_]*$/;
const RESERVED_KEYS = new Set(catalog.BUILTIN_FIELDS.map((field) => field.key.toLowerCase()));

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

function cleanString(value, max = 160) {
  const text = String(value || "").trim();
  return text ? text.slice(0, max) : null;
}

function plain(row) {
  return row?.get ? row.get({ plain: true }) : row;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^([0-9])/, "f_$1")
    .slice(0, 80);
}

function normalizeOptions(fieldType, options) {
  if (fieldType !== "dropdown") return [];
  const list = Array.isArray(options)
    ? options
    : String(options || "")
      .split(/[\n,]/)
      .map((item) => item.trim());
  return Array.from(new Set(list.map((item) => cleanString(item, 120)).filter(Boolean))).slice(0, 100);
}

async function listFields(query = {}) {
  const models = getModels();
  const locationId = requireLocation(query.locationId);
  const fields = await models.CrmContactField.findAll({
    where: { locationId, archivedAt: null },
    order: [["sortOrder", "ASC"], ["createdAt", "ASC"]],
  });
  return fields.map(plain);
}

async function getCatalog(query = {}) {
  const fields = await listFields(query);
  return catalog.buildCatalog(fields);
}

async function createField(input = {}) {
  const models = getModels();
  const locationId = requireLocation(input.locationId);
  const label = cleanString(input.label, 160);
  if (!label) throw badRequest("Field label is required");

  const fieldType = cleanString(input.fieldType || "text", 40) || "text";
  if (!catalog.CUSTOM_FIELD_TYPES.includes(fieldType)) {
    throw badRequest(`Unsupported field type: ${fieldType}`);
  }

  let key = slugify(input.key || label);
  if (!key || !KEY_RE.test(key)) throw badRequest("Field key must start with a letter and use only letters, numbers, underscore");
  if (RESERVED_KEYS.has(key)) throw badRequest(`"${key}" is a reserved field key`);

  const existing = await models.CrmContactField.findOne({ where: { locationId, key } });
  if (existing && !existing.archivedAt) throw badRequest(`A field with key "${key}" already exists`);

  const options = normalizeOptions(fieldType, input.options);
  if (fieldType === "dropdown" && !options.length) throw badRequest("Dropdown fields need at least one option");

  if (existing && existing.archivedAt) {
    const revived = await existing.update({
      label,
      fieldType,
      options,
      showInTable: input.showInTable !== undefined ? Boolean(input.showInTable) : false,
      sortOrder: Number.isInteger(Number(input.sortOrder)) ? Number(input.sortOrder) : 0,
      archivedAt: null,
    });
    return plain(revived);
  }

  const field = await models.CrmContactField.create({
    locationId,
    key,
    label,
    fieldType,
    options,
    showInTable: Boolean(input.showInTable),
    sortOrder: Number.isInteger(Number(input.sortOrder)) ? Number(input.sortOrder) : 0,
  });
  return plain(field);
}

async function updateField(id, input = {}) {
  const models = getModels();
  const locationId = requireLocation(input.locationId);
  const field = await models.CrmContactField.findOne({ where: { id, locationId } });
  if (!field) throw notFound("Field");

  const patch = {};
  if (input.label !== undefined) {
    const label = cleanString(input.label, 160);
    if (!label) throw badRequest("Field label is required");
    patch.label = label;
  }
  if (input.fieldType !== undefined) {
    const fieldType = cleanString(input.fieldType, 40);
    if (!catalog.CUSTOM_FIELD_TYPES.includes(fieldType)) throw badRequest(`Unsupported field type: ${fieldType}`);
    patch.fieldType = fieldType;
  }
  const nextType = patch.fieldType || field.fieldType;
  if (input.options !== undefined || patch.fieldType) {
    const options = normalizeOptions(nextType, input.options !== undefined ? input.options : field.options);
    if (nextType === "dropdown" && !options.length) throw badRequest("Dropdown fields need at least one option");
    patch.options = options;
  }
  if (input.showInTable !== undefined) patch.showInTable = Boolean(input.showInTable);
  if (input.sortOrder !== undefined && Number.isInteger(Number(input.sortOrder))) patch.sortOrder = Number(input.sortOrder);

  const updated = await field.update(patch);
  return plain(updated);
}

async function reorderFields(input = {}) {
  const models = getModels();
  const locationId = requireLocation(input.locationId);
  const order = Array.isArray(input.order) ? input.order : [];
  await models.sequelize.transaction(async (transaction) => {
    for (let index = 0; index < order.length; index += 1) {
      await models.CrmContactField.update(
        { sortOrder: index },
        { where: { id: order[index], locationId }, transaction }
      );
    }
  });
  return listFields({ locationId });
}

async function deleteField(id, query = {}) {
  const models = getModels();
  const locationId = requireLocation(query.locationId);
  const field = await models.CrmContactField.findOne({ where: { id, locationId } });
  if (!field) throw notFound("Field");
  const data = plain(field);
  await field.destroy();
  return data;
}

module.exports = {
  listFields,
  getCatalog,
  createField,
  updateField,
  reorderFields,
  deleteField,
};
