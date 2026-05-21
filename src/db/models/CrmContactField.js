const { DataTypes } = require("sequelize");

function defineCrmContactField(sequelize) {
  return sequelize.define(
    "CrmContactField",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      locationId: { type: DataTypes.INTEGER, allowNull: false },
      key: { type: DataTypes.STRING(80), allowNull: false },
      label: { type: DataTypes.STRING(160), allowNull: false },
      fieldType: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "text",
      },
      options: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      showInTable: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      isSystem: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      archivedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "crm_contact_fields",
      timestamps: true,
    }
  );
}

module.exports = defineCrmContactField;
