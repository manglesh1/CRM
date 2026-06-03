"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("crm_marketing_campaign_audience_jobs", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      locationId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      campaignId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "crm_marketing_campaigns", key: "id" },
        onDelete: "CASCADE",
      },
      templateId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "crm_marketing_templates", key: "id" },
        onDelete: "RESTRICT",
      },
      audience: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      sendOptions: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      status: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: "queued",
      },
      totalTargeted: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      processedCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      queuedCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      suppressedCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      duplicateCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      ineligibleCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      failedCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      lastContactId: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      errors: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      startedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      completedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      lastError: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
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

    await queryInterface.addIndex("crm_marketing_campaign_audience_jobs", ["locationId", "status", "createdAt"], {
      name: "crm_marketing_campaign_audience_jobs_location_status_created_idx",
    });
    await queryInterface.addIndex("crm_marketing_campaign_audience_jobs", ["campaignId", "createdAt"], {
      name: "crm_marketing_campaign_audience_jobs_campaign_created_idx",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("crm_marketing_campaign_audience_jobs");
  },
};
