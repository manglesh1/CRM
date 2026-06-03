"use strict";

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      ALTER TABLE crm_contact_export_jobs
      ADD COLUMN IF NOT EXISTS "storageType" VARCHAR(40) NOT NULL DEFAULT 'local',
      ADD COLUMN IF NOT EXISTS "storageBucket" VARCHAR(240) NULL,
      ADD COLUMN IF NOT EXISTS "storageKey" TEXT NULL;
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      ALTER TABLE crm_contact_export_jobs
      DROP COLUMN IF EXISTS "storageKey",
      DROP COLUMN IF EXISTS "storageBucket",
      DROP COLUMN IF EXISTS "storageType";
    `);
  },
};
