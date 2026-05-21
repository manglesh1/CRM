const { DataTypes } = require("sequelize");

function defineCrmContactNote(sequelize) {
  return sequelize.define(
    "CrmContactNote",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      contactId: { type: DataTypes.UUID, allowNull: false },
      locationId: { type: DataTypes.INTEGER, allowNull: false },
      body: { type: DataTypes.TEXT, allowNull: false },
      authorName: { type: DataTypes.STRING(160), allowNull: true },
      authorId: { type: DataTypes.STRING(120), allowNull: true },
    },
    {
      tableName: "crm_contact_notes",
      timestamps: true,
    }
  );
}

module.exports = defineCrmContactNote;
