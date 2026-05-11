require("dotenv").config();

const base = {
  dialect: "postgres",
  logging: false,
};

function fromUrl() {
  return {
    use_env_variable: "DATABASE_URL",
    ...base,
  };
}

function fromParts() {
  return {
    username: process.env.DB_USERNAME || "your_db_username",
    password: process.env.DB_PASSWORD || "your_db_password",
    database: process.env.DB_NAME || "trampoline_booking_db",
    host: process.env.DB_HOST || "127.0.0.1",
    ...base,
  };
}

module.exports = {
  development: process.env.DATABASE_URL ? fromUrl() : fromParts(),
  test: process.env.DATABASE_URL ? fromUrl() : fromParts(),
  production: process.env.DATABASE_URL ? fromUrl() : fromParts(),
};
