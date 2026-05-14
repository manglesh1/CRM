const { DataTypes } = require("sequelize");

function defineTransactionalTemplate(sequelize) {
  return sequelize.define(
    "TransactionalTemplate",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      locationId: { type: DataTypes.INTEGER, allowNull: true },
      key: { type: DataTypes.STRING(150), allowNull: false },
      channel: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "email",
      },
      name: { type: DataTypes.STRING(180), allowNull: false },
      category: {
        type: DataTypes.STRING(80),
        allowNull: false,
        defaultValue: "booking",
      },
      family: { type: DataTypes.STRING(60), allowNull: true },
      description: { type: DataTypes.TEXT, allowNull: true },
      defaults: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      subject: { type: DataTypes.STRING(500), allowNull: true },
      body: { type: DataTypes.TEXT, allowNull: false },
      editorType: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "code",
      },
      designJson: { type: DataTypes.JSONB, allowNull: true },
      plainText: { type: DataTypes.TEXT, allowNull: true },
      config: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      variables: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      isSystem: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      updatedByUserId: { type: DataTypes.INTEGER, allowNull: true },
      updatedByName: { type: DataTypes.STRING(150), allowNull: true },
    },
    {
      tableName: "crm_transactional_templates",
      timestamps: true,
    }
  );
}

module.exports = defineTransactionalTemplate;
