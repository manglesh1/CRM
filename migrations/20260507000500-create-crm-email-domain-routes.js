"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("crm_email_domain_routes", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      locationId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      routeKey: {
        type: Sequelize.STRING(80),
        allowNull: false,
      },
      label: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },
      domainId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: "crm_email_domains",
          key: "id",
        },
        onDelete: "SET NULL",
      },
      trafficPercent: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 100,
      },
      frequencyPolicy: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
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

    await queryInterface.addIndex("crm_email_domain_routes", ["locationId", "routeKey"], {
      unique: true,
      name: "crm_email_domain_routes_location_key_unique",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("crm_email_domain_routes");
  },
};
