"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("crm_transactional_templates", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      locationId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      key: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },
      channel: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "email",
      },
      name: {
        type: Sequelize.STRING(180),
        allowNull: false,
      },
      category: {
        type: Sequelize.STRING(80),
        allowNull: false,
        defaultValue: "booking",
      },
      subject: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      body: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      config: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      variables: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      isSystem: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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
      "crm_transactional_templates",
      ["locationId", "key", "channel"],
      {
        unique: true,
        name: "crm_transactional_templates_location_key_channel_unique",
      }
    );

    await queryInterface.addIndex(
      "crm_transactional_templates",
      ["key", "channel", "isSystem", "isActive"],
      { name: "crm_transactional_templates_lookup_idx" }
    );

    await queryInterface.createTable("crm_transactional_delivery_events", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      messageId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "crm_transactional_messages",
          key: "id",
        },
        onDelete: "CASCADE",
      },
      provider: {
        type: Sequelize.STRING(60),
        allowNull: true,
      },
      providerMessageId: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      eventType: {
        type: Sequelize.STRING(60),
        allowNull: false,
      },
      payload: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      occurredAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
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
      "crm_transactional_delivery_events",
      ["messageId", "occurredAt"],
      { name: "crm_transactional_delivery_events_message_time_idx" }
    );

    await queryInterface.addIndex(
      "crm_transactional_delivery_events",
      ["providerMessageId", "eventType"],
      { name: "crm_transactional_delivery_events_provider_event_idx" }
    );
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("crm_transactional_delivery_events");
    await queryInterface.dropTable("crm_transactional_templates");
  },
};
