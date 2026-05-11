const { DataTypes } = require("sequelize");

function defineCrmAuditLog(sequelize) {
  return sequelize.define(
    "CrmAuditLog",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      locationId: { type: DataTypes.INTEGER, allowNull: true },
      action: { type: DataTypes.STRING(100), allowNull: false },
      entityType: { type: DataTypes.STRING(80), allowNull: false },
      entityId: { type: DataTypes.STRING(120), allowNull: true },
      entityName: { type: DataTypes.STRING(240), allowNull: true },
      actorUserId: { type: DataTypes.INTEGER, allowNull: true },
      actorName: { type: DataTypes.STRING(150), allowNull: true },
      actorEmail: { type: DataTypes.STRING(320), allowNull: true },
      outcome: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "success" },
      ipAddress: { type: DataTypes.STRING(80), allowNull: true },
      userAgent: { type: DataTypes.TEXT, allowNull: true },
      requestId: { type: DataTypes.STRING(120), allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    },
    {
      tableName: "crm_audit_logs",
      timestamps: true,
    }
  );
}

module.exports = defineCrmAuditLog;
