const config = require("../config");

function normalizeLocationId(value) {
  if (value === undefined || value === null || value === "") return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function extractLocationId(req) {
  const locationIds = [
    req.headers["x-location-id"],
    req.params?.locationId,
    req.body?.locationId,
    req.query?.locationId,
  ]
    .map(normalizeLocationId)
    .filter(Boolean);
  const uniqueLocationIds = [...new Set(locationIds)];
  if (uniqueLocationIds.length > 1) {
    const err = new Error("Request location values do not match.");
    err.statusCode = 400;
    err.code = "location_scope_mismatch";
    throw err;
  }
  return uniqueLocationIds[0] || null;
}

async function askCoreAuthorization({ user, locationId, action, req }) {
  const userId = Number(user?.id || user?.user_id);
  if (!userId) {
    const err = new Error("Invalid user context.");
    err.statusCode = 401;
    throw err;
  }

  const url = `${config.integrations.coreApiBaseUrl}/internal/crm/authorize`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-api-secret": config.internalApiSecret,
    },
    body: JSON.stringify({
      userId,
      roleId: user.role_id,
      role: user.role,
      locationId,
      action,
      route: req.originalUrl,
      method: req.method,
    }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const result = {
    allowed: response.ok && payload?.allowed === true,
    statusCode: response.status,
    payload,
  };

  return result;
}

module.exports = function authorizeLocation(options = {}) {
  const action = options.action || "crm:read";
  const requireLocation = options.requireLocation === true;

  return async function authorizeLocationMiddleware(req, res, next) {
    try {
      const locationId = extractLocationId(req);
      if (requireLocation && !locationId) {
        return res.status(400).json({
          success: false,
          error: "location_id_required",
          message: "locationId is required.",
        });
      }

      const result = await askCoreAuthorization({
        user: req.user,
        locationId,
        action: typeof action === "function" ? action(req) : action,
        req,
      });

      if (!result.allowed) {
        return res.status(result.statusCode === 401 ? 401 : 403).json({
          success: false,
          error: "location_access_denied",
          message: "You do not have access to this CRM location.",
        });
      }

      req.crmAuthz = result.payload?.data || {};
      req.crmLocationId = locationId;
      if (locationId) {
        req.query = { ...(req.query || {}), locationId };
        if (
          req.body &&
          typeof req.body === "object" &&
          !Array.isArray(req.body) &&
          !Buffer.isBuffer(req.body)
        ) {
          req.body.locationId = locationId;
        }
      }
      return next();
    } catch (err) {
      if (err.statusCode === 400) {
        return res.status(400).json({
          success: false,
          error: err.code || "invalid_location_context",
          message: err.message,
        });
      }
      req.log?.error?.({ err }, "CRM authorization failed");
      return res.status(err.statusCode || 503).json({
        success: false,
        error: "authorization_service_unavailable",
        message: "Unable to verify CRM access right now.",
      });
    }
  };
};

module.exports._internal = {
  extractLocationId,
  normalizeLocationId,
};
