"use strict";

/**
 * One row per location storing the reply / forwarding rules customers
 * configure per the Email Services → Reply & Forward Settings tab.
 *   - forwardingAddresses: addresses outside our system that get a copy
 *     of every inbound reply (cannot be on the sending domain).
 *   - bccEmails: silent BCC on every outbound message.
 *   - replyAddresses: Reply-To header overrides (untracked thread).
 *   - forwardToAssignedUser: also copy the conversation's assigned user.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("crm_email_reply_forward_settings", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      locationId: { type: Sequelize.INTEGER, allowNull: false },
      forwardingAddresses: {
        type: Sequelize.ARRAY(Sequelize.STRING(255)),
        allowNull: false,
        defaultValue: [],
      },
      bccEmails: {
        type: Sequelize.ARRAY(Sequelize.STRING(255)),
        allowNull: false,
        defaultValue: [],
      },
      replyAddresses: {
        type: Sequelize.ARRAY(Sequelize.STRING(255)),
        allowNull: false,
        defaultValue: [],
      },
      forwardToAssignedUser: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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
      "crm_email_reply_forward_settings",
      ["locationId"],
      { unique: true, name: "crm_email_reply_forward_settings_location_unique" }
    );
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("crm_email_reply_forward_settings");
  },
};
