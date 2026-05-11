const { DataTypes } = require("sequelize");

function defineCrmMarketingCampaign(sequelize) {
  return sequelize.define(
    "CrmMarketingCampaign",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      locationId: { type: DataTypes.INTEGER, allowNull: false },
      folderId: { type: DataTypes.UUID, allowNull: true },
      name: { type: DataTypes.STRING(200), allowNull: false },
      channel: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "email",
      },
      // 'email_campaign' | 'workflow_campaign' | 'bulk_action_campaign'
      campaignType: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "email_campaign",
      },
      templateId: { type: DataTypes.UUID, allowNull: true },
      // 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'failed'
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "draft",
      },
      scheduledAt: { type: DataTypes.DATE, allowNull: true },
      executionDate: { type: DataTypes.DATE, allowNull: true },
      totalRecipients: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      totalDelivered: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      totalOpened: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      totalClicked: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      totalBounced: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      totalUnsubscribed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      totalComplained: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    {
      tableName: "crm_marketing_campaigns",
      timestamps: true,
    }
  );
}

module.exports = defineCrmMarketingCampaign;
