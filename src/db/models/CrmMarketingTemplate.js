const { DataTypes } = require("sequelize");

function defineCrmMarketingTemplate(sequelize) {
  return sequelize.define(
    "CrmMarketingTemplate",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      locationId: { type: DataTypes.INTEGER, allowNull: false },
      folderId: { type: DataTypes.UUID, allowNull: true },
      name: { type: DataTypes.STRING(200), allowNull: false },
      // 'design' | 'code' | 'plain'
      editorType: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "design",
      },
      // 'transactional' | 'marketing' | 'both'
      useCase: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "marketing",
      },
      htmlBody: { type: DataTypes.TEXT, allowNull: true },
      designJson: { type: DataTypes.JSONB, allowNull: true },
      plainText: { type: DataTypes.TEXT, allowNull: true },
      updatedByUserId: { type: DataTypes.INTEGER, allowNull: true },
      updatedByName: { type: DataTypes.STRING(150), allowNull: true },
    },
    {
      tableName: "crm_marketing_templates",
      timestamps: true,
    }
  );
}

module.exports = defineCrmMarketingTemplate;
