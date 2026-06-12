const { DataTypes } = require("sequelize");

function defineCrmEmailDomain(sequelize) {
  return sequelize.define(
    "CrmEmailDomain",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      locationId: { type: DataTypes.INTEGER, allowNull: false },
      domain: { type: DataTypes.STRING(255), allowNull: false },
      domainType: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "subdomain" },
      useCase: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "marketing" },
      provider: { type: DataTypes.STRING(50), allowNull: false, defaultValue: "movira_ses" },
      providerConfigId: { type: DataTypes.UUID, allowNull: true },
      status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "pending" },
      dnsRecords: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      senderName: { type: DataTypes.STRING(150), allowNull: true },
      senderEmail: { type: DataTypes.STRING(255), allowNull: true },
      providerIdentityName: { type: DataTypes.STRING(255), allowNull: true },
      providerIdentityArn: { type: DataTypes.STRING(500), allowNull: true },
      mailFromDomain: { type: DataTypes.STRING(255), allowNull: true },
      lastDnsCheckedAt: { type: DataTypes.DATE, allowNull: true },
      lastVerificationError: { type: DataTypes.TEXT, allowNull: true },
      warmupStage: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      warmupTodaySent: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      warmupTodayLimit: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 50 },
      isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      verifiedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "crm_email_domains",
      timestamps: true,
    }
  );
}

module.exports = defineCrmEmailDomain;
