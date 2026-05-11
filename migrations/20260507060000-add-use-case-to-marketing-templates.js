"use strict";

/**
 * One unified template editor authors both transactional + marketing
 * email designs. `useCase` records which buckets a template can serve
 * so the UI can filter and the campaign / transactional dispatchers
 * can pick safe templates per send.
 *   - 'transactional' : receipts, password resets, OTP — only show in
 *     transactional pickers.
 *   - 'marketing'     : promos, newsletters, journeys — only marketing
 *     pickers.
 *   - 'both'          : neutral templates (welcome series, branding
 *     headers) that can be used anywhere.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("crm_marketing_templates", "useCase", {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: "marketing",
    });
    await queryInterface.addIndex(
      "crm_marketing_templates",
      ["locationId", "useCase"],
      { name: "crm_marketing_templates_use_case_idx" }
    );
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex(
      "crm_marketing_templates",
      "crm_marketing_templates_use_case_idx"
    );
    await queryInterface.removeColumn("crm_marketing_templates", "useCase");
  },
};
