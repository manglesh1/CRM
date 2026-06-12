const { DataTypes } = require("sequelize");

function defineCrmSenderWarmupEvent(sequelize) {
  return sequelize.define(
    "CrmSenderWarmupEvent",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      warmupProfileId: { type: DataTypes.UUID, allowNull: false },
      domainId: { type: DataTypes.UUID, allowNull: false },
      eventType: { type: DataTypes.STRING(40), allowNull: false },
      fromStage: { type: DataTypes.INTEGER, allowNull: true },
      toStage: { type: DataTypes.INTEGER, allowNull: true },
      reason: { type: DataTypes.TEXT, allowNull: true },
      metricsSnapshot: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    },
    {
      tableName: "crm_sender_warmup_events",
      timestamps: true,
    }
  );
}

module.exports = defineCrmSenderWarmupEvent;
