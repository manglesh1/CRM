const { Op } = require("sequelize");
const { getModels } = require("../../../db/models");
const { getSequelize } = require("../../../db/sequelize");

const VALID_STATUSES = new Set(["draft", "active", "paused", "archived"]);

function httpError(message, statusCode = 400, errors = []) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.errors = errors;
  return err;
}

function requireLocation(locationId) {
  if (!locationId) throw httpError("locationId is required", 400);
  const loc = Number(locationId);
  if (!Number.isFinite(loc)) throw httpError("locationId must be numeric", 400);
  return loc;
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function requireDateRange(body) {
  const startDate = normalizeDate(body.startDate);
  const endDate = normalizeDate(body.endDate);
  if (!startDate || !endDate) throw httpError("Start date and end date are required.", 400);
  if (startDate > endDate) throw httpError("End date must be after start date.", 400);
  return { startDate, endDate };
}

function serializeRule(rule) {
  return {
    calendarPlanRuleId: rule.id,
    calendarPlanId: rule.planId,
    ruleType: rule.ruleType,
    sourceSystem: rule.sourceSystem,
    linkedEntityType: rule.linkedEntityType,
    linkedEntityId: rule.linkedEntityId,
    title: rule.title,
    startDate: rule.startDate,
    endDate: rule.endDate,
    status: rule.status,
    config: rule.config,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  };
}

function serializeOverride(override) {
  return {
    calendarPlanOverrideId: override.id,
    calendarPlanId: override.planId,
    title: override.title,
    overrideType: override.overrideType,
    startDate: override.startDate,
    endDate: override.endDate,
    priority: override.priority,
    color: override.color,
    status: override.status,
    config: override.config,
    createdAt: override.createdAt,
    updatedAt: override.updatedAt,
  };
}

function serializePlan(plan) {
  return {
    calendarPlanId: plan.id,
    locationId: plan.locationId,
    name: plan.name,
    description: plan.description,
    planType: plan.planType,
    status: plan.status,
    startDate: plan.startDate,
    endDate: plan.endDate,
    color: plan.color,
    visibility: plan.visibility,
    linkedCrmCampaignId: plan.linkedCrmCampaignId,
    metadata: plan.metadata,
    createdByUserId: plan.createdByUserId,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    rules: (plan.rules || []).map(serializeRule),
    overrides: (plan.overrides || []).map(serializeOverride),
  };
}

function sanitizePlanBody(body = {}, locationId, userId) {
  const { startDate, endDate } = requireDateRange(body);
  const name = String(body.name || "").trim();
  if (!name) throw httpError("Plan name is required.", 400);

  const status = String(body.status || "draft").toLowerCase();
  if (!VALID_STATUSES.has(status)) {
    throw httpError("Status must be draft, active, paused, or archived.", 400);
  }

  return {
    locationId,
    name,
    description: body.description || null,
    planType: body.planType || "campaign",
    status,
    startDate,
    endDate,
    color: body.color || null,
    visibility: body.visibility || "internal",
    linkedCrmCampaignId: body.linkedCrmCampaignId || null,
    metadata: body.metadata || null,
    createdByUserId: userId || null,
  };
}

function sanitizeRule(rule = {}) {
  const title = String(rule.title || "").trim();
  if (!title) return null;
  return {
    ruleType: rule.ruleType || "marketing",
    sourceSystem: rule.sourceSystem || "crm",
    linkedEntityType: rule.linkedEntityType || null,
    linkedEntityId: rule.linkedEntityId ? String(rule.linkedEntityId) : null,
    title,
    startDate: normalizeDate(rule.startDate) || null,
    endDate: normalizeDate(rule.endDate) || null,
    status: rule.status || "planned",
    config: rule.config || null,
  };
}

function sanitizeOverride(override = {}) {
  const title = String(override.title || "").trim();
  if (!title) return null;
  try {
    const range = requireDateRange(override);
    return {
      title,
      overrideType: override.overrideType || "special_event",
      startDate: range.startDate,
      endDate: range.endDate,
      priority: Number.isInteger(Number(override.priority)) ? Number(override.priority) : 100,
      color: override.color || null,
      status: override.status || "planned",
      config: override.config || null,
    };
  } catch {
    return null;
  }
}

function planInclude() {
  const { CrmMarketingCalendarRule, CrmMarketingCalendarOverride } = getModels();
  return [
    { model: CrmMarketingCalendarRule, as: "rules" },
    { model: CrmMarketingCalendarOverride, as: "overrides" },
  ];
}

async function listPlans({ locationId, startDate, endDate, status, search, page = 1, limit = 100 } = {}) {
  const loc = requireLocation(locationId);
  const { CrmMarketingCalendarPlan } = getModels();
  const where = { locationId: loc };

  if (status && status !== "all") where.status = status;
  if (search) where.name = { [Op.iLike]: `%${search}%` };
  if (startDate || endDate) {
    const start = normalizeDate(startDate) || "1900-01-01";
    const end = normalizeDate(endDate) || "2999-12-31";
    where[Op.and] = [
      { startDate: { [Op.lte]: end } },
      { endDate: { [Op.gte]: start } },
    ];
  }

  const parsedLimit = Math.min(Number(limit) || 100, 500);
  const parsedPage = Math.max(Number(page) || 1, 1);
  const offset = (parsedPage - 1) * parsedLimit;
  const { count, rows } = await CrmMarketingCalendarPlan.findAndCountAll({
    where,
    include: planInclude(),
    order: [
      ["startDate", "ASC"],
      ["id", "ASC"],
    ],
    limit: parsedLimit,
    offset,
    distinct: true,
  });

  return {
    total: count,
    page: parsedPage,
    limit: parsedLimit,
    data: rows.map(serializePlan),
  };
}

async function getPlan({ id, locationId }) {
  const loc = requireLocation(locationId);
  const { CrmMarketingCalendarPlan } = getModels();
  const plan = await CrmMarketingCalendarPlan.findOne({
    where: { id, locationId: loc },
    include: planInclude(),
  });
  if (!plan) throw httpError("Marketing calendar plan not found", 404);
  return { data: serializePlan(plan) };
}

async function createPlan({ body = {}, locationId, userId }) {
  const loc = requireLocation(locationId);
  const { sequelize, CrmMarketingCalendarPlan, CrmMarketingCalendarRule, CrmMarketingCalendarOverride } = getModels();
  const payload = sanitizePlanBody(body, loc, userId);

  const result = await sequelize.transaction(async (transaction) => {
    const plan = await CrmMarketingCalendarPlan.create(payload, { transaction });
    const rules = (body.rules || []).map(sanitizeRule).filter(Boolean);
    const overrides = (body.overrides || []).map(sanitizeOverride).filter(Boolean);

    if (rules.length) {
      await CrmMarketingCalendarRule.bulkCreate(
        rules.map((rule) => ({ ...rule, planId: plan.id })),
        { transaction }
      );
    }
    if (overrides.length) {
      await CrmMarketingCalendarOverride.bulkCreate(
        overrides.map((override) => ({ ...override, planId: plan.id })),
        { transaction }
      );
    }

    return CrmMarketingCalendarPlan.findByPk(plan.id, { include: planInclude(), transaction });
  });

  return { message: "Marketing calendar plan created", data: serializePlan(result) };
}

async function updatePlan({ id, body = {}, locationId }) {
  const loc = requireLocation(locationId);
  const { sequelize, CrmMarketingCalendarPlan, CrmMarketingCalendarRule, CrmMarketingCalendarOverride } = getModels();
  const plan = await CrmMarketingCalendarPlan.findOne({ where: { id, locationId: loc } });
  if (!plan) throw httpError("Marketing calendar plan not found", 404);

  const payload = sanitizePlanBody(body, loc, plan.createdByUserId);
  delete payload.createdByUserId;

  const result = await sequelize.transaction(async (transaction) => {
    await plan.update(payload, { transaction });

    if (Array.isArray(body.rules)) {
      await CrmMarketingCalendarRule.destroy({ where: { planId: plan.id }, transaction });
      const rules = body.rules.map(sanitizeRule).filter(Boolean);
      if (rules.length) {
        await CrmMarketingCalendarRule.bulkCreate(
          rules.map((rule) => ({ ...rule, planId: plan.id })),
          { transaction }
        );
      }
    }

    if (Array.isArray(body.overrides)) {
      await CrmMarketingCalendarOverride.destroy({ where: { planId: plan.id }, transaction });
      const overrides = body.overrides.map(sanitizeOverride).filter(Boolean);
      if (overrides.length) {
        await CrmMarketingCalendarOverride.bulkCreate(
          overrides.map((override) => ({ ...override, planId: plan.id })),
          { transaction }
        );
      }
    }

    return CrmMarketingCalendarPlan.findByPk(plan.id, { include: planInclude(), transaction });
  });

  return { message: "Marketing calendar plan updated", data: serializePlan(result) };
}

async function deletePlan({ id, locationId }) {
  const loc = requireLocation(locationId);
  const { CrmMarketingCalendarPlan, CrmMarketingCalendarRule, CrmMarketingCalendarOverride } = getModels();
  const sequelize = getSequelize();

  return await sequelize.transaction(async (transaction) => {
    await CrmMarketingCalendarRule.destroy({ where: { planId: id }, transaction });
    await CrmMarketingCalendarOverride.destroy({ where: { planId: id }, transaction });
    const deleted = await CrmMarketingCalendarPlan.destroy({ where: { id, locationId: loc }, transaction });
    if (!deleted) throw httpError("Marketing calendar plan not found", 404);
    return { message: "Marketing calendar plan deleted" };
  });
}

async function previewPlan({ id, locationId }) {
  const plan = (await getPlan({ id, locationId })).data;
  const rules = plan.rules || [];
  const overrides = plan.overrides || [];
  const affected = rules.reduce((acc, rule) => {
    const key = rule.ruleType || "other";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const warnings = [];
  if (!rules.length) warnings.push("No marketing items linked yet.");
  if (overrides.length) {
    warnings.push(`${overrides.length} special promo day(s) are scheduled inside this campaign window.`);
  }
  if (plan.status === "draft") warnings.push("Campaign is still draft and will not drive automation.");

  return {
    data: {
      planId: plan.calendarPlanId,
      planName: plan.name,
      dateRange: { startDate: plan.startDate, endDate: plan.endDate },
      affected,
      marketingItems: rules.length,
      promoDays: overrides.length,
      rules: rules.length,
      overrides: overrides.length,
      warnings,
      destructive: false,
    },
  };
}

module.exports = {
  listPlans,
  getPlan,
  createPlan,
  updatePlan,
  deletePlan,
  previewPlan,
};
