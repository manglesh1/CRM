"use strict";

function crmSchema() {
  return process.env.CRM_DB_SCHEMA || "crm";
}

function tableName(tableName) {
  return { tableName, schema: crmSchema() };
}

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable(tableName("crm_provider_configs"), {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      locationId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      domain: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: "marketing",
      },
      channel: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "email",
      },
      provider: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      displayName: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },
      priority: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 100,
      },
      isDefault: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      encryptedConfig: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      verifiedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      lastTestedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      lastTestError: {
        type: Sequelize.TEXT,
        allowNull: true,
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

    await queryInterface.addIndex(
      tableName("crm_provider_configs"),
      ["locationId", "domain", "channel", "provider"],
      { name: "crm_provider_configs_lookup_idx" }
    );

    await queryInterface.createTable(tableName("crm_email_domains"), {
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
      domain: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      domainType: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: "subdomain",
      },
      useCase: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: "marketing",
      },
      provider: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: "movira_ses",
      },
      status: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: "pending",
      },
      dnsRecords: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      verifiedAt: {
        type: Sequelize.DATE,
        allowNull: true,
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

    await queryInterface.addIndex(tableName("crm_email_domains"), ["locationId", "domain"], {
      unique: true,
      name: "crm_email_domains_location_domain_unique",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable(tableName("crm_email_domains"));
    await queryInterface.dropTable(tableName("crm_provider_configs"));
  },
};
