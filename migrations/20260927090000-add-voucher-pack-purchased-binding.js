"use strict";

function crmSchema() {
  const schema = process.env.CRM_DB_SCHEMA || "crm";
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
    throw new Error("CRM_DB_SCHEMA must be a valid PostgreSQL identifier");
  }
  return schema;
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

module.exports = {
  async up(queryInterface) {
    const schema = crmSchema();
    const table = { tableName: "crm_event_template_bindings", schema };
    const row = {
      eventType: "voucher.pack.purchased",
      channel: "email",
      locationId: null,
      templateKey: "bookingConfirmation",
      priority: "high",
      variableMap: JSON.stringify({}),
      isActive: true,
      notes: "System default binding",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const [existing] = await queryInterface.sequelize.query(`
      SELECT id
        FROM ${quoteIdentifier(schema)}."crm_event_template_bindings"
       WHERE "eventType" = 'voucher.pack.purchased'
         AND channel = 'email'
         AND "locationId" IS NULL
       LIMIT 1
    `);

    if (existing.length) {
      await queryInterface.bulkUpdate(
        table,
        {
          templateKey: row.templateKey,
          priority: row.priority,
          variableMap: row.variableMap,
          isActive: true,
          updatedAt: row.updatedAt,
        },
        { eventType: row.eventType, channel: row.channel, locationId: null }
      );
      return;
    }

    await queryInterface.bulkInsert(table, [row]);
  },

  async down(queryInterface) {
    const schema = crmSchema();
    await queryInterface.sequelize.query(`
      DELETE FROM ${quoteIdentifier(schema)}."crm_event_template_bindings"
       WHERE "eventType" = 'voucher.pack.purchased'
         AND channel = 'email'
         AND "locationId" IS NULL
    `);
  },
};
