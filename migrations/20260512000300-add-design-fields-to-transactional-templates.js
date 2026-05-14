"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("crm_transactional_templates", "editorType", {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: "code",
    });
    await queryInterface.addColumn("crm_transactional_templates", "designJson", {
      type: Sequelize.JSONB,
      allowNull: true,
    });
    await queryInterface.addColumn("crm_transactional_templates", "plainText", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn("crm_transactional_templates", "updatedByUserId", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn("crm_transactional_templates", "updatedByName", {
      type: Sequelize.STRING(150),
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn("crm_transactional_templates", "updatedByName");
    await queryInterface.removeColumn("crm_transactional_templates", "updatedByUserId");
    await queryInterface.removeColumn("crm_transactional_templates", "plainText");
    await queryInterface.removeColumn("crm_transactional_templates", "designJson");
    await queryInterface.removeColumn("crm_transactional_templates", "editorType");
  },
};
