const { Op } = require("sequelize");
const { getModels } = require("../../../db/models");
const { PROVIDER_OPTIONS } = require("./providerCatalog");
const { verifyDomainRecords } = require("../../../shared/emailDnsVerifier");
const { UNVERIFIED_TTL_DAYS } = require("../../../workers/unverifiedDomainCleaner");

const ROUTE_DEFINITIONS = [
  { routeKey: "calendar", label: "Calendar Domain" },
  { routeKey: "payments", label: "Payments" },
  { routeKey: "one_to_one", label: "One-to-one Conversation Domain" },
  { routeKey: "bulk_email", label: "Bulk Email Domain" },
  { routeKey: "campaign", label: "Campaign Domain" },
  { routeKey: "workflow", label: "Workflow Domain" },
  { routeKey: "default_dedicated", label: "Default Dedicated Domain" },
  { routeKey: "client_portal_notification", label: "Client portal notification domain" },
  { routeKey: "client_portal_otp", label: "Client portal OTP domain" },
];

async function getEmailSettings({ locationId }) {
  const { CrmProviderConfig, CrmEmailDomain, CrmEmailDomainRoute } = getModels();
  const scopedWhere = locationId ? { locationId: Number(locationId) } : {};
  const providers = await CrmProviderConfig.findAll({
    where: {
      ...scopedWhere,
      channel: "email",
      isActive: true,
    },
    order: [["domain", "ASC"], ["priority", "ASC"], ["createdAt", "ASC"]],
  });
  const domains = locationId
    ? await CrmEmailDomain.findAll({
        where: { locationId: Number(locationId) },
        order: [["createdAt", "DESC"]],
      })
    : [];
  const routes = locationId
    ? await ensureDomainRoutes({
        model: CrmEmailDomainRoute,
        locationId: Number(locationId),
      })
    : [];

  return {
    setupSteps: [
      { key: "default_provider", label: "Use Movira SES", status: "ready" },
      { key: "sending_domain", label: "Add a dedicated sending domain", status: domains.length ? "started" : "not_started" },
      { key: "dns_verification", label: "Verify DNS records", status: domains.some((d) => d.status === "verified") ? "verified" : "pending" },
      { key: "optional_provider", label: "Connect customer SMTP/SES/SendGrid", status: providers.length ? "configured" : "optional" },
    ],
    defaultProvider: PROVIDER_OPTIONS[0],
    providerOptions: PROVIDER_OPTIONS,
    providers: providers.map(serializeProvider),
    domains: domains.map(serializeDomain),
    routes: routes.map(serializeRoute),
  };
}

async function ensureDomainRoutes({ model, locationId }) {
  const rows = await model.findAll({
    where: { locationId },
    order: [["label", "ASC"]],
  });
  const byKey = new Map(rows.map((row) => [row.routeKey, row]));
  const missing = ROUTE_DEFINITIONS.filter((item) => !byKey.has(item.routeKey));
  for (const item of missing) {
    const created = await model.create({
      locationId,
      routeKey: item.routeKey,
      label: item.label,
      domainId: null,
      trafficPercent: 100,
      frequencyPolicy: {},
    });
    rows.push(created);
  }
  return rows.sort((a, b) => {
    const ai = ROUTE_DEFINITIONS.findIndex((item) => item.routeKey === a.routeKey);
    const bi = ROUTE_DEFINITIONS.findIndex((item) => item.routeKey === b.routeKey);
    return ai - bi;
  });
}

async function createDomain(body = {}) {
  const { CrmEmailDomain } = getModels();
  const domain = normalizeDomain(body.domain);
  const errors = validateDomainBody({ ...body, domain });
  if (errors.length) throwValidation(errors);

  const dup = await CrmEmailDomain.findOne({
    where: { locationId: Number(body.locationId), domain },
  });
  if (dup) {
    const err = new Error("This domain is already configured for the venue");
    err.statusCode = 409;
    throw err;
  }

  const row = await CrmEmailDomain.create({
    locationId: Number(body.locationId),
    domain,
    domainType: body.domainType || "subdomain",
    useCase: body.useCase || "marketing",
    provider: "movira_ses",
    status: "pending_dns",
    dnsRecords: buildDnsRecords(domain),
    senderName: body.senderName || null,
    senderEmail: body.senderEmail || null,
    isDefault: false,
    isActive: true,
  });

  return serializeDomain(row);
}

async function listDomains({ locationId } = {}) {
  const { CrmEmailDomain } = getModels();
  if (!locationId) {
    const err = new Error("locationId is required");
    err.statusCode = 400;
    throw err;
  }
  const rows = await CrmEmailDomain.findAll({
    where: { locationId: Number(locationId) },
    order: [["isDefault", "DESC"], ["createdAt", "DESC"]],
  });
  return rows.map(serializeDomain);
}

async function getDomain(id) {
  const { CrmEmailDomain } = getModels();
  const row = await CrmEmailDomain.findByPk(id);
  if (!row) {
    const err = new Error("Domain not found");
    err.statusCode = 404;
    throw err;
  }
  return serializeDomain(row);
}

async function deleteDomain(id) {
  const { CrmEmailDomain, CrmEmailDomainRoute } = getModels();
  const row = await CrmEmailDomain.findByPk(id);
  if (!row) {
    const err = new Error("Domain not found");
    err.statusCode = 404;
    throw err;
  }
  // Detach this domain from any routes that reference it, then hard-delete
  // so the same domain string can be re-added without a 409 conflict.
  await CrmEmailDomainRoute.update(
    { domainId: null },
    { where: { domainId: row.id } }
  );
  await row.destroy();
  return true;
}

async function setDefaultDomain(id) {
  const { CrmEmailDomain } = getModels();
  const row = await CrmEmailDomain.findByPk(id);
  if (!row) {
    const err = new Error("Domain not found");
    err.statusCode = 404;
    throw err;
  }
  await CrmEmailDomain.update(
    { isDefault: false },
    { where: { locationId: row.locationId, id: { [Op.ne]: row.id } } }
  );
  await row.update({ isDefault: true });
  return serializeDomain(row);
}

async function listDomainRoutes({ locationId } = {}) {
  const { CrmEmailDomainRoute } = getModels();
  if (!locationId) {
    const err = new Error("locationId is required");
    err.statusCode = 400;
    throw err;
  }
  const rows = await ensureDomainRoutes({
    model: CrmEmailDomainRoute,
    locationId: Number(locationId),
  });
  return rows.map(serializeRoute);
}

async function verifyDomain(id) {
  const { CrmEmailDomain } = getModels();
  const row = await CrmEmailDomain.findByPk(id);
  if (!row) {
    const err = new Error("Domain not found");
    err.statusCode = 404;
    throw err;
  }
  const seedRecords = row.dnsRecords?.length ? row.dnsRecords : buildDnsRecords(row.domain);
  const { records: checked, allOk } = await verifyDomainRecords(seedRecords, row.domain);
  const newStatus = allOk ? "verified" : "verification_requested";
  await row.update({
    status: newStatus,
    verifiedAt: allOk ? new Date() : null,
    dnsRecords: checked,
  });
  return serializeDomain(row);
}

// Verify customer-supplied credentials BEFORE saving the provider row.
// Each provider type uses its own protocol-level handshake — no row is
// touched, so the user can iterate on credentials in the modal until
// the check passes, then click Save with confidence.
async function verifyProviderConfig({ provider, config = {} } = {}) {
  const option = PROVIDER_OPTIONS.find((o) => o.provider === provider);
  if (!option) throwValidation([{ field: "provider", message: "Unknown provider" }]);
  if (!option.requiresCustomerCredentials) {
    return { ok: true, message: "Movira default — no customer credentials to verify." };
  }

  // Make sure all declared fields are populated before we hit the network.
  const missing = (option.fields || []).filter((f) => !String(config[f] || "").trim());
  if (missing.length) {
    throwValidation(
      missing.map((f) => ({
        field: `config.${f}`,
        message: `${humanizeFieldKey(f)} is required.`,
      }))
    );
  }

  if (provider === "customer_smtp") {
    return verifySmtp(config);
  }
  if (provider === "customer_ses") {
    return verifyCustomerSes(config);
  }
  if (provider === "customer_sendgrid") {
    return verifySendgrid(config);
  }
  return { ok: false, message: "Verification not implemented for this provider." };
}

async function verifySmtp(config) {
  let nodemailer;
  try {
    nodemailer = require("nodemailer");
  } catch (_e) {
    return { ok: false, message: "SMTP verification requires the nodemailer package." };
  }
  const port = Number(config.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throwValidation([{ field: "config.port", message: "SMTP port must be 1–65535." }]);
  }
  const transporter = nodemailer.createTransport({
    host: config.host,
    port,
    secure: port === 465,
    auth: { user: config.username, pass: config.password },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000,
  });
  try {
    await transporter.verify();
    return { ok: true, message: `Connected to ${config.host}:${port} and authenticated.` };
  } catch (err) {
    const reason = err?.response || err?.message || "Connection failed";
    return { ok: false, message: `SMTP verify failed: ${reason}` };
  }
}

async function verifyCustomerSes(config) {
  let SESv2Client;
  let GetAccountCommand;
  try {
    ({ SESv2Client, GetAccountCommand } = require("@aws-sdk/client-sesv2"));
  } catch (_e) {
    return { ok: false, message: "AWS SES SDK is not installed." };
  }
  try {
    const client = new SESv2Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    const out = await client.send(new GetAccountCommand({}));
    if (out?.SendingEnabled === false) {
      return {
        ok: false,
        message: "Credentials are valid, but SES sending is disabled on this account (sandbox or suspended).",
      };
    }
    return { ok: true, message: `SES account reachable in ${config.region}.` };
  } catch (err) {
    return { ok: false, message: `SES verify failed: ${err?.name || ""} ${err?.message || ""}`.trim() };
  }
}

async function verifySendgrid(config) {
  if (typeof fetch !== "function") {
    return { ok: false, message: "SendGrid verify needs Node 18+ (built-in fetch)." };
  }
  try {
    const res = await fetch("https://api.sendgrid.com/v3/user/credits", {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: "API key rejected by SendGrid." };
    }
    if (!res.ok) {
      return { ok: false, message: `SendGrid returned ${res.status} ${res.statusText}` };
    }
    return { ok: true, message: "SendGrid API key accepted." };
  } catch (err) {
    return { ok: false, message: `SendGrid verify failed: ${err?.message || "network error"}` };
  }
}

function humanizeFieldKey(key) {
  return String(key)
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

async function testProvider(id, body = {}) {
  const { CrmProviderConfig } = getModels();
  const row = await CrmProviderConfig.findByPk(id);
  if (!row) {
    const err = new Error("Provider not found");
    err.statusCode = 404;
    throw err;
  }
  await row.update({
    lastTestedAt: new Date(),
    lastTestError: body.to ? null : "Test recipient is required before sending a live test.",
  });
  return serializeProvider(row);
}

async function deleteProvider(id) {
  const { CrmProviderConfig } = getModels();
  const row = await CrmProviderConfig.findByPk(id);
  if (!row) return false;
  await row.update({ isActive: false });
  return true;
}

async function updateDomainRoute(id, body = {}) {
  const { CrmEmailDomainRoute, CrmEmailDomain } = getModels();
  const row = await CrmEmailDomainRoute.findByPk(id);
  if (!row) {
    const err = new Error("Domain route not found");
    err.statusCode = 404;
    throw err;
  }

  if (body.domainId) {
    const domain = await CrmEmailDomain.findByPk(body.domainId);
    if (!domain || Number(domain.locationId) !== Number(row.locationId)) {
      throwValidation([{ field: "domainId", message: "Choose a valid domain for this location." }]);
    }
  }

  const trafficPercent = Number(body.trafficPercent ?? row.trafficPercent);
  if (!Number.isInteger(trafficPercent) || trafficPercent < 0 || trafficPercent > 100) {
    throwValidation([{ field: "trafficPercent", message: "Traffic percentage must be between 0 and 100." }]);
  }

  await row.update({
    domainId: body.domainId || null,
    trafficPercent,
    frequencyPolicy: body.frequencyPolicy || row.frequencyPolicy || {},
  });
  return serializeRoute(row);
}

async function createProvider(body = {}) {
  const { CrmProviderConfig } = getModels();
  const provider = String(body.provider || "").trim();
  const option = PROVIDER_OPTIONS.find((item) => item.provider === provider);
  const errors = validateProviderBody(body, option);
  if (errors.length) throwValidation(errors);

  const row = await CrmProviderConfig.create({
    locationId: body.locationId ? Number(body.locationId) : null,
    domain: body.domain || "marketing",
    channel: "email",
    provider,
    displayName: body.displayName || option.label,
    priority: Number(body.priority || 100),
    isDefault: Boolean(body.isDefault),
    isActive: true,
    encryptedConfig: sanitizeConfig(body.config || {}, option.fields),
  });

  return serializeProvider(row);
}

function sanitizeConfig(config, allowedFields) {
  const out = {};
  for (const key of allowedFields || []) {
    if (config[key] !== undefined) out[key] = config[key];
  }
  return out;
}

function maskConfig(config = {}) {
  const masked = {};
  for (const [key, value] of Object.entries(config || {})) {
    if (/password|secret|key|token/i.test(key)) {
      masked[key] = value ? "********" : "";
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

function serializeProvider(row) {
  return {
    id: row.id,
    locationId: row.locationId,
    domain: row.domain,
    channel: row.channel,
    provider: row.provider,
    displayName: row.displayName,
    priority: row.priority,
    isDefault: row.isDefault,
    isActive: row.isActive,
    config: maskConfig(row.encryptedConfig),
    verifiedAt: row.verifiedAt,
    lastTestedAt: row.lastTestedAt,
    lastTestError: row.lastTestError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function serializeDomain(row) {
  // Synthesize warmup state + sender header from row age until workers
  // start updating these counters in real time.
  const stages = [
    { stage: 1, limit: 50 },
    { stage: 2, limit: 200 },
    { stage: 3, limit: 500 },
    { stage: 4, limit: 1000 },
    { stage: 5, limit: 3000 },
    { stage: 6, limit: 8000 },
    { stage: 7, limit: 10000 },
  ];
  const ageDays = Math.max(
    0,
    Math.floor((Date.now() - new Date(row.createdAt).getTime()) / 86400000)
  );
  const idx = Math.min(stages.length - 1, Math.floor(ageDays / 3));
  const warmup = stages[idx];

  const localPart = String(row.domain || "").split(".")[0] || "events";
  // Unverified domains auto-expire UNVERIFIED_TTL_DAYS after creation —
  // surface the deadline so the UI can warn customers in red.
  const expiresAt =
    row.status !== "verified"
      ? new Date(new Date(row.createdAt).getTime() + UNVERIFIED_TTL_DAYS * 86400000).toISOString()
      : null;
  return {
    id: row.id,
    locationId: row.locationId,
    domain: row.domain,
    domainType: row.domainType,
    useCase: row.useCase,
    provider: row.provider,
    status: row.status,
    dnsRecords: row.dnsRecords || [],
    senderName: row.senderName,
    senderEmail: row.senderEmail || (row.domain ? `${localPart}@${row.domain}` : null),
    isDefault: row.isDefault,
    isActive: row.isActive,
    warmupStage: row.warmupStage || warmup.stage,
    warmupTodaySent: row.warmupTodaySent || 0,
    warmupTodayLimit: row.warmupTodayLimit || warmup.limit,
    verifiedAt: row.verifiedAt,
    expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function serializeRoute(row) {
  return {
    id: row.id,
    locationId: row.locationId,
    routeKey: row.routeKey,
    label: row.label,
    domainId: row.domainId,
    trafficPercent: row.trafficPercent,
    frequencyPolicy: row.frequencyPolicy || {},
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function throwValidation(errors) {
  const err = new Error(errors[0]?.message || "Validation failed");
  err.statusCode = 400;
  err.errors = errors;
  throw err;
}

function validateProviderBody(body, option) {
  const errors = [];
  const provider = String(body.provider || "").trim();
  const domain = String(body.domain || "").trim();
  const displayName = String(body.displayName || "").trim();
  const config = body.config || {};

  if (!provider) {
    errors.push({ field: "provider", message: "Choose an email provider." });
  } else if (!option) {
    errors.push({ field: "provider", message: "This provider is not supported." });
  }

  if (!["transactional", "marketing", "both"].includes(domain)) {
    errors.push({
      field: "domain",
      message: "Choose Transactional, Marketing, or Both.",
    });
  }

  if (displayName && displayName.length > 150) {
    errors.push({ field: "displayName", message: "Display name must be 150 characters or fewer." });
  }

  if (option?.requiresCustomerCredentials) {
    for (const field of option.fields || []) {
      if (!String(config[field] || "").trim()) {
        errors.push({
          field: `config.${field}`,
          message: `${toLabel(field)} is required for ${option.label}.`,
        });
      }
    }
  }

  if (provider === "customer_smtp") {
    const port = Number(config.port);
    if (config.port && (!Number.isInteger(port) || port < 1 || port > 65535)) {
      errors.push({
        field: "config.port",
        message: "SMTP port must be a valid number between 1 and 65535.",
      });
    }
  }

  if (config.fromEmail && !isEmail(config.fromEmail)) {
    errors.push({
      field: "config.fromEmail",
      message: "From email must be a valid email address.",
    });
  }

  return errors;
}

function validateDomainBody(body) {
  const errors = [];
  if (!body.locationId) {
    errors.push({
      field: "locationId",
      message: "Select a location before adding a sending domain.",
    });
  }
  if (!body.domain) {
    errors.push({ field: "domain", message: "Enter a sending domain." });
  } else if (!isDomain(body.domain)) {
    errors.push({
      field: "domain",
      message: "Enter a valid domain, for example mail.example.com.",
    });
  }
  if (!["transactional", "marketing", "both"].includes(body.useCase || "marketing")) {
    errors.push({
      field: "useCase",
      message: "Choose Transactional, Marketing, or Both.",
    });
  }
  return errors;
}

function normalizeDomain(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function isDomain(value) {
  const v = String(value || "").trim();
  if (v.length > 253) return false;
  if (!v.includes(".")) return false;
  return /^(?!-)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i.test(v);
}

function toLabel(key) {
  return String(key)
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase());
}

function buildDnsRecords(domain) {
  const safe = String(domain || "").replace(/[^a-z0-9]/g, "");
  return [
    {
      type: "TXT",
      host: "@",
      value: "v=spf1 include:amazonses.com ~all",
      purpose: "SPF — authorises Movira SES to send for this domain",
      status: "pending",
    },
    {
      type: "TXT",
      host: `movira._domainkey.${domain}`,
      value: `k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDKKK_PLACEHOLDER_${safe}_DKIM_PUBLIC_KEY`,
      purpose: "DKIM — message body signature",
      status: "pending",
    },
    {
      type: "CNAME",
      host: `email.${domain}`,
      value: "feedback-smtp.us-east-1.amazonses.com",
      purpose: "Return-path / bounce reporting",
      status: "pending",
    },
    {
      type: "TXT",
      host: `_dmarc.${domain}`,
      value: "v=DMARC1; p=none; rua=mailto:dmarc@movira.app",
      purpose: "DMARC alignment policy",
      status: "pending",
    },
    {
      type: "MX",
      host: domain,
      value: "10 feedback-smtp.us-east-1.amazonses.com",
      purpose: "MX — required for inbound bounce/complaint feedback",
      status: "pending",
    },
  ];
}

module.exports = {
  getEmailSettings,
  createProvider,
  createDomain,
  listDomains,
  getDomain,
  deleteDomain,
  setDefaultDomain,
  listDomainRoutes,
  verifyDomain,
  verifyProviderConfig,
  testProvider,
  deleteProvider,
  updateDomainRoute,
};
