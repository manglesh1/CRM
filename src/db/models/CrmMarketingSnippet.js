const { DataTypes } = require("sequelize");

function defineCrmMarketingSnippet(sequelize) {
  return sequelize.define(
    "CrmMarketingSnippet",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      locationId: { type: DataTypes.INTEGER, allowNull: false },
      name: { type: DataTypes.STRING(200), allowNull: false },
      snippetType: { type: DataTypes.STRING(20), allowNull: false }, // section | block
      category: { type: DataTypes.STRING(60), allowNull: false, defaultValue: "custom" },
      tags: { type: DataTypes.ARRAY(DataTypes.STRING), allowNull: false, defaultValue: [] },
      previewText: { type: DataTypes.STRING(300), allowNull: true },
      designJson: { type: DataTypes.JSONB, allowNull: false },
      createdByUserId: { type: DataTypes.INTEGER, allowNull: true },
      createdByName: { type: DataTypes.STRING(150), allowNull: true },
    },
    {
      tableName: "crm_marketing_snippets",
      timestamps: true,
    }
  );
}

module.exports = defineCrmMarketingSnippet;
