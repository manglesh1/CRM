"use strict";

function crmSchema() {
  const schema = process.env.CRM_DB_SCHEMA || "crm";
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) throw new Error("CRM_DB_SCHEMA must be a valid PostgreSQL identifier");
  return schema;
}

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const schema = crmSchema();
    await queryInterface.addColumn({ tableName: "crm_marketing_campaigns", schema }, "dripSteps", {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: [],
    });
    await queryInterface.createTable({ tableName: "crm_marketing_drip_enrollments", schema }, {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.literal("gen_random_uuid()"), primaryKey: true, allowNull: false },
      locationId: { type: Sequelize.INTEGER, allowNull: false },
      campaignId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: { tableName: "crm_marketing_campaigns", schema }, key: "id" },
        onDelete: "CASCADE",
      },
      recipient: { type: Sequelize.STRING(320), allowNull: false },
      normalizedRecipient: { type: Sequelize.STRING(320), allowNull: false },
      status: { type: Sequelize.STRING(40), allowNull: false, defaultValue: "active" },
      currentStepIndex: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      stepsSnapshot: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      sendOptions: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      data: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      lastMessageId: { type: Sequelize.UUID, allowNull: true },
      conditionDeadline: { type: Sequelize.DATE, allowNull: true },
      nextRunAt: { type: Sequelize.DATE, allowNull: true },
      startedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      completedAt: { type: Sequelize.DATE, allowNull: true },
      lastError: { type: Sequelize.TEXT, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
    });
    await queryInterface.addConstraint({ tableName: "crm_marketing_drip_enrollments", schema }, {
      fields: ["campaignId", "normalizedRecipient"],
      type: "unique",
      name: "crm_marketing_drip_enrollments_campaign_recipient_uk",
    });
    await queryInterface.addIndex({ tableName: "crm_marketing_drip_enrollments", schema }, ["locationId", "status", "nextRunAt"], {
      name: "crm_marketing_drip_enrollments_location_status_next_idx",
    });
  },

  down: async (queryInterface) => {
    const schema = crmSchema();
    await queryInterface.dropTable({ tableName: "crm_marketing_drip_enrollments", schema });
    await queryInterface.removeColumn({ tableName: "crm_marketing_campaigns", schema }, "dripSteps");
  },
};
