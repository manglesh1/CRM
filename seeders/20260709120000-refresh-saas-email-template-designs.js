"use strict";

const {
  buildTransactionalSystemDesign,
  buildTransactionalPlainText,
  collectTransactionalVariables,
} = require("../src/modules/transactional/systemTemplateDesigns");

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

module.exports = {
  up: async (queryInterface) => {
    const [templates] = await queryInterface.sequelize.query(
      `
      SELECT id, key, name, family, category, description, subject, body, defaults
      FROM crm_transactional_templates
      WHERE "locationId" IS NULL
        AND channel = 'email'
        AND "isSystem" = true
        AND family = 'saas'
      ORDER BY key
      `
    );

    for (const template of templates) {
      const defaults = parseJson(template.defaults, {});
      const designSource = {
        key: template.key,
        name: template.name,
        family: template.family,
        category: template.category,
        description: template.description,
        subject: template.subject,
        body: template.body,
        defaults,
      };
      const designJson = buildTransactionalSystemDesign(designSource);
      const plainText = buildTransactionalPlainText(designSource);
      const variables = collectTransactionalVariables({ ...designSource, plainText }, designJson);

      await queryInterface.bulkUpdate(
        "crm_transactional_templates",
        {
          editorType: "design",
          designJson: JSON.stringify(designJson),
          plainText,
          config: JSON.stringify({ contentType: "html", textFallback: null }),
          variables: JSON.stringify(variables),
          updatedAt: new Date(),
        },
        { id: template.id }
      );
    }
  },

  down: async () => {},
};
