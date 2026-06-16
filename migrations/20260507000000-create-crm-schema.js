"use strict";

function crmSchema() {
  const schema = process.env.CRM_DB_SCHEMA || "crm";
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
    throw new Error("CRM_DB_SCHEMA must be a valid PostgreSQL identifier");
  }
  return schema;
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(crmSchema())};`);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(crmSchema())};`);
  },
};
