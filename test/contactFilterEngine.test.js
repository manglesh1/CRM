const assert = require("node:assert/strict");
const test = require("node:test");
const { Op } = require("sequelize");
const engine = require("../src/modules/contacts/filterEngine");

const CUSTOM_FIELDS = [
  { key: "favourite_park", label: "Favourite park", fieldType: "dropdown", options: ["London", "Windsor"] },
  { key: "lifetime_spend", label: "Lifetime spend", fieldType: "currency" },
];

function symbols(obj) {
  return Object.getOwnPropertySymbols(obj || {});
}

test("empty / unknown filters compile to no constraint", () => {
  assert.deepEqual(engine.compile(null), {});
  assert.deepEqual(engine.compile({ match: "all", conditions: [] }), {});
  // unknown field is ignored, not crashed
  assert.deepEqual(engine.compile({ match: "all", conditions: [{ field: "nope", operator: "is", value: "x" }] }), {});
});

test("single condition compiles to a column fragment", () => {
  const where = engine.compile({ match: "all", conditions: [{ field: "email", operator: "contains", value: "gmail" }] });
  assert.ok(where.email, "email key present");
  assert.ok(symbols(where.email).includes(Op.iLike), "uses ILIKE");
  assert.equal(where.email[Op.iLike], "%gmail%");
});

test("multiple conditions group under the chosen combinator", () => {
  const all = engine.compile({
    match: "all",
    conditions: [
      { field: "lifecycle", operator: "is", value: "customer" },
      { field: "email", operator: "is_not_empty" },
    ],
  });
  assert.ok(symbols(all).includes(Op.and), "match all -> Op.and");

  const any = engine.compile({
    match: "any",
    conditions: [
      { field: "lifecycle", operator: "is", value: "customer" },
      { field: "lifecycle", operator: "is", value: "lead" },
    ],
  });
  assert.ok(symbols(any).includes(Op.or), "match any -> Op.or");
});

test("tags operators build containment fragments", () => {
  const hasAny = engine.compile({ match: "all", conditions: [{ field: "tags", operator: "has_any", value: ["a", "b"] }] });
  assert.ok(symbols(hasAny).includes(Op.or), "has_any is an OR of contains");

  const hasAll = engine.compile({ match: "all", conditions: [{ field: "tags", operator: "has_all", value: ["a", "b"] }] });
  assert.ok(hasAll.tags && symbols(hasAll.tags).includes(Op.contains), "has_all uses @>");

  const hasNone = engine.compile({ match: "all", conditions: [{ field: "tags", operator: "has_none", value: ["a"] }] });
  assert.ok(symbols(hasNone).includes(Op.not), "has_none wraps in NOT");
});

test("custom fields compile via JSONB literal (no crash, produces a fragment)", () => {
  const where = engine.compile(
    {
      match: "all",
      conditions: [
        { field: "cf:favourite_park", operator: "is", value: "London" },
        { field: "cf:lifetime_spend", operator: "gte", value: 100 },
      ],
    },
    { customFields: CUSTOM_FIELDS }
  );
  assert.ok(symbols(where).includes(Op.and));
  assert.equal(where[Op.and].length, 2);
});

test("custom field key is required to be present in catalog", () => {
  // Without the custom field definition, cf: condition is dropped.
  const where = engine.compile({ match: "all", conditions: [{ field: "cf:favourite_park", operator: "is", value: "London" }] });
  assert.deepEqual(where, {});
});

test("legacy fixed-shape filters convert to a tree with marketing defaults", () => {
  const tree = engine.normalize({ lifecycles: ["customer"], tagsAny: ["vip"] });
  assert.equal(tree.match, "all");
  const fieldsUsed = tree.conditions.flatMap((c) => (c.conditions ? c.conditions.map((x) => x.field) : [c.field]));
  assert.ok(fieldsUsed.includes("lifecycle"));
  assert.ok(fieldsUsed.includes("tags"));
  // subscribedOnly defaults on -> marketingStatus + doNotContact constraints added
  assert.ok(fieldsUsed.includes("marketingStatus"));
  assert.ok(fieldsUsed.includes("doNotContact"));
  // hasEmail defaults on -> email is_not_empty
  assert.ok(fieldsUsed.includes("email"));
});

test("isAdvancedTree distinguishes the two shapes", () => {
  assert.equal(engine.isAdvancedTree({ match: "all", conditions: [] }), true);
  assert.equal(engine.isAdvancedTree({ lifecycles: ["customer"] }), false);
});

test("searchFragment matches name / email / phone", () => {
  const frag = engine.searchFragment("ava");
  assert.ok(symbols(frag).includes(Op.or));
  assert.equal(frag[Op.or].length, 5);
  assert.equal(engine.searchFragment(""), null);
});
