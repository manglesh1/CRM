"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("crm_contact_filter_counts", {
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
      scopeHash: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      scope: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      status: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: "pending",
      },
      total: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      calculatedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      invalidatedAt: {
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

    await queryInterface.addIndex("crm_contact_filter_counts", ["locationId", "scopeHash"], {
      name: "crm_contact_filter_counts_location_hash_uidx",
      unique: true,
    });
    await queryInterface.addIndex("crm_contact_filter_counts", ["locationId", "status", "updatedAt"], {
      name: "crm_contact_filter_counts_location_status_updated_idx",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("crm_contact_filter_counts");
  },
};
