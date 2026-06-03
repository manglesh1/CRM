const { DataTypes } = require("sequelize");

function defineCrmContactBulkActionJob(sequelize) {
  return sequelize.define(
    "CrmContactBulkActionJob",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      locationId: { type: DataTypes.INTEGER, allowNull: false },
      action: { type: DataTypes.STRING(60), allowNull: false },
      selection: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      payload: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      status: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "queued",
      },
      totalTargeted: { type: DataTypes.INTEGER, allowNull: true },
      processedCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      affectedCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      failedCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      errors: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      startedAt: { type: DataTypes.DATE, allowNull: true },
      completedAt: { type: DataTypes.DATE, allowNull: true },
      lastError: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: "crm_contact_bulk_action_jobs",
      timestamps: true,
    }
  );
}

module.exports = defineCrmContactBulkActionJob;
