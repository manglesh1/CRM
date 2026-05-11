const { DataTypes } = require("sequelize");

function defineCrmMarketingSuppression(sequelize) {
  return sequelize.define(
    "CrmMarketingSuppression",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      locationId: { type: DataTypes.INTEGER, allowNull: false },
      email: { type: DataTypes.STRING(320), allowNull: false },
      reason: { type: DataTypes.STRING(40), allowNull: false },
      source: { type: DataTypes.STRING(80), allowNull: false, defaultValue: "manual" },
      scope: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "marketing" },
      campaignId: { type: DataTypes.UUID, allowNull: true },
      messageId: { type: DataTypes.UUID, allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      suppressedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      releasedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "crm_marketing_suppressions",
      timestamps: true,
    }
  );
}

module.exports = defineCrmMarketingSuppression;
