const { DataTypes } = require("sequelize");

function defineTransactionalMessage(sequelize) {
  return sequelize.define(
    "TransactionalMessage",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      locationId: { type: DataTypes.INTEGER, allowNull: false },
      sourceSystem: {
        type: DataTypes.STRING(80),
        allowNull: false,
        defaultValue: "aeroSportsAdmin",
      },
      sourceEventType: { type: DataTypes.STRING(120), allowNull: false },
      sourceResourceType: { type: DataTypes.STRING(80), allowNull: true },
      sourceResourceId: { type: DataTypes.STRING(120), allowNull: true },
      channel: { type: DataTypes.STRING(20), allowNull: false },
      recipientAddress: { type: DataTypes.STRING(255), allowNull: false },
      templateKey: { type: DataTypes.STRING(150), allowNull: false },
      templateVersionId: { type: DataTypes.UUID, allowNull: true },
      payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      priority: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "normal",
      },
      status: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: "pending",
      },
      idempotencyKey: { type: DataTypes.STRING(255), allowNull: false },
      provider: { type: DataTypes.STRING(60), allowNull: true },
      providerMessageId: { type: DataTypes.STRING(255), allowNull: true },
      queuedAt: { type: DataTypes.DATE, allowNull: true },
      sentAt: { type: DataTypes.DATE, allowNull: true },
      deliveredAt: { type: DataTypes.DATE, allowNull: true },
      failedAt: { type: DataTypes.DATE, allowNull: true },
      lastError: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: "crm_transactional_messages",
      timestamps: true,
    }
  );
}

module.exports = defineTransactionalMessage;
