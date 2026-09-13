const { DataTypes } = require("sequelize");

function defineCrmMarketingDripEnrollment(sequelize) {
  return sequelize.define("CrmMarketingDripEnrollment", {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    locationId: { type: DataTypes.INTEGER, allowNull: false },
    campaignId: { type: DataTypes.UUID, allowNull: false },
    recipient: { type: DataTypes.STRING(320), allowNull: false },
    normalizedRecipient: { type: DataTypes.STRING(320), allowNull: false },
    status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: "active" },
    currentStepIndex: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    stepsSnapshot: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    sendOptions: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    data: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    lastMessageId: { type: DataTypes.UUID, allowNull: true },
    conditionDeadline: { type: DataTypes.DATE, allowNull: true },
    nextRunAt: { type: DataTypes.DATE, allowNull: true },
    startedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    completedAt: { type: DataTypes.DATE, allowNull: true },
    lastError: { type: DataTypes.TEXT, allowNull: true },
  }, { tableName: "crm_marketing_drip_enrollments", timestamps: true });
}

module.exports = defineCrmMarketingDripEnrollment;
