const { DataTypes } = require("sequelize");

function defineCrmSenderWarmupProfile(sequelize) {
  return sequelize.define(
    "CrmSenderWarmupProfile",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      locationId: { type: DataTypes.INTEGER, allowNull: false },
      domainId: { type: DataTypes.UUID, allowNull: false },
      provider: { type: DataTypes.STRING(50), allowNull: false },
      providerConfigId: { type: DataTypes.UUID, allowNull: true },
      status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "active" },
      stage: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      dailyLimit: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 50 },
      hourlyLimit: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 10 },
      todaySent: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      currentHourSent: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      todayDelivered: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      todayBounced: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      todayComplaints: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      todayUnsubscribed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      todayOpened: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      todayClicked: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      windowStartedAt: { type: DataTypes.DATEONLY, allowNull: false, defaultValue: DataTypes.NOW },
      hourWindowStartedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      startedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      completedAt: { type: DataTypes.DATE, allowNull: true },
      lastEvaluatedAt: { type: DataTypes.DATE, allowNull: true },
      pausedAt: { type: DataTypes.DATE, allowNull: true },
      pausedReason: { type: DataTypes.TEXT, allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    },
    {
      tableName: "crm_sender_warmup_profiles",
      timestamps: true,
    }
  );
}

module.exports = defineCrmSenderWarmupProfile;
