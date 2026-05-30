const { DataTypes } = require("sequelize");

function defineCrmContactTag(sequelize) {
  return sequelize.define(
    "CrmContactTag",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      locationId: { type: DataTypes.INTEGER, allowNull: false },
      name: { type: DataTypes.STRING(80), allowNull: false },
      normalizedName: { type: DataTypes.STRING(80), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      color: { type: DataTypes.STRING(20), allowNull: true },
      createdBy: { type: DataTypes.STRING(120), allowNull: true },
    },
    {
      tableName: "crm_contact_tags",
      timestamps: true,
    }
  );
}

module.exports = defineCrmContactTag;
