const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
const { applyTracking } = require("./builder/renderer");

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}

function resolve(source, data, html = false) {
  return String(source || "").replace(TOKEN_RE, (_match, path) => {
    const value = path.split(".").reduce((current, key) => current?.[key], data);
    return value == null ? "" : html ? escapeHtml(value) : String(value);
  });
}

function htmlToText(html) {
  return String(html || "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\b[^>]*\bhref\s*=\s*(["'])(https?:\/\/[^"']+)\1[^>]*>([\s\S]*?)<\/a>/gi, (_match, _quote, href, label) => `${label} (${href})`)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (match, code) => {
      const number = code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : Number(code);
      return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : match;
    })
    .replace(/&(nbsp|amp|lt|gt|quot|apos);/gi, (_match, entity) => ({
      nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
    }[entity.toLowerCase()]))
    .replace(/\n{3,}/g, "\n\n").trim();
}

function renderRawTemplate({ editorType = "code", htmlBody = "", plainText = "", data = {}, tracking = null } = {}) {
  const text = resolve(plainText, data);
  if (editorType === "plain") {
    return {
      htmlBody: applyTracking(`<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#111827;white-space:pre-wrap;">${escapeHtml(text).replace(/https?:\/\/[^\s<>]+/gi, (url) => `<a href="${url}">${url}</a>`)}</div>`, tracking),
      plainText: text,
    };
  }
  const html = resolve(htmlBody, data, true);
  return { htmlBody: applyTracking(html, tracking), plainText: plainText.trim() ? text : htmlToText(html) };
}

module.exports = { renderRawTemplate, htmlToText };
