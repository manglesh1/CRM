const { DataTypes } = require("sequelize");

function defineCrmProviderConfig(sequelize) {
  return sequelize.define(
    "CrmProviderConfig",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      locationId: { type: DataTypes.INTEGER, allowNull: true },
      domain: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "marketing" },
      channel: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "email" },
      provider: { type: DataTypes.STRING(50), allowNull: false },
      displayName: { type: DataTypes.STRING(150), allowNull: false },
      priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 },
      isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      encryptedConfig: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      verifiedAt: { type: DataTypes.DATE, allowNull: true },
      lastTestedAt: { type: DataTypes.DATE, allowNull: true },
      lastTestError: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: "crm_provider_configs",
      timestamps: true,
    }
  );

  const { CrmCacheService } = require('../../shared/redisClient');
  const clearCache = async () => {
    await CrmCacheService.clearCachePattern('movira:crm:providerConfig:*');
  };
  
  CrmProviderConfig.afterCreate(clearCache);
  CrmProviderConfig.afterUpdate(clearCache);
  CrmProviderConfig.afterDestroy(clearCache);

  return CrmProviderConfig;
}

module.exports = defineCrmProviderConfig;
