const { DataTypes } = require("sequelize");

function defineCrmSegmentMember(sequelize) {
  return sequelize.define(
    "CrmSegmentMember",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      segmentId: { type: DataTypes.UUID, allowNull: false },
      contactId: { type: DataTypes.UUID, allowNull: false },
      locationId: { type: DataTypes.INTEGER, allowNull: false },
      source: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "filter",
      },
      status: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "active",
      },
      enteredAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      exitedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "crm_segment_members",
      timestamps: true,
    }
  );
}

module.exports = defineCrmSegmentMember;
