"use strict";

const TABLE = "crm_email_domains";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn(TABLE, "providerIdentityName", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    await queryInterface.addColumn(TABLE, "providerIdentityArn", {
      type: Sequelize.STRING(500),
      allowNull: true,
    });
    await queryInterface.addColumn(TABLE, "mailFromDomain", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    await queryInterface.addColumn(TABLE, "lastDnsCheckedAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn(TABLE, "lastVerificationError", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn(TABLE, "lastVerificationError");
    await queryInterface.removeColumn(TABLE, "lastDnsCheckedAt");
    await queryInterface.removeColumn(TABLE, "mailFromDomain");
    await queryInterface.removeColumn(TABLE, "providerIdentityArn");
    await queryInterface.removeColumn(TABLE, "providerIdentityName");
  },
};
