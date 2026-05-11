"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("crm_marketing_snippets", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      locationId: { type: Sequelize.INTEGER, allowNull: false },
      name: { type: Sequelize.STRING(200), allowNull: false },
      snippetType: { type: Sequelize.STRING(20), allowNull: false },
      category: { type: Sequelize.STRING(60), allowNull: false, defaultValue: "custom" },
      tags: { type: Sequelize.ARRAY(Sequelize.STRING), allowNull: false, defaultValue: [] },
      previewText: { type: Sequelize.STRING(300), allowNull: true },
      designJson: { type: Sequelize.JSONB, allowNull: false },
      createdByUserId: { type: Sequelize.INTEGER, allowNull: true },
      createdByName: { type: Sequelize.STRING(150), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    });
    await queryInterface.addIndex("crm_marketing_snippets", ["locationId", "snippetType"]);
    await queryInterface.addIndex("crm_marketing_snippets", ["locationId", "category"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("crm_marketing_snippets");
  },
};
