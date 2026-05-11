const { DataTypes } = require("sequelize");

function defineCrmEmailDomainRoute(sequelize) {
  return sequelize.define(
    "CrmEmailDomainRoute",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      locationId: { type: DataTypes.INTEGER, allowNull: false },
      routeKey: { type: DataTypes.STRING(80), allowNull: false },
      label: { type: DataTypes.STRING(150), allowNull: false },
      domainId: { type: DataTypes.UUID, allowNull: true },
      trafficPercent: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 },
      frequencyPolicy: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    },
    {
      tableName: "crm_email_domain_routes",
      timestamps: true,
    }
  );
}

module.exports = defineCrmEmailDomainRoute;
