const pino = require("pino");

const isProduction = process.env.NODE_ENV === "production";
const prettyLogs =
  process.env.LOG_PRETTY === "true" ||
  (!isProduction && process.env.LOG_PRETTY !== "false");

function inferComponent() {
  if (process.env.MOVIRA_COMPONENT) return process.env.MOVIRA_COMPONENT;

  const entry = String(process.argv[1] || "");
  const match = entry.match(/([^/\\]+)\.js$/);
  if (!match || match[1] === "server") return "api";

  return match[1]
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/worker$/i, "worker")
    .toLowerCase();
}

const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  gray: "\x1b[90m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  bold: "\x1b[1m",
};

const levelStyles = {
  10: { label: "TRACE", color: colors.gray },
  20: { label: "DEBUG", color: colors.blue },
  30: { label: "INFO ", color: colors.green },
  40: { label: "WARN ", color: colors.yellow },
  50: { label: "ERROR", color: colors.red },
  60: { label: "FATAL", color: colors.magenta },
};

function color(value, style) {
  return `${style}${value}${colors.reset}`;
}

function formatTime(time) {
  return new Date(time || Date.now()).toLocaleTimeString("en-IN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function statusColor(statusCode) {
  if (statusCode >= 500) return colors.red;
  if (statusCode >= 400) return colors.yellow;
  if (statusCode >= 300) return colors.cyan;
  return colors.green;
}

function pickExtras(log) {
  const skip = new Set([
    "level",
    "time",
    "pid",
    "hostname",
    "service",
    "component",
    "msg",
    "req",
    "res",
    "responseTime",
    "err",
  ]);

  const extras = {};
  for (const [key, value] of Object.entries(log)) {
    if (skip.has(key) || value === undefined || value === null) continue;
    extras[key] = value;
  }
  return Object.keys(extras).length ? extras : null;
}

function formatExtras(extras) {
  if (!extras) return "";
  return ` ${color(JSON.stringify(extras), colors.gray)}`;
}

function formatError(err) {
  if (!err) return "";
  const stack = err.stack || err.message || String(err);
  return `\n${color(stack, colors.red)}`;
}

function formatHttp(log) {
  const method = log.req?.method || "HTTP";
  const url = log.req?.url || "";
  const statusCode = Number(log.res?.statusCode || 0);
  const responseTime = Number(log.responseTime || 0);
  const status = statusCode ? color(statusCode, statusColor(statusCode)) : "-";
  const duration = Number.isFinite(responseTime)
    ? color(`${responseTime.toFixed(0)}ms`, colors.gray)
    : "";

  return `${color(method.padEnd(6), colors.cyan)} ${url} ${status} ${duration}`;
}

function prettyLine(log) {
  const style = levelStyles[log.level] || levelStyles[30];
  const prefix = [
    color(formatTime(log.time), colors.dim),
    color(style.label, style.color + colors.bold),
    color(`${log.service || "movira-crm"}:${log.component || "api"}`, colors.magenta),
  ].join(" ");

  const message = log.req && log.res
    ? formatHttp(log)
    : `${log.msg || ""}${formatExtras(pickExtras(log))}`;

  return `${prefix} ${message}${formatError(log.err)}`;
}

const prettyStream = {
  write(line) {
    try {
      const log = JSON.parse(line);
      process.stdout.write(`${prettyLine(log)}\n`);
    } catch (_err) {
      process.stdout.write(line);
    }
  },
};

const loggerOptions = {
  level: process.env.LOG_LEVEL || "info",
  base: {
    service: "movira-crm",
    component: inferComponent(),
  },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers.set-cookie",
      'req.headers["x-internal-api-secret"]',
      'req.headers["x-movira-webhook-secret"]',
      'req.headers["x-api-key"]',
      "headers.authorization",
      "headers.cookie",
      "headers.set-cookie",
      'headers["x-internal-api-secret"]',
      'headers["x-movira-webhook-secret"]',
      'headers["x-api-key"]',
    ],
    censor: "[redacted]",
  },
  serializers: {
    err: pino.stdSerializers.err,
  },
};

module.exports = prettyLogs
  ? pino(loggerOptions, prettyStream)
  : pino(loggerOptions);
