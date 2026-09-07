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

function authorizationFailure(result = {}) {
  const statusCode = Number(result.statusCode) || 403;
  const reason =
    result.payload?.data?.reason ||
    result.payload?.data?.crmPermission?.reason ||
    result.payload?.error ||
    "authorization_denied";

  if (statusCode === 401) {
    return {
      statusCode: 401,
      error: "invalid_session",
      message: "Your session could not be verified. Please sign in again.",
    };
  }
  if (statusCode === 402 || reason === "billing_suspended") {
    return {
      statusCode: 402,
      error: "crm_billing_suspended",
      message: "CRM access is paused for this location because billing is suspended.",
    };
  }
  if (reason === "crm_module_not_enabled") {
    return {
      statusCode: 403,
      error: reason,
      message: "CRM is not enabled for this location.",
    };
  }
  if (["permission_denied", "ui_access_denied", "permission_not_configured", "ui_not_configured"].includes(reason)) {
    return {
      statusCode: 403,
      error: "crm_permission_denied",
      message: "Your role does not have permission to perform this CRM action.",
    };
  }
  return {
    statusCode: 403,
    error: "location_access_denied",
    message: "You do not have access to the selected CRM location.",
  };
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
        const failure = authorizationFailure(result);
        req.log?.warn?.(
          {
            action: typeof action === "function" ? action(req) : action,
            locationId,
            reason:
              result.payload?.data?.reason ||
              result.payload?.data?.crmPermission?.reason ||
              result.payload?.error ||
              null,
            coreStatusCode: result.statusCode,
          },
          "CRM authorization denied"
        );
        return res.status(failure.statusCode).json({
          success: false,
          error: failure.error,
          message: failure.message,
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
  authorizationFailure,
  extractLocationId,
  normalizeLocationId,
};
