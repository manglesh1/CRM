"use strict";

/**
 * Trigger links — short URLs that can be embedded in emails/SMS. When a
 * recipient clicks, we record the hit (click count, last-click time)
 * before redirecting to the configured destination. Future workflow
 * automations will fire from the same click event via `triggerActions`.
 *
 * `slug` is globally unique so the public /api/public/trigger-link/:slug
 * redirect endpoint doesn't need locationId scoping.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("crm_trigger_links", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      locationId: { type: Sequelize.INTEGER, allowNull: false },
      name: { type: Sequelize.STRING(200), allowNull: false },
      slug: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      destinationUrl: { type: Sequelize.STRING(2048), allowNull: false },
      // Reserved for future workflow firing — e.g.
      //   [{ type: "tag", value: "vip" }, { type: "stage", value: "won" }]
      triggerActions: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      totalClicks: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      uniqueClicks: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      lastClickedAt: { type: Sequelize.DATE, allowNull: true },
      isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
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
    await queryInterface.addIndex("crm_trigger_links", ["locationId"], {
      name: "crm_trigger_links_location_idx",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("crm_trigger_links");
  },
};
