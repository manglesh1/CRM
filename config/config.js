require("dotenv").config();

const base = {
  dialect: "postgres",
  logging: false,
};

function shouldUseSsl() {
  const value = String(process.env.DB_SSL || "").toLowerCase();
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
    use_env_variable: "DATABASE_URL",
    ...base,
    ...sslOptions(),
  };
}

function fromParts() {
  return {
    username: process.env.DB_USERNAME || "your_db_username",
    password: process.env.DB_PASSWORD || "your_db_password",
    database: process.env.DB_NAME || "trampoline_booking_db",
    host: process.env.DB_HOST || "127.0.0.1",
    ...base,
    ...sslOptions(),
  };
}

module.exports = {
  development: process.env.DATABASE_URL ? fromUrl() : fromParts(),
  test: process.env.DATABASE_URL ? fromUrl() : fromParts(),
  production: process.env.DATABASE_URL ? fromUrl() : fromParts(),
};
