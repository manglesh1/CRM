"use strict";

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      ALTER TABLE crm_contact_filter_counts
      ADD COLUMN IF NOT EXISTS "invalidatedAt" TIMESTAMP WITH TIME ZONE NULL;
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      ALTER TABLE crm_contact_filter_counts
      DROP COLUMN IF EXISTS "invalidatedAt";
    `);
  },
};
