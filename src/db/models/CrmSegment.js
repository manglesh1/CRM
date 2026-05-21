const { DataTypes } = require("sequelize");

function defineCrmSegment(sequelize) {
  return sequelize.define(
    "CrmSegment",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      locationId: { type: DataTypes.INTEGER, allowNull: false },
      name: { type: DataTypes.STRING(180), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      segmentType: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "dynamic",
      },
      status: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "active",
      },
      filters: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      memberCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      lastCalculatedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "crm_segments",
      timestamps: true,
    }
  );
}

module.exports = defineCrmSegment;
