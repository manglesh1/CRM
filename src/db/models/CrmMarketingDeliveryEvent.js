const { DataTypes } = require("sequelize");

function defineCrmMarketingDeliveryEvent(sequelize) {
  return sequelize.define(
    "CrmMarketingDeliveryEvent",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      messageId: { type: DataTypes.UUID, allowNull: false },
      campaignId: { type: DataTypes.UUID, allowNull: true },
      provider: { type: DataTypes.STRING(60), allowNull: true },
      providerMessageId: { type: DataTypes.STRING(255), allowNull: true },
      eventType: { type: DataTypes.STRING(60), allowNull: false },
      payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      occurredAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: "crm_marketing_delivery_events",
      timestamps: true,
    }
  );
}

module.exports = defineCrmMarketingDeliveryEvent;
