require("dotenv").config();

if (process.env.NODE_ENV === "production" && !process.env.MOVIRA_CRM_DATABASE_URL) {
  throw new Error("MOVIRA_CRM_DATABASE_URL is required for Movira CRM production migrations");
}

const base = {
  dialect: "postgres",
  logging: false,
};

function shouldUseSsl() {
  const value = String(process.env.MOVIRA_CRM_DB_SSL || "").toLowerCase();
  if (["false", "0", "no", "disable"].includes(value)) return false;
  if (["true", "1", "yes", "require"].includes(value)) return true;
  return process.env.NODE_ENV === "production";
}

function sslOptions() {
  if (!shouldUseSsl()) return {};
  return {
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
  };
}

function fromUrl() {
  return {
    use_env_variable: "MOVIRA_CRM_DATABASE_URL",
    ...base,
    ...sslOptions(),
  };
}

function fromParts() {
  return {
    username: process.env.MOVIRA_CRM_DB_USERNAME || "your_db_username",
    password: process.env.MOVIRA_CRM_DB_PASSWORD || "your_db_password",
    database: process.env.MOVIRA_CRM_DB_NAME || "movira_crm_db",
    host: process.env.MOVIRA_CRM_DB_HOST || "127.0.0.1",
    port: Number(process.env.MOVIRA_CRM_DB_PORT || 5432),
    ...base,
    ...sslOptions(),
  };
}

function hasDatabaseUrl() {
  return Boolean(process.env.MOVIRA_CRM_DATABASE_URL);
}

module.exports = {
  development: hasDatabaseUrl() ? fromUrl() : fromParts(),
  test: hasDatabaseUrl() ? fromUrl() : fromParts(),
  production: hasDatabaseUrl() ? fromUrl() : fromParts(),
};
