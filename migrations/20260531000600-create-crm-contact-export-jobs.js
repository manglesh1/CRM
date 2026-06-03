"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("crm_contact_export_jobs", {
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
      selection: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      status: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: "queued",
      },
      totalRows: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      exportedRows: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      fileName: {
        type: Sequelize.STRING(240),
        allowNull: true,
      },
      filePath: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      storageType: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: "local",
      },
      storageBucket: {
        type: Sequelize.STRING(240),
        allowNull: true,
      },
      storageKey: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      downloadUrl: {
        type: Sequelize.TEXT,
        allowNull: true,
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

    await queryInterface.addIndex("crm_contact_export_jobs", ["locationId", "status", "createdAt"], {
      name: "crm_contact_export_jobs_location_status_created_idx",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("crm_contact_export_jobs");
  },
};
