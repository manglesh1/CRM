const { DataTypes } = require("sequelize");

function defineCrmMarketingTemplateRevision(sequelize) {
  return sequelize.define(
    "CrmMarketingTemplateRevision",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      templateId: { type: DataTypes.UUID, allowNull: false },
      locationId: { type: DataTypes.INTEGER, allowNull: false },
      revisionNumber: { type: DataTypes.INTEGER, allowNull: false },
      name: { type: DataTypes.STRING(200), allowNull: false },
      editorType: { type: DataTypes.STRING(20), allowNull: false },
      useCase: { type: DataTypes.STRING(20), allowNull: false },
      htmlBody: { type: DataTypes.TEXT, allowNull: true },
      designJson: { type: DataTypes.JSONB, allowNull: true },
      plainText: { type: DataTypes.TEXT, allowNull: true },
      updatedByUserId: { type: DataTypes.INTEGER, allowNull: true },
      updatedByName: { type: DataTypes.STRING(150), allowNull: true },
      reason: { type: DataTypes.STRING(80), allowNull: false, defaultValue: "save" },
    },
    {
      tableName: "crm_marketing_template_revisions",
      timestamps: true,
      updatedAt: false,
    }
  );
}

module.exports = defineCrmMarketingTemplateRevision;
