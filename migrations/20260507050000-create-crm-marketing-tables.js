"use strict";

/**
 * CRM Marketing module — three sibling tables that together drive the
 * Email Marketing UI:
 *   crm_marketing_folders    : folder hierarchy (parent_id self-ref).
 *                              `kind` segregates folders that hold
 *                              campaigns vs templates so a "Promos"
 *                              folder doesn't accidentally appear in
 *                              both pickers.
 *   crm_marketing_templates  : reusable email designs. editor_type
 *                              tells the UI which editor to open
 *                              (design | code | plain).
 *   crm_marketing_campaigns  : individual sends. Aggregates are
 *                              denormalised onto the row so the
 *                              Statistics tab can render in O(1) per
 *                              campaign without re-aggregating events.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("crm_marketing_folders", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      locationId: { type: Sequelize.INTEGER, allowNull: false },
      name: { type: Sequelize.STRING(200), allowNull: false },
      parentId: { type: Sequelize.UUID, allowNull: true },
      // 'campaign' | 'template'
      kind: { type: Sequelize.STRING(20), allowNull: false },
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
      "crm_marketing_folders",
      ["locationId", "kind", "parentId"],
      { name: "crm_marketing_folders_lookup_idx" }
    );

    await queryInterface.createTable("crm_marketing_templates", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      locationId: { type: Sequelize.INTEGER, allowNull: false },
      folderId: { type: Sequelize.UUID, allowNull: true },
      name: { type: Sequelize.STRING(200), allowNull: false },
      // 'design' | 'code' | 'plain'
      editorType: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "design",
      },
      htmlBody: { type: Sequelize.TEXT, allowNull: true },
      // Design-editor JSON tree (Beefree / Unlayer-style block schema).
      designJson: { type: Sequelize.JSONB, allowNull: true },
      plainText: { type: Sequelize.TEXT, allowNull: true },
      updatedByUserId: { type: Sequelize.INTEGER, allowNull: true },
      updatedByName: { type: Sequelize.STRING(150), allowNull: true },
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
      "crm_marketing_templates",
      ["locationId", "folderId"],
      { name: "crm_marketing_templates_lookup_idx" }
    );

    await queryInterface.createTable("crm_marketing_campaigns", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      locationId: { type: Sequelize.INTEGER, allowNull: false },
      folderId: { type: Sequelize.UUID, allowNull: true },
      name: { type: Sequelize.STRING(200), allowNull: false },
      // 'email' for now — extensible for sms/whatsapp later
      channel: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "email",
      },
      // 'email_campaign' | 'workflow_campaign' | 'bulk_action_campaign'
      campaignType: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: "email_campaign",
      },
      templateId: { type: Sequelize.UUID, allowNull: true },
      // 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'failed'
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "draft",
      },
      scheduledAt: { type: Sequelize.DATE, allowNull: true },
      executionDate: { type: Sequelize.DATE, allowNull: true },
      // Aggregate counters maintained by the worker as events arrive.
      totalRecipients: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      totalDelivered: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      totalOpened: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      totalClicked: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      totalBounced: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      totalUnsubscribed: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      totalComplained: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
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
      "crm_marketing_campaigns",
      ["locationId", "folderId", "channel"],
      { name: "crm_marketing_campaigns_lookup_idx" }
    );
    await queryInterface.addIndex(
      "crm_marketing_campaigns",
      ["locationId", "status"],
      { name: "crm_marketing_campaigns_status_idx" }
    );
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("crm_marketing_campaigns");
    await queryInterface.dropTable("crm_marketing_templates");
    await queryInterface.dropTable("crm_marketing_folders");
  },
};
