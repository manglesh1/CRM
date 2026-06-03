"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("crm_contact_bulk_action_jobs", {
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
      action: {
        type: Sequelize.STRING(60),
        allowNull: false,
      },
      selection: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      payload: {
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
      affectedCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      failedCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
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

    await queryInterface.addIndex("crm_contact_bulk_action_jobs", ["locationId", "status", "createdAt"], {
      name: "crm_contact_bulk_action_jobs_location_status_created_idx",
    });
    await queryInterface.addIndex("crm_contact_bulk_action_jobs", ["locationId", "action", "createdAt"], {
      name: "crm_contact_bulk_action_jobs_location_action_created_idx",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("crm_contact_bulk_action_jobs");
  },
};
