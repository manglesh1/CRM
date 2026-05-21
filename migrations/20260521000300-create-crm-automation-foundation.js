"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("crm_automation_workflows", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      locationId: { type: Sequelize.INTEGER, allowNull: false },
      name: { type: Sequelize.STRING(180), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      status: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: "draft",
      },
      triggerKey: { type: Sequelize.STRING(120), allowNull: false },
      triggerLabel: { type: Sequelize.STRING(180), allowNull: false },
      nodes: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      settings: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      stats: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      publishedAt: { type: Sequelize.DATE, allowNull: true },
      lastTestedAt: { type: Sequelize.DATE, allowNull: true },
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

    await queryInterface.addIndex("crm_automation_workflows", ["locationId", "status"], {
      name: "crm_automation_workflows_location_status_idx",
    });
    await queryInterface.addIndex("crm_automation_workflows", ["locationId", "triggerKey"], {
      name: "crm_automation_workflows_location_trigger_idx",
    });

    await queryInterface.createTable("crm_automation_runs", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      workflowId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "crm_automation_workflows", key: "id" },
        onDelete: "CASCADE",
      },
      locationId: { type: Sequelize.INTEGER, allowNull: false },
      contactId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "crm_contacts", key: "id" },
        onDelete: "SET NULL",
      },
      runType: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: "test",
      },
      status: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: "success",
      },
      triggerKey: { type: Sequelize.STRING(120), allowNull: true },
      currentNodeId: { type: Sequelize.STRING(120), allowNull: true },
      input: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      result: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      error: { type: Sequelize.TEXT, allowNull: true },
      startedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
      completedAt: { type: Sequelize.DATE, allowNull: true },
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

    await queryInterface.addIndex("crm_automation_runs", ["workflowId", "createdAt"], {
      name: "crm_automation_runs_workflow_created_idx",
    });
    await queryInterface.addIndex("crm_automation_runs", ["locationId", "status"], {
      name: "crm_automation_runs_location_status_idx",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("crm_automation_runs");
    await queryInterface.dropTable("crm_automation_workflows");
  },
};
