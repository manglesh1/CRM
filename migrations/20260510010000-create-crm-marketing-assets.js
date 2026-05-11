"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("crm_marketing_assets", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      locationId: { type: Sequelize.INTEGER, allowNull: false },
      folderId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "crm_marketing_folders", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      name: { type: Sequelize.STRING(200), allowNull: false },
      assetType: { type: Sequelize.STRING(40), allowNull: false, defaultValue: "image" },
      url: { type: Sequelize.TEXT, allowNull: false },
      thumbnailUrl: { type: Sequelize.TEXT, allowNull: true },
      altText: { type: Sequelize.STRING(300), allowNull: true },
      tags: { type: Sequelize.ARRAY(Sequelize.STRING), allowNull: false, defaultValue: [] },
      width: { type: Sequelize.INTEGER, allowNull: true },
      height: { type: Sequelize.INTEGER, allowNull: true },
      mimeType: { type: Sequelize.STRING(100), allowNull: true },
      sizeBytes: { type: Sequelize.INTEGER, allowNull: true },
      source: { type: Sequelize.STRING(40), allowNull: false, defaultValue: "url" },
      createdByUserId: { type: Sequelize.INTEGER, allowNull: true },
      createdByName: { type: Sequelize.STRING(150), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    });
    await queryInterface.addIndex("crm_marketing_assets", ["locationId", "assetType"]);
    await queryInterface.addIndex("crm_marketing_assets", ["folderId"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("crm_marketing_assets");
  },
};
