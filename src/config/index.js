require("dotenv").config();

const requiredInProduction = [
  "MOVIRA_CRM_DATABASE_URL",
  "JWT_SECRET",
  "INTERNAL_API_SECRET",
  "AWS_REGION",
  "SQS_TRANSACTIONAL_CRITICAL_URL",
  "SQS_TRANSACTIONAL_DEFAULT_URL",
];

function requireProductionEnv() {
  if (process.env.NODE_ENV !== "production") return;
  const missing = requiredInProduction.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing production env vars: ${missing.join(", ")}`);
  }
}

requireProductionEnv();

function booleanEnv(key, fallback = false) {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const value = String(raw).toLowerCase();
  if (["false", "0", "no", "disable"].includes(value)) return false;
  if (["true", "1", "yes", "require"].includes(value)) return true;
  return fallback;
}

const config = {
  env: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 4100),
  database: {
    crm: {
      url: process.env.MOVIRA_CRM_DATABASE_URL || null,
      envVar: "MOVIRA_CRM_DATABASE_URL",
      ssl: booleanEnv("MOVIRA_CRM_DB_SSL", process.env.NODE_ENV === "production"),
    },
  },
  redisUrl: process.env.REDIS_URL || null,
  jwtSecret: process.env.JWT_SECRET || "dev-only",
  internalApiSecret: process.env.INTERNAL_API_SECRET || "dev-only",
  urls: {
    publicBaseUrl: (process.env.CRM_PUBLIC_BASE_URL || "").replace(/\/+$/, ""),
    trackingBaseUrl: (process.env.CRM_TRACKING_BASE_URL || "").replace(/\/+$/, ""),
  },
  integrations: {
    coreApiBaseUrl: (process.env.MOVIRA_CORE_API_BASE_URL || "http://127.0.0.1:5171/api").replace(/\/+$/, ""),
  },
  aws: {
    region: process.env.AWS_REGION || "us-east-1",
    queues: {
      transactionalCritical: process.env.SQS_TRANSACTIONAL_CRITICAL_URL || "",
      transactionalCriticalDlq: process.env.SQS_TRANSACTIONAL_CRITICAL_DLQ_URL || "",
      transactionalDefault: process.env.SQS_TRANSACTIONAL_DEFAULT_URL || "",
      transactionalDefaultDlq: process.env.SQS_TRANSACTIONAL_DEFAULT_DLQ_URL || "",
      marketingBulk: process.env.SQS_MARKETING_BULK_URL || "",
      marketingJourney: process.env.SQS_MARKETING_JOURNEY_URL || "",
      webhookEvents: process.env.SQS_WEBHOOK_EVENTS_URL || "",
    },
    ses: {
      region: process.env.AWS_SES_REGION || "us-east-1",
      transactionalConfigSet: process.env.SES_TRANSACTIONAL_CONFIG_SET || "movira-transactional",
      marketingConfigSet: process.env.SES_MARKETING_CONFIG_SET || "movira-marketing",
      defaultFrom: process.env.SES_DEFAULT_FROM || "no-reply@movira.app",
    },
    s3: {
      marketingAssetsBucket: process.env.S3_MARKETING_ASSETS_BUCKET || "",
      marketingAssetsPrefix: process.env.S3_MARKETING_ASSETS_PREFIX || "marketing-assets",
      publicBaseUrl: process.env.S3_MARKETING_ASSETS_PUBLIC_BASE_URL || "",
      contactExportsBucket: process.env.S3_CONTACT_EXPORTS_BUCKET || "",
      contactExportsPrefix: process.env.S3_CONTACT_EXPORTS_PREFIX || "contact-exports",
    },
  },
  email: {
    provider: (process.env.EMAIL_PROVIDER || "ses").toLowerCase(),
    smtp: {
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 465),
      secure: String(process.env.SMTP_SECURE || "true").toLowerCase() !== "false",
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || "",
      from: process.env.EMAIL_FROM || "",
    },
  },
  marketing: {
    rateLimits: {
      perMinute: Number(process.env.MARKETING_SEND_RATE_PER_MINUTE || 60),
      perHour: Number(process.env.MARKETING_SEND_RATE_PER_HOUR || 1000),
    },
  },
  queueJobs: {
    pollMs: Number(process.env.CRM_QUEUE_WORKER_POLL_MS || 2000),
    batchSize: Number(process.env.CRM_QUEUE_WORKER_BATCH_SIZE || 10),
  },
  // Org-level sender/business identity injected as default {{business.*}} merge
  // data for marketing sends (compliance footer). Per-campaign body.data.business
  // overrides these. business.address is a legal requirement before real sends.
  business: {
    name: process.env.CRM_BUSINESS_NAME || "",
    address: process.env.CRM_BUSINESS_ADDRESS || "",
    phone: process.env.CRM_BUSINESS_PHONE || "",
    email: process.env.CRM_BUSINESS_EMAIL || "",
    website: process.env.CRM_BUSINESS_WEBSITE || "",
  },
};

module.exports = config;
