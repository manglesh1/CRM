const test = require("node:test");
const assert = require("node:assert/strict");
const { requireMarketingSender } = require("../src/modules/messaging-core/providers/domainSenderResolver");

test("marketing cannot use a global sender when this location has no verified identity", async () => {
  const models = {
    CrmEmailDomainRoute: { findAll: async () => [] },
    CrmEmailDomain: { findOne: async ({ where }) => {
      assert.equal(where.locationId, 12);
      assert.equal(where.status, "verified");
      assert.equal(where.isActive, true);
      assert.equal(where.isDefault, true);
      return null;
    } },
  };
  await assert.rejects(requireMarketingSender({ locationId: 12, models }), { code: "VERIFIED_MARKETING_SENDER_REQUIRED" });
});

test("unverified requested sender is rejected instead of replaced", async () => {
  const models = { CrmEmailDomain: { findAll: async () => [] } };
  await assert.rejects(requireMarketingSender({ locationId: 12, from: "unverified@test.example", models }), { code: "UNVERIFIED_SENDER_EMAIL" });
});

test("verified selected sender resolves for the requested location", async () => {
  const models = {
    CrmEmailDomain: {
      findAll: async () => [{ id: "verified", domain: "park.example", senderEmail: "hello@park.example", provider: "movira_ses" }],
    },
  };
  assert.equal((await requireMarketingSender({ locationId: 12, from: "hello@park.example", models })).from, "hello@park.example");
});
