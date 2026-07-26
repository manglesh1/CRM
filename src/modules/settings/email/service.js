const { Op } = require("sequelize");
const { getModels } = require("../../../db/models");
const { PROVIDER_OPTIONS } = require("./providerCatalog");
const { verifyDomainRecords } = require("../../../shared/emailDnsVerifier");
const { UNVERIFIED_TTL_DAYS } = require("../../../workers/unverifiedDomainCleaner");
const { CacheService } = require("../../../shared/redisClient");
const emailProvider = require("../../messaging-core/providers/emailProviderRouter");
const providerDomain = require("./providerDomainService");
const warmupService = require("../../messaging-core/warmup/senderWarmupService");

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
  const { CrmProviderConfig, CrmEmailDomain, CrmEmailDomainRoute, CrmSenderWarmupProfile } = getModels();
  const scopedWhere = locationId ? { locationId: Number(locationId) } : {};
  let configs = await CacheService.getCache('crm:config:providers:all');
  if (!configs) {
    configs = await CrmProviderConfig.findAll({ raw: true });
    if (configs) await CacheService.setCache('crm:config:providers:all', configs);
  }
  
  const providers = (configs || []).filter(c => 
    c.channel === "email" &&
    c.isActive === true &&
    (!locationId || c.locationId === Number(locationId))
  ).sort((a, b) => {
    if (a.domain !== b.domain) return a.domain.localeCompare(b.domain);
    if (a.priority !== b.priority) return a.priority - b.priority;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
  const domains = locationId
    ? await CrmEmailDomain.findAll({
        where: { locationId: Number(locationId) },
        include: [{ model: CrmSenderWarmupProfile, as: "warmupProfile", required: false }],
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
      { key: "optional_provider", label: "Connect customer SES, SendGrid, Mailgun, or Postmark", status: providers.length ? "configured" : "optional" },
    ],
    defaultProvider: PROVIDER_OPTIONS[0],
    providerOptions: PROVIDER_OPTIONS,
    providers: providers.map(serializeProvider),
    activeProviderRoutes: buildActiveProviderRoutes(providers),
    domains: domains.map(serializeDomain),
    routes: routes.map(serializeRoute),
  };
}

function buildActiveProviderRoutes(providers = []) {
  return ["transactional", "marketing"].map((useCase) => {
    const provider = providers.find((row) => row.domain === useCase || row.domain === "both");
    return {
      useCase,
      provider: provider ? serializeProvider(provider) : null,
      isDefault: !provider,
      displayName: provider?.displayName || "Movira Email System",
      providerKey: provider?.provider || "movira_ses",
      note: provider
        ? "Customer provider overrides Movira SES for this use case."
        : "Movira SES is used because no active customer provider overrides this use case.",
    };
  });
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
  const { CrmEmailDomain, CrmProviderConfig } = getModels();
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

  const provider = String(body.provider || "movira_ses").trim();
  const providerConfigId = body.providerConfigId || null;
  const providerConfig = await resolveProviderConfig({
    model: CrmProviderConfig,
    locationId: Number(body.locationId),
    provider,
    providerConfigId,
    useCase: body.useCase || "marketing",
  });

  let identity;
  try {
    identity = await providerDomain.createDomainIdentity({ provider, providerConfig, domain });
  } catch (err) {
    const wrapped = new Error(`Domain setup failed: ${err?.message || "unknown error"}`);
    wrapped.statusCode = err?.statusCode || 502;
    throw wrapped;
  }

  const row = await CrmEmailDomain.create({
    locationId: Number(body.locationId),
    domain,
    domainType: body.domainType || "subdomain",
    useCase: body.useCase || "marketing",
    provider,
    providerConfigId: providerConfig?.id || null,
    status: "pending_dns",
    dnsRecords: identity.dnsRecords,
    senderName: body.senderName || null,
    senderEmail: body.senderEmail || null,
    providerIdentityName: identity.providerIdentityName || domain,
    providerIdentityArn: identity.providerIdentityArn || null,
    mailFromDomain: identity.mailFromDomain || null,
    lastVerificationError: null,
    isDefault: false,
    isActive: true,
  });

  return serializeDomain(row);
}

async function listDomains({ locationId } = {}) {
  const { CrmEmailDomain, CrmSenderWarmupProfile } = getModels();
  if (!locationId) {
    const err = new Error("locationId is required");
    err.statusCode = 400;
    throw err;
  }
  const rows = await CrmEmailDomain.findAll({
    where: { locationId: Number(locationId) },
    include: [{ model: CrmSenderWarmupProfile, as: "warmupProfile", required: false }],
    order: [["isDefault", "DESC"], ["createdAt", "DESC"]],
  });
  return rows.map(serializeDomain);
}

async function getDomain(id) {
  const { CrmEmailDomain, CrmSenderWarmupProfile } = getModels();
  const row = await CrmEmailDomain.findByPk(id, {
    include: [{ model: CrmSenderWarmupProfile, as: "warmupProfile", required: false }],
  });
  if (!row) {
    const err = new Error("Domain not found");
    err.statusCode = 404;
    throw err;
  }
  return serializeDomain(row);
}

async function deleteDomain(id) {
  const { CrmEmailDomain, CrmEmailDomainRoute, CrmProviderConfig } = getModels();
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
  try {
    let providerConfig = null;
    if (row.providerConfigId) {
      let configs = await CacheService.getCache('crm:config:providers:all');
      if (!configs) {
        configs = await CrmProviderConfig.findAll({ raw: true });
        if (configs) await CacheService.setCache('crm:config:providers:all', configs);
      }
      providerConfig = (configs || []).find(c => c.id === row.providerConfigId) || null;
    }
    await providerDomain.deleteDomainIdentity({
      provider: row.provider,
      providerConfig,
      domain: row.domain,
      identityName: row.providerIdentityName,
    });
  } catch (err) {
    row.lastVerificationError = `SES identity delete failed: ${err?.message || "unknown error"}`;
    await row.save();
  }
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
  if (row.status !== "verified") {
    throwValidation([{ field: "domainId", message: "Verify this domain before setting it as default." }]);
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
  const { CrmEmailDomain, CrmProviderConfig, CrmSenderWarmupProfile } = getModels();
  const row = await CrmEmailDomain.findByPk(id);
  if (!row) {
    const err = new Error("Domain not found");
    err.statusCode = 404;
    throw err;
  }
  let providerConfig = null;
  if (row.providerConfigId) {
    let configs = await CacheService.getCache('crm:config:providers:all');
    if (!configs) {
      configs = await CrmProviderConfig.findAll({ raw: true });
      if (configs) await CacheService.setCache('crm:config:providers:all', configs);
    }
    providerConfig = (configs || []).find(c => c.id === row.providerConfigId) || null;
  }
  let identity;
  try {
    identity = await providerDomain.refreshDomainIdentity({
      provider: row.provider,
      providerConfig,
      domain: row.domain,
      identityName: row.providerIdentityName,
    });
  } catch (err) {
    const wrapped = new Error(`Domain verification lookup failed: ${err?.message || "unknown error"}`);
    wrapped.statusCode = err?.statusCode || 502;
    throw wrapped;
  }

  const seedRecords = identity.dnsRecords || [];
  const { records: checked, allOk } = await verifyDomainRecords(seedRecords, row.domain);
  const providerOk = Boolean(identity.providerVerified);
  const newStatus = allOk && providerOk ? "verified" : "verification_requested";
  await row.update({
    status: newStatus,
    verifiedAt: newStatus === "verified" ? new Date() : null,
    dnsRecords: checked,
    providerIdentityName: identity?.providerIdentityName || row.providerIdentityName || row.domain,
    providerIdentityArn: identity?.providerIdentityArn || row.providerIdentityArn || null,
    mailFromDomain: identity?.mailFromDomain || row.mailFromDomain || null,
    lastDnsCheckedAt: new Date(),
    lastVerificationError: newStatus === "verified" ? null : "DNS records are still pending or SES has not marked the identity ready.",
  });
  if (newStatus === "verified") {
    await warmupService.ensureProfileForDomain(await CrmEmailDomain.findByPk(row.id));
  }
  const fresh = await CrmEmailDomain.findByPk(row.id, {
    include: [{ model: CrmSenderWarmupProfile, as: "warmupProfile", required: false }],
  });
  return serializeDomain(fresh || row);
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

  if (provider === "customer_ses") {
    return verifyCustomerSes(config);
  }
  if (provider === "customer_sendgrid") {
    return verifySendgrid(config);
  }
  if (provider === "customer_mailgun") {
    return verifyMailgun(config);
  }
  if (provider === "customer_postmark") {
    return verifyPostmark(config);
  }
  return { ok: false, message: "Verification not implemented for this provider." };
}

async function verifyCustomerSes(config) {
  validateAwsRegion(config.region, "SES region");
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

async function verifyMailgun(config) {
  if (typeof fetch !== "function") {
    return { ok: false, message: "Mailgun verify needs Node 18+ (built-in fetch)." };
  }
  try {
    const res = await fetch(`${mailgunApiBase(config.region)}/v3/domains/${encodeURIComponent(config.domain)}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${config.apiKey}`).toString("base64")}`,
      },
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: "API key rejected by Mailgun." };
    }
    if (res.status === 404) {
      return { ok: false, message: "Mailgun domain was not found for this API key." };
    }
    if (!res.ok) {
      return { ok: false, message: `Mailgun returned ${res.status} ${res.statusText}` };
    }
    return { ok: true, message: `Mailgun domain ${config.domain} is reachable.` };
  } catch (err) {
    return { ok: false, message: `Mailgun verify failed: ${err?.message || "network error"}` };
  }
}

async function verifyPostmark(config) {
  if (typeof fetch !== "function") {
    return { ok: false, message: "Postmark verify needs Node 18+ (built-in fetch)." };
  }
  try {
    const res = await fetch("https://api.postmarkapp.com/server", {
      headers: {
        Accept: "application/json",
        "X-Postmark-Server-Token": config.serverToken,
      },
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: "Server token rejected by Postmark." };
    }
    if (!res.ok) {
      return { ok: false, message: `Postmark returned ${res.status} ${res.statusText}` };
    }
    return { ok: true, message: "Postmark server token accepted." };
  } catch (err) {
    return { ok: false, message: `Postmark verify failed: ${err?.message || "network error"}` };
  }
}

function mailgunApiBase(region) {
  return String(region || "us").toLowerCase() === "eu"
    ? "https://api.eu.mailgun.net"
    : "https://api.mailgun.net";
}

function validateAwsRegion(region, label = "AWS region") {
  const value = String(region || "").trim();
  if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d+$/.test(value)) {
    throwValidation([{ field: "config.region", message: `${label} must be a valid AWS region like us-east-1 or ca-central-1.` }]);
  }
  return value;
}

function humanizeFieldKey(key) {
  return String(key)
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

async function testProvider(id, body = {}) {
  const { CrmProviderConfig } = getModels();
  let configs = await CacheService.getCache('crm:config:providers:all');
  if (!configs) {
    configs = await CrmProviderConfig.findAll({ raw: true });
    if (configs) await CacheService.setCache('crm:config:providers:all', configs);
  }
  const row = (configs || []).find(c => c.id === id) || null;
  if (!row) {
    const err = new Error("Provider not found");
    err.statusCode = 404;
    throw err;
  }
  if (!isEmail(body.to)) {
    await row.update({
      lastTestedAt: new Date(),
      lastTestError: "A valid test recipient is required before sending a live test.",
    });
    return serializeProvider(row);
  }

  try {
    await emailProvider.sendWithProviderRow(
      row,
      {
        locationId: row.locationId,
        to: String(body.to).trim(),
        subject: body.subject || `Movira provider test: ${row.displayName}`,
        html:
          body.html ||
          `<p>This is a Movira CRM test email for <strong>${row.displayName}</strong>.</p>`,
        text: body.text || `This is a Movira CRM test email for ${row.displayName}.`,
      },
      row.domain === "marketing" ? "marketing" : "transactional"
    );
    await row.update({ lastTestedAt: new Date(), lastTestError: null });
  } catch (err) {
    await row.update({
      lastTestedAt: new Date(),
      lastTestError: err?.message || "Provider test failed.",
    });
  }
  let configs = await CacheService.getCache('crm:config:providers:all');
  if (!configs) {
    configs = await CrmProviderConfig.findAll({ raw: true });
    if (configs) await CacheService.setCache('crm:config:providers:all', configs);
  }
  const row = (configs || []).find(c => c.id === id) || null;
  return serializeProvider(row);
}

async function deleteProvider(id) {
  const { CrmProviderConfig } = getModels();
  let configs = await CacheService.getCache('crm:config:providers:all');
  if (!configs) {
    configs = await CrmProviderConfig.findAll({ raw: true });
    if (configs) await CacheService.setCache('crm:config:providers:all', configs);
  }
  const row = (configs || []).find(c => c.id === id) || null;
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
    if (domain.status !== "verified") {
      throwValidation([{ field: "domainId", message: "Only verified domains can be used for routing." }]);
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
  const option = PROVIDER_OPTIONS.find((item) => item.provider === row.provider);
  return {
    id: row.id,
    locationId: row.locationId,
    domain: row.domain,
    channel: row.channel,
    provider: row.provider,
    label: option?.label || row.provider,
    capabilities: option?.capabilities || null,
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
  const localPart = String(row.domain || "").split(".")[0] || "events";
  const profile = row.warmupProfile || null;
  const todayLimit = Number(profile?.dailyLimit || 0);
  const todaySent = Number(profile?.todaySent || 0);
  const warmup = profile
    ? {
        id: profile.id,
        status: profile.status,
        stage: profile.stage,
        dailyLimit: profile.dailyLimit,
        hourlyLimit: profile.hourlyLimit,
        todaySent: profile.todaySent,
        todayLimit: profile.dailyLimit,
        currentHourSent: profile.currentHourSent,
        hourLimit: profile.hourlyLimit,
        todayDelivered: profile.todayDelivered,
        todayBounced: profile.todayBounced,
        todayComplaints: profile.todayComplaints,
        todayUnsubscribed: profile.todayUnsubscribed,
        todayOpened: profile.todayOpened,
        todayClicked: profile.todayClicked,
        pct: todayLimit ? Math.min(100, Math.round((todaySent / todayLimit) * 100)) : 0,
        pausedReason: profile.pausedReason,
        windowStartedAt: profile.windowStartedAt,
        hourWindowStartedAt: profile.hourWindowStartedAt,
        startedAt: profile.startedAt,
        completedAt: profile.completedAt,
        lastEvaluatedAt: profile.lastEvaluatedAt,
      }
    : null;
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
    providerConfigId: row.providerConfigId,
    status: row.status,
    dnsRecords: row.dnsRecords || [],
    senderName: row.senderName,
    senderEmail: row.senderEmail || (row.domain ? `${localPart}@${row.domain}` : null),
    providerIdentityName: row.providerIdentityName,
    providerIdentityArn: row.providerIdentityArn,
    mailFromDomain: row.mailFromDomain,
    lastDnsCheckedAt: row.lastDnsCheckedAt,
    lastVerificationError: row.lastVerificationError,
    isDefault: row.isDefault,
    isActive: row.isActive,
    warmup,
    warmupStage: warmup?.stage || row.warmupStage || null,
    warmupTodaySent: warmup?.todaySent || row.warmupTodaySent || 0,
    warmupTodayLimit: warmup?.todayLimit || row.warmupTodayLimit || 0,
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

  if (provider === "customer_mailgun") {
    const region = String(config.region || "").toLowerCase();
    if (!["us", "eu"].includes(region)) {
      errors.push({
        field: "config.region",
        message: "Mailgun region must be us or eu.",
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
  if (body.provider && !PROVIDER_OPTIONS.some((item) => item.provider === body.provider)) {
    errors.push({ field: "provider", message: "Choose a valid email provider." });
  }
  return errors;
}

async function resolveProviderConfig({ model, locationId, provider, providerConfigId, useCase }) {
  const option = PROVIDER_OPTIONS.find((item) => item.provider === provider);
  if (!option) throwValidation([{ field: "provider", message: "Choose a valid email provider." }]);
  if (useCase !== "both" && !option.supports.includes(useCase)) {
    throwValidation([{ field: "provider", message: "This provider does not support the selected use case." }]);
  }
  if (provider === "movira_ses") return null;
  if (!providerConfigId) {
    throwValidation([{ field: "providerConfigId", message: "Choose a connected provider before adding this domain." }]);
  }

  const row = await model.findByPk(providerConfigId);
  if (
    !row ||
    Number(row.locationId) !== Number(locationId) ||
    row.provider !== provider ||
    row.channel !== "email" ||
    !row.isActive
  ) {
    throwValidation([{ field: "providerConfigId", message: "Choose a valid active provider for this location." }]);
  }
  if (useCase !== "both" && ![useCase, "both"].includes(row.domain)) {
    throwValidation([{ field: "providerConfigId", message: "Provider route does not match the selected domain use case." }]);
  }
  return row;
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
