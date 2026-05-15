const requiredInProduction = [
  "DATABASE_URL",
  "JWT_SECRET",
  "INTERNAL_API_SECRET",
  "AWS_REGION",
];

function requireProductionEnv() {
  if (process.env.NODE_ENV !== "production") return;
  const missing = requiredInProduction.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing production env vars: ${missing.join(", ")}`);
  }
}

requireProductionEnv();

const config = {
  env: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 4100),
  databaseUrl: process.env.DATABASE_URL || null,
  redisUrl: process.env.REDIS_URL || null,
  jwtSecret: process.env.JWT_SECRET || "dev-only",
  internalApiSecret: process.env.INTERNAL_API_SECRET || "dev-only",
  urls: {
    publicBaseUrl: (process.env.CRM_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, ""),
    trackingBaseUrl: (process.env.CRM_TRACKING_BASE_URL || process.env.CRM_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, ""),
  },
  aws: {
    region: process.env.AWS_REGION || "us-east-1",
    queues: {
      transactionalCritical: process.env.SQS_TRANSACTIONAL_CRITICAL_URL || "",
      transactionalDefault: process.env.SQS_TRANSACTIONAL_DEFAULT_URL || "",
      marketingBulk: process.env.SQS_MARKETING_BULK_URL || "",
      marketingJourney: process.env.SQS_MARKETING_JOURNEY_URL || "",
      webhookEvents: process.env.SQS_WEBHOOK_EVENTS_URL || "",
    },
    ses: {
      transactionalConfigSet:
        process.env.SES_TRANSACTIONAL_CONFIG_SET || "movira-transactional",
      marketingConfigSet: process.env.SES_MARKETING_CONFIG_SET || "movira-marketing",
      defaultFrom: process.env.SES_DEFAULT_FROM || "no-reply@movira.app",
    },
    s3: {
      marketingAssetsBucket: process.env.S3_MARKETING_ASSETS_BUCKET || "",
      marketingAssetsPrefix: process.env.S3_MARKETING_ASSETS_PREFIX || "marketing-assets",
      publicBaseUrl: process.env.S3_MARKETING_ASSETS_PUBLIC_BASE_URL || "",
    },
  },
  email: {
    provider: (process.env.EMAIL_PROVIDER || "ses").toLowerCase(),
    smtp: {
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 465),
      secure: String(process.env.SMTP_SECURE || "true").toLowerCase() !== "false",
      user: process.env.SMTP_USER || process.env.EMAIL_FROM || "",
      pass: process.env.SMTP_PASS || process.env.EMAIL_PASSWORD || "",
      from: process.env.EMAIL_FROM || process.env.SMTP_USER || "",
    },
  },
  marketing: {
    rateLimits: {
      perMinute: Number(process.env.MARKETING_SEND_RATE_PER_MINUTE || 60),
      perHour: Number(process.env.MARKETING_SEND_RATE_PER_HOUR || 1000),
    },
  },
};

module.exports = config;
