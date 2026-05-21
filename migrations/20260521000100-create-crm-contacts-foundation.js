"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("crm_contacts", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      locationId: { type: Sequelize.INTEGER, allowNull: false },
      fullName: { type: Sequelize.STRING(240), allowNull: true },
      firstName: { type: Sequelize.STRING(120), allowNull: true },
      lastName: { type: Sequelize.STRING(120), allowNull: true },
      email: { type: Sequelize.STRING(320), allowNull: true },
      normalizedEmail: { type: Sequelize.STRING(320), allowNull: true },
      phone: { type: Sequelize.STRING(60), allowNull: true },
      normalizedPhone: { type: Sequelize.STRING(60), allowNull: true },
      sourceType: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: "manual",
      },
      sourceRefType: { type: Sequelize.STRING(80), allowNull: true },
      sourceRefId: { type: Sequelize.STRING(120), allowNull: true },
      lifecycle: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: "lead",
      },
      marketingStatus: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: "subscribed",
      },
      smsStatus: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: "unknown",
      },
      doNotContact: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      tags: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      customFields: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      sourceSnapshot: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      lastEngagedAt: { type: Sequelize.DATE, allowNull: true },
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

    await queryInterface.addIndex("crm_contacts", ["locationId", "normalizedEmail"], {
      name: "crm_contacts_location_email_idx",
      unique: true,
      where: {
        normalizedEmail: {
          [Sequelize.Op.ne]: null,
        },
      },
    });
    await queryInterface.addIndex("crm_contacts", ["locationId", "normalizedPhone"], {
      name: "crm_contacts_location_phone_idx",
    });
    await queryInterface.addIndex("crm_contacts", ["locationId", "sourceType"], {
      name: "crm_contacts_location_source_idx",
    });
    await queryInterface.addIndex("crm_contacts", ["locationId", "marketingStatus"], {
      name: "crm_contacts_location_marketing_status_idx",
    });

    await queryInterface.createTable("crm_contact_identities", {
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
      provider: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: "movira",
      },
      externalType: { type: Sequelize.STRING(80), allowNull: false },
      externalId: { type: Sequelize.STRING(160), allowNull: false },
      metadata: {
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
    await queryInterface.addIndex(
      "crm_contact_identities",
      ["locationId", "provider", "externalType", "externalId"],
      { name: "crm_contact_identities_external_uidx", unique: true }
    );
    await queryInterface.addIndex("crm_contact_identities", ["contactId"], {
      name: "crm_contact_identities_contact_idx",
    });

    await queryInterface.createTable("crm_contact_import_jobs", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      locationId: { type: Sequelize.INTEGER, allowNull: false },
      sourceType: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: "csv",
      },
      fileName: { type: Sequelize.STRING(240), allowNull: true },
      status: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: "completed",
      },
      totalRows: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      createdCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      updatedCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      skippedCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      errorCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      fieldMapping: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      errors: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
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
    await queryInterface.addIndex("crm_contact_import_jobs", ["locationId", "createdAt"], {
      name: "crm_contact_import_jobs_location_created_idx",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("crm_contact_import_jobs");
    await queryInterface.dropTable("crm_contact_identities");
    await queryInterface.dropTable("crm_contacts");
  },
};
