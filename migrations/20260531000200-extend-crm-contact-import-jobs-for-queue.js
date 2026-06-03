module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("crm_contact_import_jobs", "payload", {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: {},
    });
    await queryInterface.addColumn("crm_contact_import_jobs", "startedAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn("crm_contact_import_jobs", "completedAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn("crm_contact_import_jobs", "lastError", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn("crm_contact_import_jobs", "lastError");
    await queryInterface.removeColumn("crm_contact_import_jobs", "completedAt");
    await queryInterface.removeColumn("crm_contact_import_jobs", "startedAt");
    await queryInterface.removeColumn("crm_contact_import_jobs", "payload");
  },
};
