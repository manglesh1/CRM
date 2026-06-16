"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public`);

    await queryInterface.createTable("crm_transactional_messages", {
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
      sourceSystem: {
        type: Sequelize.STRING(80),
        allowNull: false,
        defaultValue: "aeroSportsAdmin",
      },
      sourceEventType: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      sourceResourceType: {
        type: Sequelize.STRING(80),
        allowNull: true,
      },
      sourceResourceId: {
        type: Sequelize.STRING(120),
        allowNull: true,
      },
      channel: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      recipientAddress: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      templateKey: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },
      templateVersionId: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      payload: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      priority: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "normal",
      },
      status: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: "pending",
      },
      idempotencyKey: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      provider: {
        type: Sequelize.STRING(60),
        allowNull: true,
      },
      providerMessageId: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      queuedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      sentAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      deliveredAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      failedAt: {
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

    await queryInterface.addIndex("crm_transactional_messages", ["idempotencyKey"], {
      unique: true,
      name: "crm_transactional_messages_idempotency_unique",
    });

    await queryInterface.addIndex(
      "crm_transactional_messages",
      ["locationId", "status", "createdAt"],
      { name: "crm_transactional_messages_location_status_idx" }
    );

    await queryInterface.addIndex(
      "crm_transactional_messages",
      ["sourceSystem", "sourceEventType", "sourceResourceType", "sourceResourceId"],
      { name: "crm_transactional_messages_source_idx" }
    );

    await queryInterface.addIndex(
      "crm_transactional_messages",
      ["templateKey", "createdAt"],
      { name: "crm_transactional_messages_template_idx" }
    );
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("crm_transactional_messages");
  },
};
