const { DataTypes } = require("sequelize");

function defineCrmMarketingCalendarPlan(sequelize) {
  return sequelize.define(
    "CrmMarketingCalendarPlan",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      locationId: { type: DataTypes.INTEGER, allowNull: false },
      name: { type: DataTypes.STRING(200), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      planType: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "campaign",
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "draft",
      },
      startDate: { type: DataTypes.DATEONLY, allowNull: false },
      endDate: { type: DataTypes.DATEONLY, allowNull: false },
      color: { type: DataTypes.STRING(40), allowNull: true },
      visibility: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "internal",
      },
      linkedCrmCampaignId: { type: DataTypes.UUID, allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: true },
      createdByUserId: { type: DataTypes.INTEGER, allowNull: true },
    },
    {
      tableName: "crm_marketing_calendar_plans",
      timestamps: true,
    }
  );
}

module.exports = defineCrmMarketingCalendarPlan;
