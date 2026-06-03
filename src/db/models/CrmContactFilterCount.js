const { DataTypes } = require("sequelize");

function defineCrmContactFilterCount(sequelize) {
  return sequelize.define(
    "CrmContactFilterCount",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      locationId: { type: DataTypes.INTEGER, allowNull: false },
      scopeHash: { type: DataTypes.STRING(64), allowNull: false },
      scope: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      status: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "pending",
      },
      total: { type: DataTypes.INTEGER, allowNull: true },
      calculatedAt: { type: DataTypes.DATE, allowNull: true },
      invalidatedAt: { type: DataTypes.DATE, allowNull: true },
      lastError: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: "crm_contact_filter_counts",
      timestamps: true,
    }
  );
}

module.exports = defineCrmContactFilterCount;
