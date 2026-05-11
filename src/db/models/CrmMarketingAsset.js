const { DataTypes } = require("sequelize");

function defineCrmMarketingAsset(sequelize) {
  return sequelize.define(
    "CrmMarketingAsset",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      locationId: { type: DataTypes.INTEGER, allowNull: false },
      folderId: { type: DataTypes.UUID, allowNull: true },
      name: { type: DataTypes.STRING(200), allowNull: false },
      assetType: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "image",
      },
      url: { type: DataTypes.TEXT, allowNull: false },
      thumbnailUrl: { type: DataTypes.TEXT, allowNull: true },
      altText: { type: DataTypes.STRING(300), allowNull: true },
      tags: { type: DataTypes.ARRAY(DataTypes.STRING), allowNull: false, defaultValue: [] },
      width: { type: DataTypes.INTEGER, allowNull: true },
      height: { type: DataTypes.INTEGER, allowNull: true },
      mimeType: { type: DataTypes.STRING(100), allowNull: true },
      sizeBytes: { type: DataTypes.INTEGER, allowNull: true },
      source: { type: DataTypes.STRING(40), allowNull: false, defaultValue: "url" },
      createdByUserId: { type: DataTypes.INTEGER, allowNull: true },
      createdByName: { type: DataTypes.STRING(150), allowNull: true },
    },
    {
      tableName: "crm_marketing_assets",
      timestamps: true,
    }
  );
}

module.exports = defineCrmMarketingAsset;
