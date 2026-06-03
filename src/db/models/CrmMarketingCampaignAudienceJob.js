const { DataTypes } = require("sequelize");

function defineCrmMarketingCampaignAudienceJob(sequelize) {
  return sequelize.define(
    "CrmMarketingCampaignAudienceJob",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      locationId: { type: DataTypes.INTEGER, allowNull: false },
      campaignId: { type: DataTypes.UUID, allowNull: false },
      templateId: { type: DataTypes.UUID, allowNull: false },
      audience: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      sendOptions: {
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
      queuedCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      suppressedCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      duplicateCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      ineligibleCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      failedCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      lastContactId: { type: DataTypes.UUID, allowNull: true },
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
      tableName: "crm_marketing_campaign_audience_jobs",
      timestamps: true,
    }
  );
}

module.exports = defineCrmMarketingCampaignAudienceJob;
