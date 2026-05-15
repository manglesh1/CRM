"use strict";

const {
  buildTransactionalSystemDesign,
  buildTransactionalPlainText,
  collectTransactionalVariables,
} = require("../src/modules/transactional/systemTemplateDesigns");

module.exports = {
  up: async (queryInterface) => {
    const [templates] = await queryInterface.sequelize.query(
      `
      SELECT key, name, family, category, description, subject, body, defaults
      FROM crm_transactional_templates
      WHERE "locationId" IS NULL
        AND "isSystem" = true
        AND channel = 'email'
      ORDER BY family ASC, name ASC
      `
    );

    for (const template of templates) {
      const design = buildTransactionalSystemDesign(template);
      const plainText = buildTransactionalPlainText(template);
      const variables = collectTransactionalVariables({ ...template, plainText }, design);

      await queryInterface.bulkUpdate(
        "crm_transactional_templates",
        {
          editorType: "design",
          designJson: JSON.stringify(design),
          plainText,
          variables: JSON.stringify(variables),
          config: JSON.stringify({ contentType: "html", textFallback: plainText }),
          updatedAt: new Date(),
        },
        {
          locationId: null,
          key: template.key,
          channel: "email",
          isSystem: true,
        }
      );
    }
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(
      `
      UPDATE crm_transactional_templates
      SET "editorType" = 'code',
          "designJson" = NULL,
          "plainText" = NULL,
          "updatedAt" = NOW()
      WHERE "locationId" IS NULL
        AND "isSystem" = true
        AND channel = 'email'
      `
    );
  },
};
