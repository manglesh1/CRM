const { DataTypes } = require("sequelize");

function defineCrmAutomationEnrollmentJob(sequelize) {
  return sequelize.define(
    "CrmAutomationEnrollmentJob",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      locationId: { type: DataTypes.INTEGER, allowNull: false },
      workflowId: { type: DataTypes.UUID, allowNull: false },
      selection: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      source: { type: DataTypes.STRING(80), allowNull: false, defaultValue: "manual_enroll" },
      status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: "queued" },
      totalTargeted: { type: DataTypes.INTEGER, allowNull: true },
      enrolledCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      succeededCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      stoppedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      failedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      lastContactId: { type: DataTypes.UUID, allowNull: true },
      errors: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      startedAt: { type: DataTypes.DATE, allowNull: true },
      completedAt: { type: DataTypes.DATE, allowNull: true },
      lastError: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: "crm_automation_enrollment_jobs",
      timestamps: true,
    }
  );
}

module.exports = defineCrmAutomationEnrollmentJob;
