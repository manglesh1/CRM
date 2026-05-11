const { Sequelize } = require("sequelize");
const config = require("../config");
const logger = require("../shared/logger");

let sequelize = null;

function getSequelize() {
  if (sequelize) return sequelize;
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required for database access");
  }

  sequelize = new Sequelize(config.databaseUrl, {
    dialect: "postgres",
    logging: (msg) => logger.debug({ sql: msg }, "sequelize"),
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
