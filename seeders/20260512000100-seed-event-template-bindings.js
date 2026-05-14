"use strict";

const bindings = [
  {
    eventType: "booking.confirmed",
    templateKey: "bookingConfirmation",
    priority: "high",
    variableMap: {},
  },
  {
    eventType: "payment.received",
    templateKey: "payment-receipt",
    priority: "high",
    variableMap: {},
  },
  {
    eventType: "payment.link.requested",
    templateKey: "paymentLink",
    priority: "high",
    variableMap: {},
  },
  {
    eventType: "waiver.link.requested",
    templateKey: "waiverLink",
    priority: "normal",
    variableMap: {},
  },
  {
    eventType: "waiver.expiring",
    templateKey: "waiverExpiryReminder",
    priority: "normal",
    variableMap: {},
  },
];

module.exports = {
  up: async (queryInterface) => {
    for (const binding of bindings) {
      const [existing] = await queryInterface.sequelize.query(
        `
        SELECT id FROM crm_event_template_bindings
        WHERE "eventType" = :eventType
          AND channel = 'email'
          AND "locationId" IS NULL
        LIMIT 1
        `,
        { replacements: { eventType: binding.eventType } }
      );

      const row = {
        eventType: binding.eventType,
        channel: "email",
        locationId: null,
        templateKey: binding.templateKey,
        priority: binding.priority,
        variableMap: JSON.stringify(binding.variableMap),
        isActive: true,
        notes: "System default binding",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      if (existing.length) {
        await queryInterface.bulkUpdate(
          "crm_event_template_bindings",
          {
            templateKey: row.templateKey,
            priority: row.priority,
            variableMap: row.variableMap,
            isActive: true,
            updatedAt: row.updatedAt,
          },
          {
            eventType: binding.eventType,
            channel: "email",
            locationId: null,
          }
        );
      } else {
        await queryInterface.bulkInsert("crm_event_template_bindings", [row]);
      }
    }
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(
      `
      DELETE FROM crm_event_template_bindings
      WHERE channel = 'email'
        AND "locationId" IS NULL
        AND "eventType" IN (:eventTypes)
      `,
      { replacements: { eventTypes: bindings.map((b) => b.eventType) } }
    );
  },
};
