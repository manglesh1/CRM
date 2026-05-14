"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("crm_transactional_templates", "family", {
      type: Sequelize.STRING(60),
      allowNull: true,
    });
    await queryInterface.addColumn("crm_transactional_templates", "description", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn("crm_transactional_templates", "defaults", {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: {},
    });
    await queryInterface.addIndex("crm_transactional_templates", ["family", "isActive"], {
      name: "crm_transactional_templates_family_active_idx",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex(
      "crm_transactional_templates",
      "crm_transactional_templates_family_active_idx"
    );
    await queryInterface.removeColumn("crm_transactional_templates", "defaults");
    await queryInterface.removeColumn("crm_transactional_templates", "description");
    await queryInterface.removeColumn("crm_transactional_templates", "family");
  },
};
