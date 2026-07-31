// Shared JWT auth middleware. Validates tokens issued by aeroSportsAdmin
// using the same JWT_SECRET (kept in sync via .env). The admin frontend
// (my-admin-app) calls this service directly with its bearer token.
//
// We don't have access to the UserSession DB row here, so this is a
// pure JWT-only check — no session-store fallback like aeroSportsAdmin.

const jwt = require("jsonwebtoken");

module.exports = function auth(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      statusCode: 401,
      message: "Access denied. No token provided.",
      error: "Access denied. No token provided.",
    });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({
      success: false,
      message: "Server configuration error: JWT_SECRET missing.",
    });
  }

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : authHeader.trim();

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch (err) {
    console.log("JWT VERIFY FAILED:", err.message, "Token:", token, "Secret:", process.env.JWT_SECRET);
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        statusCode: 401,
        message: "Token expired. Please login again.",
        error: "TokenExpiredError",
        expiredAt: err.expiredAt,
      });
    }
    return res.status(401).json({
      success: false,
      statusCode: 401,
      message: "Invalid token. Please login again.",
      error: err.message,
    });
  }
};
