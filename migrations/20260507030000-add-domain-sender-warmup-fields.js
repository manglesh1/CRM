"use strict";

/**
 * Adds UI-display + warmup tracking fields to crm_email_domains:
 *   - senderName, senderEmail   (sender header shown in clients)
 *   - warmupStage, warmupTodaySent, warmupTodayLimit  (workers/cron will own these)
 *   - isDefault, isActive       (default outbound domain + soft-delete flag)
 */

function crmSchema() {
  return process.env.CRM_DB_SCHEMA || "crm";
}

function tableName(tableName) {
  return { tableName, schema: crmSchema() };
}

const TABLE = tableName("crm_email_domains");

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn(TABLE, "senderName", {
      type: Sequelize.STRING(150),
      allowNull: true,
    });
    await queryInterface.addColumn(TABLE, "senderEmail", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    await queryInterface.addColumn(TABLE, "warmupStage", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 1,
    });
    await queryInterface.addColumn(TABLE, "warmupTodaySent", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn(TABLE, "warmupTodayLimit", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 50,
    });
    await queryInterface.addColumn(TABLE, "isDefault", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn(TABLE, "isActive", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn(TABLE, "isActive");
    await queryInterface.removeColumn(TABLE, "isDefault");
    await queryInterface.removeColumn(TABLE, "warmupTodayLimit");
    await queryInterface.removeColumn(TABLE, "warmupTodaySent");
    await queryInterface.removeColumn(TABLE, "warmupStage");
    await queryInterface.removeColumn(TABLE, "senderEmail");
    await queryInterface.removeColumn(TABLE, "senderName");
  },
};
