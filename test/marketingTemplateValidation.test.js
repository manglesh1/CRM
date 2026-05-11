const assert = require("node:assert/strict");
const test = require("node:test");
const { createDefaultDesign } = require("../src/modules/marketing/email/builder/defaultDesign");
const { validateTemplateBeforeSend } = require("../src/modules/marketing/email/service");

test("template validation warns for unresolved merge tags and placeholder links", () => {
  const design = createDefaultDesign({
    sections: [
      {
        id: "sec",
        layout: "1",
        settings: { mobileStack: true },
        columns: [
          {
            id: "col",
            blocks: [
              {
                id: "text",
                type: "text",
                content: "Hello {{business.name}}",
                settings: {},
              },
              {
                id: "btn",
                type: "button",
                content: "Click here",
                settings: { href: "#" },
              },
            ],
          },
        ],
      },
    ],
  });
  const result = validateTemplateBeforeSend({
    editorType: "design",
    designJson: design,
  }, {
    subject: "Hello {{contact.firstName}}",
    recipients: [{ email: "ava@example.com", data: { contact: { firstName: "Ava" } } }],
  });

  assert.equal(result.ok, true);
  assert.ok(result.warnings.some((warning) => warning.key === "mergeTags"));
  assert.ok(result.warnings.some((warning) => warning.key === "placeholderUrls"));
});

test("template validation blocks unsafe URLs before send", () => {
  const design = createDefaultDesign({
    sections: [
      {
        id: "sec",
        layout: "1",
        settings: { mobileStack: true },
        columns: [
          {
            id: "col",
            blocks: [
              {
                id: "btn",
                type: "button",
                content: "Open",
                settings: { href: "javascript:alert(1)" },
              },
            ],
          },
        ],
      },
    ],
  });

  const result = validateTemplateBeforeSend({
    editorType: "design",
    designJson: design,
  }, {
    subject: "Unsafe link test",
    recipients: [{ email: "ava@example.com", data: {} }],
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.key === "unsafeUrls"));
});
