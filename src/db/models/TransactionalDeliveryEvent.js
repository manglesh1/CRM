const { DataTypes } = require("sequelize");

function defineTransactionalDeliveryEvent(sequelize) {
  return sequelize.define(
    "TransactionalDeliveryEvent",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      messageId: { type: DataTypes.UUID, allowNull: false },
      provider: { type: DataTypes.STRING(60), allowNull: true },
      providerMessageId: { type: DataTypes.STRING(255), allowNull: true },
      eventType: { type: DataTypes.STRING(60), allowNull: false },
      payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      occurredAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: "crm_transactional_delivery_events",
      timestamps: true,
    }
  );
}

module.exports = defineTransactionalDeliveryEvent;
