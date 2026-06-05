"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("crm_marketing_calendar_plans", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      locationId: { type: Sequelize.INTEGER, allowNull: false },
      name: { type: Sequelize.STRING(200), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      planType: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: "campaign",
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "draft",
      },
      startDate: { type: Sequelize.DATEONLY, allowNull: false },
      endDate: { type: Sequelize.DATEONLY, allowNull: false },
      color: { type: Sequelize.STRING(40), allowNull: true },
      visibility: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "internal",
      },
      linkedCrmCampaignId: { type: Sequelize.UUID, allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: true },
      createdByUserId: { type: Sequelize.INTEGER, allowNull: true },
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

    await queryInterface.createTable("crm_marketing_calendar_rules", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      planId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "crm_marketing_calendar_plans", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      ruleType: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: "marketing",
      },
      sourceSystem: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: "crm",
      },
      linkedEntityType: { type: Sequelize.STRING(80), allowNull: true },
      linkedEntityId: { type: Sequelize.STRING(120), allowNull: true },
      title: { type: Sequelize.STRING(240), allowNull: false },
      startDate: { type: Sequelize.DATEONLY, allowNull: true },
      endDate: { type: Sequelize.DATEONLY, allowNull: true },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "planned",
      },
      config: { type: Sequelize.JSONB, allowNull: true },
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

    await queryInterface.createTable("crm_marketing_calendar_overrides", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      planId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "crm_marketing_calendar_plans", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      title: { type: Sequelize.STRING(240), allowNull: false },
      overrideType: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: "special_event",
      },
      startDate: { type: Sequelize.DATEONLY, allowNull: false },
      endDate: { type: Sequelize.DATEONLY, allowNull: false },
      priority: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 100 },
      color: { type: Sequelize.STRING(40), allowNull: true },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "planned",
      },
      config: { type: Sequelize.JSONB, allowNull: true },
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

    await queryInterface.addIndex("crm_marketing_calendar_plans", ["locationId"], {
      name: "crm_marketing_calendar_plans_location_idx",
    });
    await queryInterface.addIndex("crm_marketing_calendar_plans", ["locationId", "startDate", "endDate"], {
      name: "crm_marketing_calendar_plans_range_idx",
    });
    await queryInterface.addIndex("crm_marketing_calendar_plans", ["locationId", "status"], {
      name: "crm_marketing_calendar_plans_status_idx",
    });
    await queryInterface.addIndex("crm_marketing_calendar_rules", ["planId"], {
      name: "crm_marketing_calendar_rules_plan_idx",
    });
    await queryInterface.addIndex("crm_marketing_calendar_overrides", ["planId"], {
      name: "crm_marketing_calendar_overrides_plan_idx",
    });
    await queryInterface.addIndex("crm_marketing_calendar_overrides", ["startDate", "endDate"], {
      name: "crm_marketing_calendar_overrides_range_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("crm_marketing_calendar_overrides");
    await queryInterface.dropTable("crm_marketing_calendar_rules");
    await queryInterface.dropTable("crm_marketing_calendar_plans");
  },
};
