"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("crm_contact_notes", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      contactId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "crm_contacts", key: "id" },
        onDelete: "CASCADE",
      },
      locationId: { type: Sequelize.INTEGER, allowNull: false },
      body: { type: Sequelize.TEXT, allowNull: false },
      authorName: { type: Sequelize.STRING(160), allowNull: true },
      authorId: { type: Sequelize.STRING(120), allowNull: true },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
    });

    await queryInterface.addIndex("crm_contact_notes", ["contactId", "createdAt"], {
      name: "crm_contact_notes_contact_created_idx",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("crm_contact_notes");
  },
};
