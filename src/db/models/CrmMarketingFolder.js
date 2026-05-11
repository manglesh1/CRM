const { DataTypes } = require("sequelize");

function defineCrmMarketingFolder(sequelize) {
  return sequelize.define(
    "CrmMarketingFolder",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      locationId: { type: DataTypes.INTEGER, allowNull: false },
      name: { type: DataTypes.STRING(200), allowNull: false },
      parentId: { type: DataTypes.UUID, allowNull: true },
      kind: { type: DataTypes.STRING(20), allowNull: false }, // campaign | template
    },
    {
      tableName: "crm_marketing_folders",
      timestamps: true,
    }
  );
}

module.exports = defineCrmMarketingFolder;
