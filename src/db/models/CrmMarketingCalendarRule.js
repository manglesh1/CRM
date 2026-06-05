const { DataTypes } = require("sequelize");

function defineCrmMarketingCalendarRule(sequelize) {
  return sequelize.define(
    "CrmMarketingCalendarRule",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      planId: { type: DataTypes.UUID, allowNull: false },
      ruleType: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "marketing",
      },
      sourceSystem: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "crm",
      },
      linkedEntityType: { type: DataTypes.STRING(80), allowNull: true },
      linkedEntityId: { type: DataTypes.STRING(120), allowNull: true },
      title: { type: DataTypes.STRING(240), allowNull: false },
      startDate: { type: DataTypes.DATEONLY, allowNull: true },
      endDate: { type: DataTypes.DATEONLY, allowNull: true },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "planned",
      },
      config: { type: DataTypes.JSONB, allowNull: true },
    },
    {
      tableName: "crm_marketing_calendar_rules",
      timestamps: true,
    }
  );
}

module.exports = defineCrmMarketingCalendarRule;
