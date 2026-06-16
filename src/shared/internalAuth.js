const config = require("../config");
const crypto = require("crypto");

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

module.exports = function internalAuth(req, res, next) {
  const expected = config.internalApiSecret;
  if (!expected) {
    return res.status(500).json({
      success: false,
      error: "internal_auth_not_configured",
      message: "INTERNAL_API_SECRET is not configured.",
    });
  }

  const headerSecret = req.headers["x-internal-api-secret"];
  const authHeader = req.headers.authorization || "";
  const bearerSecret = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  const provided = headerSecret || bearerSecret;

  if (!provided || !safeEqual(provided, expected)) {
    return res.status(401).json({
      success: false,
      error: "invalid_internal_secret",
      message: "Internal service authentication failed.",
    });
  }

  return next();
};
