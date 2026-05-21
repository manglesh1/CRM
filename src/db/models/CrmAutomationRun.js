const { DataTypes } = require("sequelize");

function defineCrmAutomationRun(sequelize) {
  return sequelize.define(
    "CrmAutomationRun",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      workflowId: { type: DataTypes.UUID, allowNull: false },
      locationId: { type: DataTypes.INTEGER, allowNull: false },
      contactId: { type: DataTypes.UUID, allowNull: true },
      runType: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "test",
      },
      status: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "success",
      },
      triggerKey: { type: DataTypes.STRING(120), allowNull: true },
      currentNodeId: { type: DataTypes.STRING(120), allowNull: true },
      input: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      result: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      error: { type: DataTypes.TEXT, allowNull: true },
      startedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      completedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "crm_automation_runs",
      timestamps: true,
    }
  );
}

module.exports = defineCrmAutomationRun;
