"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("crm_marketing_messages", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      locationId: { type: Sequelize.INTEGER, allowNull: false },
      campaignId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "crm_marketing_campaigns", key: "id" },
        onDelete: "SET NULL",
      },
      templateId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "crm_marketing_templates", key: "id" },
        onDelete: "SET NULL",
      },
      channel: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "email" },
      recipient: { type: Sequelize.STRING(320), allowNull: false },
      subject: { type: Sequelize.STRING(500), allowNull: true },
      status: { type: Sequelize.STRING(30), allowNull: false, defaultValue: "pending" },
      provider: { type: Sequelize.STRING(60), allowNull: true },
      providerMessageId: { type: Sequelize.STRING(255), allowNull: true },
      payload: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      queuedAt: { type: Sequelize.DATE, allowNull: true },
      sentAt: { type: Sequelize.DATE, allowNull: true },
      deliveredAt: { type: Sequelize.DATE, allowNull: true },
      openedAt: { type: Sequelize.DATE, allowNull: true },
      clickedAt: { type: Sequelize.DATE, allowNull: true },
      bouncedAt: { type: Sequelize.DATE, allowNull: true },
      complainedAt: { type: Sequelize.DATE, allowNull: true },
      unsubscribedAt: { type: Sequelize.DATE, allowNull: true },
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
      "crm_marketing_messages",
      ["locationId", "campaignId", "status"],
      { name: "crm_marketing_messages_campaign_status_idx" }
    );
    await queryInterface.addIndex(
      "crm_marketing_messages",
      ["providerMessageId"],
      { name: "crm_marketing_messages_provider_message_idx" }
    );

    await queryInterface.createTable("crm_marketing_delivery_events", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      messageId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "crm_marketing_messages", key: "id" },
        onDelete: "CASCADE",
      },
      campaignId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "crm_marketing_campaigns", key: "id" },
        onDelete: "SET NULL",
      },
      provider: { type: Sequelize.STRING(60), allowNull: true },
      providerMessageId: { type: Sequelize.STRING(255), allowNull: true },
      eventType: { type: Sequelize.STRING(60), allowNull: false },
      payload: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
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
      "crm_marketing_delivery_events",
      ["messageId", "occurredAt"],
      { name: "crm_marketing_delivery_events_message_time_idx" }
    );
    await queryInterface.addIndex(
      "crm_marketing_delivery_events",
      ["providerMessageId", "eventType"],
      { name: "crm_marketing_delivery_events_provider_event_idx" }
    );
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("crm_marketing_delivery_events");
    await queryInterface.dropTable("crm_marketing_messages");
  },
};
