const { DataTypes } = require("sequelize");

function defineCrmContactImportJob(sequelize) {
  return sequelize.define(
    "CrmContactImportJob",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      locationId: { type: DataTypes.INTEGER, allowNull: false },
      sourceType: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "csv",
      },
      fileName: { type: DataTypes.STRING(240), allowNull: true },
      status: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "completed",
      },
      totalRows: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      createdCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      updatedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      skippedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      errorCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      fieldMapping: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      errors: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      payload: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      startedAt: { type: DataTypes.DATE, allowNull: true },
      completedAt: { type: DataTypes.DATE, allowNull: true },
      lastError: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: "crm_contact_import_jobs",
      timestamps: true,
    }
  );
}

module.exports = defineCrmContactImportJob;
