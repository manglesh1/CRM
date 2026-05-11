"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("crm_marketing_template_revisions", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      templateId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "crm_marketing_templates", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      locationId: { type: Sequelize.INTEGER, allowNull: false },
      revisionNumber: { type: Sequelize.INTEGER, allowNull: false },
      name: { type: Sequelize.STRING(200), allowNull: false },
      editorType: { type: Sequelize.STRING(20), allowNull: false },
      useCase: { type: Sequelize.STRING(20), allowNull: false },
      htmlBody: { type: Sequelize.TEXT, allowNull: true },
      designJson: { type: Sequelize.JSONB, allowNull: true },
      plainText: { type: Sequelize.TEXT, allowNull: true },
      updatedByUserId: { type: Sequelize.INTEGER, allowNull: true },
      updatedByName: { type: Sequelize.STRING(150), allowNull: true },
      reason: { type: Sequelize.STRING(80), allowNull: false, defaultValue: "save" },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    });
    await queryInterface.addIndex("crm_marketing_template_revisions", ["templateId", "revisionNumber"], {
      unique: true,
      name: "crm_marketing_template_revisions_number_idx",
    });
    await queryInterface.addIndex("crm_marketing_template_revisions", ["locationId"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("crm_marketing_template_revisions");
  },
};
