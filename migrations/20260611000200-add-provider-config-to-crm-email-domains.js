"use strict";

const TABLE = "crm_email_domains";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn(TABLE, "providerConfigId", {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: "crm_provider_configs",
        key: "id",
      },
      onDelete: "SET NULL",
    });
    await queryInterface.addIndex(TABLE, ["locationId", "provider", "providerConfigId"], {
      name: "crm_email_domains_provider_lookup_idx",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex(TABLE, "crm_email_domains_provider_lookup_idx");
    await queryInterface.removeColumn(TABLE, "providerConfigId");
  },
};
