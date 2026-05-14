const { DataTypes } = require("sequelize");

function defineCrmEventTemplateBinding(sequelize) {
  return sequelize.define(
    "CrmEventTemplateBinding",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      eventType: { type: DataTypes.STRING(120), allowNull: false },
      channel: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "email",
      },
      locationId: { type: DataTypes.INTEGER, allowNull: true },
      templateKey: { type: DataTypes.STRING(150), allowNull: false },
      priority: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "normal",
      },
      variableMap: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      notes: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: "crm_event_template_bindings",
      timestamps: true,
    }
  );
}

module.exports = defineCrmEventTemplateBinding;
