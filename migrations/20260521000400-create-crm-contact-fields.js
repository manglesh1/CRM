"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("crm_contact_fields", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      locationId: { type: Sequelize.INTEGER, allowNull: false },
      key: { type: Sequelize.STRING(80), allowNull: false },
      label: { type: Sequelize.STRING(160), allowNull: false },
      fieldType: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: "text",
      },
      options: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      showInTable: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      sortOrder: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      isSystem: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      archivedAt: { type: Sequelize.DATE, allowNull: true },
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

    await queryInterface.addIndex("crm_contact_fields", ["locationId", "key"], {
      name: "crm_contact_fields_location_key_uidx",
      unique: true,
    });
    await queryInterface.addIndex("crm_contact_fields", ["locationId", "archivedAt"], {
      name: "crm_contact_fields_location_archived_idx",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("crm_contact_fields");
  },
};
