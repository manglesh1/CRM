const { Sequelize } = require("sequelize");
const config = require("../config");
const logger = require("../shared/logger");

let sequelize = null;

function shouldUseSsl() {
  const value = String(process.env.DB_SSL || "").toLowerCase();
  if (["false", "0", "no", "disable"].includes(value)) return false;
  if (["true", "1", "yes", "require"].includes(value)) return true;
  return config.env === "production";
}

function getSequelize() {
  if (sequelize) return sequelize;
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required for database access");
  }

  sequelize = new Sequelize(config.databaseUrl, {
    dialect: "postgres",
    logging: (msg) => logger.debug({ sql: msg }, "sequelize"),
    dialectOptions: shouldUseSsl()
      ? {
          ssl: {
            require: true,
            rejectUnauthorized: false,
          },
        }
      : undefined,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  });

  return sequelize;
}

module.exports = { getSequelize };
