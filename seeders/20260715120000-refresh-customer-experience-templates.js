"use strict";

const customerExperienceTemplates = require("./20260712120000-seed-customer-experience-templates");

// Re-run the idempotent Customer Experience template upsert for databases that
// already recorded the original seeder before the dedicated email layouts and
// feedback-received notification were added.
module.exports = {
  up: async (queryInterface, Sequelize) =>
    customerExperienceTemplates.up(queryInterface, Sequelize),

  // The original seeder owns removal. Rolling back this refresh must not
  // delete system templates that may already be in active use.
  down: async () => {},
};
