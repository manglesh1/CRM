const { DataTypes } = require("sequelize");

function defineCrmMarketingCalendarOverride(sequelize) {
  return sequelize.define(
    "CrmMarketingCalendarOverride",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      planId: { type: DataTypes.UUID, allowNull: false },
      title: { type: DataTypes.STRING(240), allowNull: false },
      overrideType: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "special_event",
      },
      startDate: { type: DataTypes.DATEONLY, allowNull: false },
      endDate: { type: DataTypes.DATEONLY, allowNull: false },
      priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 },
      color: { type: DataTypes.STRING(40), allowNull: true },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "planned",
      },
      config: { type: DataTypes.JSONB, allowNull: true },
    },
    {
      tableName: "crm_marketing_calendar_overrides",
      timestamps: true,
    }
  );
}

module.exports = defineCrmMarketingCalendarOverride;
