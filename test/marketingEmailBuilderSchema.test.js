const assert = require("node:assert/strict");
const test = require("node:test");
const { validateDesign } = require("../src/modules/marketing/email/builder/schema");
const { createDefaultDesign } = require("../src/modules/marketing/email/builder/defaultDesign");

test("accepts the default builder design", () => {
  assert.equal(validateDesign(createDefaultDesign()), true);
});

test("rejects unsupported block types", () => {
  const design = createDefaultDesign({
    sections: [
      {
        id: "sec_1",
        columns: [
          {
            id: "col_1",
            blocks: [{ id: "bad_1", type: "unsupported" }],
          },
        ],
      },
    ],
  });

  assert.throws(
    () => validateDesign(design),
    (err) => err.statusCode === 400 && err.errors.some((item) => item.field.endsWith(".type"))
  );
});
