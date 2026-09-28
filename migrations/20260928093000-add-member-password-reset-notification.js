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

const EVENT_TYPE = "member.password_reset.requested";
const TEMPLATE_KEY = "memberPasswordReset";

module.exports = {
  async up(queryInterface) {
    const schema = crmSchema();
    const quotedSchema = quoteIdentifier(schema);
    const templates = { tableName: "crm_transactional_templates", schema };
    const bindings = { tableName: "crm_event_template_bindings", schema };
    const now = new Date();
    const subject = "Reset your {{venueName}} password";
    const body = [
      '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#142b3b;">',
      '<div style="border:1px solid #c3d6e4;border-radius:16px;overflow:hidden;background:#ffffff;">',
      '<div style="height:5px;background:#0a66c2;"></div>',
      '<div style="padding:30px;">',
      '<p style="margin:0 0 8px;color:#0a66c2;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;">Account security</p>',
      '<h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;">Reset your password</h1>',
      '<p style="margin:0 0 22px;font-size:15px;line-height:1.65;">Hi {{guestFirstName}}, we received a request to reset your {{venueName}} account password.</p>',
      '<a href="{{resetUrl}}" style="display:inline-block;border-radius:10px;background:#0a66c2;color:#ffffff;padding:13px 20px;text-decoration:none;font-weight:700;">Set a new password</a>',
      '<p style="margin:22px 0 0;color:#667b8a;font-size:13px;line-height:1.6;">This link expires in {{expiryMinutes}} minutes. If you did not request this, you can safely ignore this email.</p>',
      '</div></div></div>',
    ].join("");
    const plainText = [
      "Reset your {{venueName}} password",
      "",
      "Hi {{guestFirstName}},",
      "Open this secure link to set a new password:",
      "{{resetUrl}}",
      "",
      "This link expires in {{expiryMinutes}} minutes. If you did not request this, ignore this email.",
    ].join("\n");
    const templateRow = {
      locationId: null,
      key: TEMPLATE_KEY,
      channel: "email",
      name: "Member password reset",
      category: "system",
      family: "system",
      description: "Secure password-reset link for customer booking accounts.",
      subject,
      body,
      editorType: "code",
      designJson: null,
      plainText,
      config: JSON.stringify({ contentType: "html", textFallback: plainText }),
      defaults: JSON.stringify({ subject }),
      variables: JSON.stringify(["venueName", "guestFirstName", "resetUrl", "expiryMinutes"]),
      isSystem: true,
      isActive: true,
      updatedAt: now,
    };

    const [existingTemplate] = await queryInterface.sequelize.query(`
      SELECT id FROM ${quotedSchema}."crm_transactional_templates"
       WHERE "locationId" IS NULL AND key = '${TEMPLATE_KEY}' AND channel = 'email'
       LIMIT 1
    `);
    if (existingTemplate.length) {
      await queryInterface.bulkUpdate(
        templates,
        templateRow,
        { locationId: null, key: TEMPLATE_KEY, channel: "email" }
      );
    } else {
      await queryInterface.bulkInsert(templates, [{ ...templateRow, createdAt: now }]);
    }

    const bindingRow = {
      eventType: EVENT_TYPE,
      channel: "email",
      locationId: null,
      templateKey: TEMPLATE_KEY,
      priority: "critical",
      variableMap: JSON.stringify({}),
      isActive: true,
      notes: "System default member password-reset binding",
      updatedAt: now,
    };
    const [existingBinding] = await queryInterface.sequelize.query(`
      SELECT id FROM ${quotedSchema}."crm_event_template_bindings"
       WHERE "eventType" = '${EVENT_TYPE}' AND channel = 'email' AND "locationId" IS NULL
       LIMIT 1
    `);
    if (existingBinding.length) {
      await queryInterface.bulkUpdate(
        bindings,
        bindingRow,
        { eventType: EVENT_TYPE, channel: "email", locationId: null }
      );
    } else {
      await queryInterface.bulkInsert(bindings, [{ ...bindingRow, createdAt: now }]);
    }
  },

  async down(queryInterface) {
    const schema = crmSchema();
    const quotedSchema = quoteIdentifier(schema);
    await queryInterface.sequelize.query(`
      DELETE FROM ${quotedSchema}."crm_event_template_bindings"
       WHERE "eventType" = '${EVENT_TYPE}' AND channel = 'email' AND "locationId" IS NULL
    `);
    await queryInterface.sequelize.query(`
      DELETE FROM ${quotedSchema}."crm_transactional_templates"
       WHERE "locationId" IS NULL AND key = '${TEMPLATE_KEY}' AND channel = 'email' AND "isSystem" = true
    `);
  },
};
