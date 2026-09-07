"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { _internal } = require("../src/shared/authorizeLocation");

test("CRM location context resolves from X-Location-Id", () => {
  const locationId = _internal.extractLocationId({
    headers: { "x-location-id": "7" },
    params: {},
    body: {},
    query: {},
  });
  assert.equal(locationId, 7);
});

test("CRM rejects conflicting header and query location context", () => {
  assert.throws(
    () => _internal.extractLocationId({
      headers: { "x-location-id": "7" },
      params: {},
      body: {},
      query: { locationId: "8" },
    }),
    (error) => error.code === "location_scope_mismatch" && error.statusCode === 400
  );
});

test("CRM authorization preserves billing suspension instead of reporting location denial", () => {
  const failure = _internal.authorizationFailure({
    statusCode: 402,
    payload: { data: { reason: "billing_suspended" } },
  });

  assert.deepEqual(failure, {
    statusCode: 402,
    error: "crm_billing_suspended",
    message: "CRM access is paused for this location because billing is suspended.",
  });
});

test("CRM authorization gives settings users an actionable permission message", () => {
  const failure = _internal.authorizationFailure({
    statusCode: 403,
    payload: {
      data: {
        crmPermission: {
          reason: "permission_denied",
          rule: { permission: "crm.settings.write" },
        },
      },
    },
  }, "crm:settings:write");

  assert.equal(failure.error, "crm_permission_denied");
  assert.equal(failure.requiredPermission, "crm.settings.write");
  assert.match(failure.message, /Manage CRM settings/i);
});
