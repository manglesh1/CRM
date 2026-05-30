"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("crm_contact_tags", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      locationId: { type: Sequelize.INTEGER, allowNull: false },
      name: { type: Sequelize.STRING(80), allowNull: false },
      normalizedName: { type: Sequelize.STRING(80), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      color: { type: Sequelize.STRING(20), allowNull: true },
      createdBy: { type: Sequelize.STRING(120), allowNull: true },
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

    await queryInterface.addIndex("crm_contact_tags", ["locationId", "normalizedName"], {
      name: "crm_contact_tags_location_name_uidx",
      unique: true,
    });
    await queryInterface.addIndex("crm_contact_tags", ["locationId", "createdAt"], {
      name: "crm_contact_tags_location_created_idx",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("crm_contact_tags");
  },
};
