const { DataTypes } = require("sequelize");

function defineCrmContactExportJob(sequelize) {
  return sequelize.define(
    "CrmContactExportJob",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      locationId: { type: DataTypes.INTEGER, allowNull: false },
      selection: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      status: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "queued",
      },
      totalRows: { type: DataTypes.INTEGER, allowNull: true },
      exportedRows: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      fileName: { type: DataTypes.STRING(240), allowNull: true },
      filePath: { type: DataTypes.TEXT, allowNull: true },
      storageType: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "local",
      },
      storageBucket: { type: DataTypes.STRING(240), allowNull: true },
      storageKey: { type: DataTypes.TEXT, allowNull: true },
      downloadUrl: { type: DataTypes.TEXT, allowNull: true },
      startedAt: { type: DataTypes.DATE, allowNull: true },
      completedAt: { type: DataTypes.DATE, allowNull: true },
      lastError: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: "crm_contact_export_jobs",
      timestamps: true,
    }
  );
}

module.exports = defineCrmContactExportJob;
