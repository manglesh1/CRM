const { DataTypes } = require("sequelize");

function defineCrmContactIdentity(sequelize) {
  return sequelize.define(
    "CrmContactIdentity",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      contactId: { type: DataTypes.UUID, allowNull: false },
      locationId: { type: DataTypes.INTEGER, allowNull: false },
      provider: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "movira",
      },
      externalType: { type: DataTypes.STRING(80), allowNull: false },
      externalId: { type: DataTypes.STRING(160), allowNull: false },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
    },
    {
      tableName: "crm_contact_identities",
      timestamps: true,
    }
  );
}

module.exports = defineCrmContactIdentity;
