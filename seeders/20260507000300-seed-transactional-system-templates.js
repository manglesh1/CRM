"use strict";

const templates = [
  {
    key: "bookingConfirmation",
    name: "Booking confirmation",
    category: "booking",
    subject: "Your booking is confirmed at {{venueName}}",
    body: [
      "<h1>Booking confirmed</h1>",
      "<p>Hi {{guestName}},</p>",
      "<p>Your booking {{bookingNumber}} at {{venueName}} is confirmed.</p>",
      "<p>Date: {{bookingDate}}</p>",
      "<p>Total: {{totalAmount}}</p>",
      "<p>{{paymentLink}}</p>",
    ].join("\n"),
    variables: [
      "guestName",
      "bookingNumber",
      "venueName",
      "bookingDate",
      "totalAmount",
      "paymentLink",
    ],
  },
  {
    key: "payment-receipt",
    name: "Payment receipt",
    category: "payment",
    subject: "Your receipt from {{venueName}}",
    body: [
      "<h1>Payment received</h1>",
      "<p>Hi {{guestName}},</p>",
      "<p>Thanks for your payment for booking {{bookingNumber}}.</p>",
      "<p>Amount paid: {{amountPaid}}</p>",
      "<p>Payment method: {{gateway}}</p>",
    ].join("\n"),
    variables: ["guestName", "bookingNumber", "venueName", "amountPaid", "gateway"],
  },
  {
    key: "paymentLink",
    name: "Payment link",
    category: "payment",
    subject: "Complete your payment for {{venueName}}",
    body: [
      "<h1>Complete your payment</h1>",
      "<p>Hi {{guestName}},</p>",
      "<p>Please complete payment for booking {{bookingNumber}}.</p>",
      "<p><a href=\"{{paymentLink}}\">Pay now</a></p>",
      "<p>Amount due: {{amountDue}}</p>",
    ].join("\n"),
    variables: ["guestName", "bookingNumber", "venueName", "paymentLink", "amountDue"],
  },
  {
    key: "waiverLink",
    name: "Waiver link",
    category: "waiver",
    subject: "Sign your waiver before visiting {{venueName}}",
    body: [
      "<h1>Sign your waiver</h1>",
      "<p>Hi {{guestName}},</p>",
      "<p>Please sign your waiver before your visit to {{venueName}}.</p>",
      "<p><a href=\"{{waiverShareUrl}}\">Sign waiver</a></p>",
    ].join("\n"),
    variables: ["guestName", "venueName", "waiverShareUrl"],
  },
  {
    key: "waiverExpiryReminder",
    name: "Waiver expiry reminder",
    category: "waiver",
    subject: "Your {{venueName}} waiver is about to expire",
    body: [
      "<h1>Waiver expiring soon</h1>",
      "<p>Hi {{guestName}},</p>",
      "<p>Your waiver expires on {{expiryDate}}.</p>",
      "<p><a href=\"{{waiverShareUrl}}\">Renew waiver</a></p>",
    ].join("\n"),
    variables: ["guestName", "venueName", "expiryDate", "waiverShareUrl"],
  },
];

module.exports = {
  up: async (queryInterface) => {
    for (const template of templates) {
      const [existing] = await queryInterface.sequelize.query(
        `
        SELECT id FROM crm_transactional_templates
        WHERE "locationId" IS NULL AND key = :key AND channel = 'email'
        LIMIT 1
        `,
        { replacements: { key: template.key } }
      );

      const row = {
        locationId: null,
        key: template.key,
        channel: "email",
        name: template.name,
        category: template.category,
        subject: template.subject,
        body: template.body,
        config: JSON.stringify({
          contentType: "html",
          textFallback: null,
        }),
        variables: JSON.stringify(template.variables),
        isSystem: true,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      if (existing.length) {
        await queryInterface.bulkUpdate(
          "crm_transactional_templates",
          {
            name: row.name,
            category: row.category,
            subject: row.subject,
            body: row.body,
            config: row.config,
            variables: row.variables,
            isSystem: true,
            isActive: true,
            updatedAt: row.updatedAt,
          },
          {
            locationId: null,
            key: template.key,
            channel: "email",
          }
        );
      } else {
        await queryInterface.bulkInsert("crm_transactional_templates", [row]);
      }
    }
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(
      `
      DELETE FROM crm_transactional_templates
      WHERE "isSystem" = true
        AND channel = 'email'
        AND key IN (:keys)
      `,
      { replacements: { keys: templates.map((template) => template.key) } }
    );
  },
};
