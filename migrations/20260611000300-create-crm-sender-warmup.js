"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("crm_sender_warmup_profiles", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      locationId: { type: Sequelize.INTEGER, allowNull: false },
      domainId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "crm_email_domains", key: "id" },
        onDelete: "CASCADE",
      },
      provider: { type: Sequelize.STRING(50), allowNull: false },
      providerConfigId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "crm_provider_configs", key: "id" },
        onDelete: "SET NULL",
      },
      status: { type: Sequelize.STRING(30), allowNull: false, defaultValue: "active" },
      stage: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      dailyLimit: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 50 },
      hourlyLimit: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 10 },
      todaySent: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      currentHourSent: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      todayDelivered: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      todayBounced: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      todayComplaints: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      todayUnsubscribed: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      todayOpened: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      todayClicked: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      windowStartedAt: {
        type: Sequelize.DATEONLY,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_DATE"),
      },
      hourWindowStartedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      startedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      completedAt: { type: Sequelize.DATE, allowNull: true },
      lastEvaluatedAt: { type: Sequelize.DATE, allowNull: true },
      pausedAt: { type: Sequelize.DATE, allowNull: true },
      pausedReason: { type: Sequelize.TEXT, allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
    });

    await queryInterface.addIndex("crm_sender_warmup_profiles", ["domainId"], {
      unique: true,
      name: "crm_sender_warmup_profiles_domain_unique",
    });
    await queryInterface.addIndex("crm_sender_warmup_profiles", ["status", "lastEvaluatedAt"], {
      name: "crm_sender_warmup_profiles_eval_idx",
    });

    await queryInterface.createTable("crm_sender_warmup_events", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      warmupProfileId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "crm_sender_warmup_profiles", key: "id" },
        onDelete: "CASCADE",
      },
      domainId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "crm_email_domains", key: "id" },
        onDelete: "CASCADE",
      },
      eventType: { type: Sequelize.STRING(40), allowNull: false },
      fromStage: { type: Sequelize.INTEGER, allowNull: true },
      toStage: { type: Sequelize.INTEGER, allowNull: true },
      reason: { type: Sequelize.TEXT, allowNull: true },
      metricsSnapshot: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
    });

    await queryInterface.addIndex("crm_sender_warmup_events", ["warmupProfileId", "createdAt"], {
      name: "crm_sender_warmup_events_profile_created_idx",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("crm_sender_warmup_events");
    await queryInterface.dropTable("crm_sender_warmup_profiles");
  },
};
