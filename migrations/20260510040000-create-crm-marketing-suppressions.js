"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("crm_marketing_suppressions", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      locationId: { type: Sequelize.INTEGER, allowNull: false },
      email: { type: Sequelize.STRING(320), allowNull: false },
      reason: { type: Sequelize.STRING(40), allowNull: false },
      source: { type: Sequelize.STRING(80), allowNull: false, defaultValue: "manual" },
      scope: { type: Sequelize.STRING(30), allowNull: false, defaultValue: "marketing" },
      campaignId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "crm_marketing_campaigns", key: "id" },
        onDelete: "SET NULL",
      },
      messageId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "crm_marketing_messages", key: "id" },
        onDelete: "SET NULL",
      },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      suppressedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
      releasedAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
    });

    await queryInterface.addIndex("crm_marketing_suppressions", ["locationId", "email", "active"], {
      name: "crm_marketing_suppressions_location_email_active_idx",
    });
    await queryInterface.addIndex("crm_marketing_suppressions", ["locationId", "reason"], {
      name: "crm_marketing_suppressions_location_reason_idx",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("crm_marketing_suppressions");
  },
};
