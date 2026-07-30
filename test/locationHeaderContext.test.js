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
