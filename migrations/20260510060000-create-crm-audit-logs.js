"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("crm_audit_logs", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      locationId: { type: Sequelize.INTEGER, allowNull: true },
      action: { type: Sequelize.STRING(100), allowNull: false },
      entityType: { type: Sequelize.STRING(80), allowNull: false },
      entityId: { type: Sequelize.STRING(120), allowNull: true },
      entityName: { type: Sequelize.STRING(240), allowNull: true },
      actorUserId: { type: Sequelize.INTEGER, allowNull: true },
      actorName: { type: Sequelize.STRING(150), allowNull: true },
      actorEmail: { type: Sequelize.STRING(320), allowNull: true },
      outcome: { type: Sequelize.STRING(30), allowNull: false, defaultValue: "success" },
      ipAddress: { type: Sequelize.STRING(80), allowNull: true },
      userAgent: { type: Sequelize.TEXT, allowNull: true },
      requestId: { type: Sequelize.STRING(120), allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
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

    await queryInterface.addIndex("crm_audit_logs", ["locationId", "createdAt"], {
      name: "crm_audit_logs_location_created_idx",
    });
    await queryInterface.addIndex("crm_audit_logs", ["entityType", "entityId"], {
      name: "crm_audit_logs_entity_idx",
    });
    await queryInterface.addIndex("crm_audit_logs", ["action"], {
      name: "crm_audit_logs_action_idx",
    });
    await queryInterface.addIndex("crm_audit_logs", ["actorUserId"], {
      name: "crm_audit_logs_actor_idx",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("crm_audit_logs");
  },
};
