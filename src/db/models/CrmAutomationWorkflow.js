const { DataTypes } = require("sequelize");

function defineCrmAutomationWorkflow(sequelize) {
  return sequelize.define(
    "CrmAutomationWorkflow",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      locationId: { type: DataTypes.INTEGER, allowNull: false },
      name: { type: DataTypes.STRING(180), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "draft",
      },
      triggerKey: { type: DataTypes.STRING(120), allowNull: false },
      triggerLabel: { type: DataTypes.STRING(180), allowNull: false },
      nodes: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      settings: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      stats: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      publishedAt: { type: DataTypes.DATE, allowNull: true },
      lastTestedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "crm_automation_workflows",
      timestamps: true,
    }
  );
}

module.exports = defineCrmAutomationWorkflow;
