const config = require("../config");

module.exports = {
  credentials: true,
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const allowed = config.security.allowedOrigins;
    if (allowed.length === 0 && config.env !== "production") {
      return callback(null, true);
    }
    if (allowed.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("CORS origin is not allowed."));
  },
};
