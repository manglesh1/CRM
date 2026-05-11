const { DataTypes } = require("sequelize");

function defineCrmEmailReplyForwardSettings(sequelize) {
  return sequelize.define(
    "CrmEmailReplyForwardSettings",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      locationId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
      forwardingAddresses: {
        type: DataTypes.ARRAY(DataTypes.STRING(255)),
        allowNull: false,
        defaultValue: [],
      },
      bccEmails: {
        type: DataTypes.ARRAY(DataTypes.STRING(255)),
        allowNull: false,
        defaultValue: [],
      },
      replyAddresses: {
        type: DataTypes.ARRAY(DataTypes.STRING(255)),
        allowNull: false,
        defaultValue: [],
      },
      forwardToAssignedUser: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      tableName: "crm_email_reply_forward_settings",
      timestamps: true,
    }
  );
}

module.exports = defineCrmEmailReplyForwardSettings;
