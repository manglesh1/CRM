const { DataTypes } = require("sequelize");

function defineCrmMarketingMessage(sequelize) {
  return sequelize.define(
    "CrmMarketingMessage",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      locationId: { type: DataTypes.INTEGER, allowNull: false },
      campaignId: { type: DataTypes.UUID, allowNull: true },
      templateId: { type: DataTypes.UUID, allowNull: true },
      channel: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "email" },
      recipient: { type: DataTypes.STRING(320), allowNull: false },
      subject: { type: DataTypes.STRING(500), allowNull: true },
      status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "pending" },
      provider: { type: DataTypes.STRING(60), allowNull: true },
      providerMessageId: { type: DataTypes.STRING(255), allowNull: true },
      payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      queuedAt: { type: DataTypes.DATE, allowNull: true },
      sentAt: { type: DataTypes.DATE, allowNull: true },
      deliveredAt: { type: DataTypes.DATE, allowNull: true },
      openedAt: { type: DataTypes.DATE, allowNull: true },
      clickedAt: { type: DataTypes.DATE, allowNull: true },
      bouncedAt: { type: DataTypes.DATE, allowNull: true },
      complainedAt: { type: DataTypes.DATE, allowNull: true },
      unsubscribedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "crm_marketing_messages",
      timestamps: true,
    }
  );
}

module.exports = defineCrmMarketingMessage;
