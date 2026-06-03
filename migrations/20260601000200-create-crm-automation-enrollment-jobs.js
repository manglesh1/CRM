"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("crm_automation_enrollment_jobs", {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.literal("gen_random_uuid()"), primaryKey: true, allowNull: false },
      locationId: { type: Sequelize.INTEGER, allowNull: false },
      workflowId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "crm_automation_workflows", key: "id" },
        onDelete: "CASCADE",
      },
      selection: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      source: { type: Sequelize.STRING(80), allowNull: false, defaultValue: "manual_enroll" },
      status: { type: Sequelize.STRING(40), allowNull: false, defaultValue: "queued" },
      totalTargeted: { type: Sequelize.INTEGER, allowNull: true },
      enrolledCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      succeededCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      stoppedCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      failedCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      lastContactId: { type: Sequelize.UUID, allowNull: true },
      errors: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      startedAt: { type: Sequelize.DATE, allowNull: true },
      completedAt: { type: Sequelize.DATE, allowNull: true },
      lastError: { type: Sequelize.TEXT, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
    });

    await queryInterface.addIndex("crm_automation_enrollment_jobs", ["locationId", "status", "createdAt"], {
      name: "crm_automation_enrollment_jobs_location_status_created_idx",
    });
    await queryInterface.addIndex("crm_automation_enrollment_jobs", ["workflowId", "createdAt"], {
      name: "crm_automation_enrollment_jobs_workflow_created_idx",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("crm_automation_enrollment_jobs");
  },
};
