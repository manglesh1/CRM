"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("crm_marketing_worker_heartbeats", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      workerType: {
        type: Sequelize.STRING(60),
        allowNull: false,
      },
      workerId: {
        type: Sequelize.STRING(160),
        allowNull: false,
      },
      queueType: {
        type: Sequelize.STRING(40),
        allowNull: true,
      },
      status: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: "starting",
      },
      lastStartedAt: { type: Sequelize.DATE, allowNull: true },
      lastHeartbeatAt: { type: Sequelize.DATE, allowNull: true },
      lastPollAt: { type: Sequelize.DATE, allowNull: true },
      lastProcessedAt: { type: Sequelize.DATE, allowNull: true },
      lastErrorAt: { type: Sequelize.DATE, allowNull: true },
      lastError: { type: Sequelize.TEXT, allowNull: true },
      totalProcessed: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      totalFailed: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
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
      "crm_marketing_worker_heartbeats",
      ["workerType", "workerId"],
      {
        unique: true,
        name: "crm_marketing_worker_heartbeats_worker_idx",
      }
    );
    await queryInterface.addIndex(
      "crm_marketing_worker_heartbeats",
      ["workerType", "lastHeartbeatAt"],
      { name: "crm_marketing_worker_heartbeats_seen_idx" }
    );
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("crm_marketing_worker_heartbeats");
  },
};
