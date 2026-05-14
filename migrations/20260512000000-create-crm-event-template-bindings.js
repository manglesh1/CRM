"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("crm_event_template_bindings", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      eventType: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      channel: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "email",
      },
      locationId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      templateKey: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },
      priority: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "normal",
      },
      variableMap: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      notes: {
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

    await queryInterface.addIndex(
      "crm_event_template_bindings",
      ["eventType", "channel", "locationId"],
      {
        unique: true,
        name: "crm_event_template_bindings_event_channel_location_unique",
      }
    );

    await queryInterface.addIndex(
      "crm_event_template_bindings",
      ["eventType", "channel", "isActive"],
      { name: "crm_event_template_bindings_lookup_idx" }
    );
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("crm_event_template_bindings");
  },
};
