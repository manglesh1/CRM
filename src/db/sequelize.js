const { Sequelize } = require("sequelize");
const config = require("../config");
const logger = require("../shared/logger");

let sequelize = null;

function shouldUseSsl() {
  return config.database.crm.ssl;
}

function getSequelize() {
  if (sequelize) return sequelize;
  const crmDatabase = config.database.crm;
  if (!crmDatabase.url) {
    throw new Error("MOVIRA_CRM_DATABASE_URL is required for CRM database access");
  }

  logger.info({ databaseEnvVar: crmDatabase.envVar, schema: crmDatabase.schema }, "connecting to Movira CRM database");
  const dialectOptions = {
    options: `-c search_path=${crmDatabase.schema},public`,
    ...(shouldUseSsl()
      ? {
          ssl: {
            require: true,
            rejectUnauthorized: false,
          },
        }
      : {}),
  };
  sequelize = new Sequelize(crmDatabase.url, {
    dialect: "postgres",
    logging: (msg) => logger.debug({ sql: msg }, "sequelize"),
    dialectOptions,
    define: {
      schema: crmDatabase.schema,
    },
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
