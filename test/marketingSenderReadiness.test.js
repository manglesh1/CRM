const test = require("node:test");
const assert = require("node:assert/strict");
const { getModels } = require("../src/db/models");
const { requireMarketingSender } = require("../src/modules/messaging-core/providers/domainSenderResolver");

test("marketing cannot use a global sender when this location has no verified identity", async () => {
  const models = getModels();
  const routes = models.CrmEmailDomainRoute.findAll;
  const findOne = models.CrmEmailDomain.findOne;
  try {
    models.CrmEmailDomainRoute.findAll = async () => [];
    models.CrmEmailDomain.findOne = async ({ where }) => {
      assert.equal(where.locationId, 12);
      assert.equal(where.status, "verified");
      assert.equal(where.isActive, true);
      assert.equal(where.isDefault, true);
      return null;
    };
    await assert.rejects(requireMarketingSender({ locationId: 12 }), { code: "VERIFIED_MARKETING_SENDER_REQUIRED" });
  } finally {
    models.CrmEmailDomainRoute.findAll = routes;
    models.CrmEmailDomain.findOne = findOne;
  }
});

test("unverified requested sender is rejected instead of replaced", async () => {
  const model = getModels().CrmEmailDomain;
  const original = model.findAll;
  try {
    model.findAll = async () => [];
    await assert.rejects(requireMarketingSender({ locationId: 12, from: "unverified@test.example" }), { code: "UNVERIFIED_SENDER_EMAIL" });
  } finally { model.findAll = original; }
});

test("verified selected sender resolves for the requested location", async () => {
  const model = getModels().CrmEmailDomain;
  const original = model.findAll;
  try {
    model.findAll = async () => [{ id: "verified", domain: "park.example", senderEmail: "hello@park.example", provider: "movira_ses" }];
    assert.equal((await requireMarketingSender({ locationId: 12, from: "hello@park.example" })).from, "hello@park.example");
  } finally { model.findAll = original; }
});
