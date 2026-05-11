const { DataTypes } = require("sequelize");

function defineCrmTriggerLink(sequelize) {
  return sequelize.define(
    "CrmTriggerLink",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      locationId: { type: DataTypes.INTEGER, allowNull: false },
      name: { type: DataTypes.STRING(200), allowNull: false },
      slug: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      destinationUrl: { type: DataTypes.STRING(2048), allowNull: false },
      triggerActions: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      totalClicks: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      uniqueClicks: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      lastClickedAt: { type: DataTypes.DATE, allowNull: true },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      tableName: "crm_trigger_links",
      timestamps: true,
    }
  );
}

module.exports = defineCrmTriggerLink;
