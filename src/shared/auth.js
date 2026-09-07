const jwt = require("jsonwebtoken");
const config = require("../config");

async function verifyWithCore(token) {
  const response = await fetch(
    `${config.integrations.coreApiBaseUrl}/internal/crm/verify-token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-api-secret": config.internalApiSecret,
      },
      body: JSON.stringify({ token }),
    }
  );
  if (!response.ok) return null;
  const payload = await response.json();
  return payload?.data || null;
}

module.exports = async function auth(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      statusCode: 401,
      message: "Access denied. No token provided.",
      error: "Access denied. No token provided.",
    });
  }

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : authHeader.trim();

  try {
    req.user = jwt.verify(token, config.jwtSecret);
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
    try {
      const claims = await verifyWithCore(token);
      if (claims) {
        req.user = claims;
        return next();
      }
    } catch (coreError) {
      req.log?.warn?.({ err: coreError }, "Core token verification unavailable");
    }
    return res.status(401).json({
      success: false,
      statusCode: 401,
      message: "Invalid token. Please login again.",
      error: "InvalidToken",
    });
  }
};
