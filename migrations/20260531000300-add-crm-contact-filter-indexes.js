module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS crm_contacts_tags_gin_idx
      ON crm_contacts USING gin ("tags");
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS crm_contacts_custom_fields_gin_idx
      ON crm_contacts USING gin ("customFields" jsonb_path_ops);
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS crm_contacts_location_lifecycle_idx
      ON crm_contacts ("locationId", "lifecycle");
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS crm_contacts_location_updated_idx
      ON crm_contacts ("locationId", "updatedAt" DESC);
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS crm_contacts_location_dnd_idx
      ON crm_contacts ("locationId", "doNotContact");
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS crm_contacts_full_name_trgm_idx
      ON crm_contacts USING gin ("fullName" gin_trgm_ops);
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS crm_contacts_email_trgm_idx
      ON crm_contacts USING gin ("email" gin_trgm_ops);
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS crm_contacts_phone_trgm_idx
      ON crm_contacts USING gin ("phone" gin_trgm_ops);
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS crm_segment_members_segment_status_entered_idx
      ON crm_segment_members ("segmentId", "status", "enteredAt" DESC);
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS crm_segment_members_segment_status_entered_idx;`);
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS crm_contacts_phone_trgm_idx;`);
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS crm_contacts_email_trgm_idx;`);
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS crm_contacts_full_name_trgm_idx;`);
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS crm_contacts_location_dnd_idx;`);
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS crm_contacts_location_updated_idx;`);
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS crm_contacts_location_lifecycle_idx;`);
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS crm_contacts_custom_fields_gin_idx;`);
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS crm_contacts_tags_gin_idx;`);
  },
};
