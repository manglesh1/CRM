"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("crm_segments", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      locationId: { type: Sequelize.INTEGER, allowNull: false },
      name: { type: Sequelize.STRING(180), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      segmentType: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: "dynamic",
      },
      status: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: "active",
      },
      filters: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      memberCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      lastCalculatedAt: { type: Sequelize.DATE, allowNull: true },
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

    await queryInterface.addIndex("crm_segments", ["locationId", "status"], {
      name: "crm_segments_location_status_idx",
    });
    await queryInterface.addIndex("crm_segments", ["locationId", "name"], {
      name: "crm_segments_location_name_idx",
    });

    await queryInterface.createTable("crm_segment_members", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      segmentId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "crm_segments", key: "id" },
        onDelete: "CASCADE",
      },
      contactId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "crm_contacts", key: "id" },
        onDelete: "CASCADE",
      },
      locationId: { type: Sequelize.INTEGER, allowNull: false },
      source: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: "filter",
      },
      status: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: "active",
      },
      enteredAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
      exitedAt: { type: Sequelize.DATE, allowNull: true },
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

    await queryInterface.addIndex("crm_segment_members", ["segmentId", "contactId"], {
      name: "crm_segment_members_segment_contact_uidx",
      unique: true,
    });
    await queryInterface.addIndex("crm_segment_members", ["locationId", "status"], {
      name: "crm_segment_members_location_status_idx",
    });
    await queryInterface.addIndex("crm_segment_members", ["contactId"], {
      name: "crm_segment_members_contact_idx",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("crm_segment_members");
    await queryInterface.dropTable("crm_segments");
  },
};
