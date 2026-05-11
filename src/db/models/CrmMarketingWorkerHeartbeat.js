const { DataTypes } = require("sequelize");

function defineCrmMarketingWorkerHeartbeat(sequelize) {
  return sequelize.define(
    "CrmMarketingWorkerHeartbeat",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      workerType: { type: DataTypes.STRING(60), allowNull: false },
      workerId: { type: DataTypes.STRING(160), allowNull: false },
      queueType: { type: DataTypes.STRING(40), allowNull: true },
      status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "starting" },
      lastStartedAt: { type: DataTypes.DATE, allowNull: true },
      lastHeartbeatAt: { type: DataTypes.DATE, allowNull: true },
      lastPollAt: { type: DataTypes.DATE, allowNull: true },
      lastProcessedAt: { type: DataTypes.DATE, allowNull: true },
      lastErrorAt: { type: DataTypes.DATE, allowNull: true },
      lastError: { type: DataTypes.TEXT, allowNull: true },
      totalProcessed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      totalFailed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    },
    {
      tableName: "crm_marketing_worker_heartbeats",
      timestamps: true,
      indexes: [
        { unique: true, fields: ["workerType", "workerId"] },
        { fields: ["workerType", "lastHeartbeatAt"] },
      ],
    }
  );
}

module.exports = defineCrmMarketingWorkerHeartbeat;
