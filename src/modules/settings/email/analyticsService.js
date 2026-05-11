// Email Analytics + Bounce Classification.
//
// Both aggregate the same underlying tables that the messaging-core writes
// when sending and processing webhook events:
//   crm_transactional_messages         (one row per send attempt)
//   crm_transactional_delivery_events  (one row per provider event)
//
// Until the messaging-core is fully wired the tables may be empty, in which
// case the endpoints return zeroed metrics — UI shells render the same way.

const { Op } = require("sequelize");
const { getModels } = require("../../../db/models");

function parseRange(query = {}) {
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 7 * 86400000);
  const from = query.from ? new Date(query.from) : defaultFrom;
  const to = query.to ? new Date(query.to) : now;
  // Treat `to` as inclusive end-of-day if it's a bare date.
  if (query.to && /^\d{4}-\d{2}-\d{2}$/.test(query.to)) {
    to.setUTCHours(23, 59, 59, 999);
  }
  return { from, to };
}

async function getEmailAnalytics(query = {}) {
  const { TransactionalMessage, TransactionalDeliveryEvent } = getModels();
  const { from, to } = parseRange(query);
  const locationId = query.locationId ? { locationId: Number(query.locationId) } : {};

  // Sent / Delivered / Failed live on the message row itself.
  const messages = await TransactionalMessage.findAll({
    where: {
      channel: "email",
      ...locationId,
      createdAt: { [Op.between]: [from, to] },
    },
    attributes: ["id", "status", "sentAt", "deliveredAt", "failedAt"],
  });

  let sent = 0;
  let delivered = 0;
  let failed = 0;
  const messageIds = [];
  for (const m of messages) {
    messageIds.push(m.id);
    if (m.sentAt) sent += 1;
    if (m.deliveredAt) delivered += 1;
    if (m.failedAt || m.status === "failed") failed += 1;
  }

  // Engagement events come from the delivery_events stream.
  const COUNTED_TYPES = ["opened", "clicked", "bounced", "complained", "unsubscribed"];
  const eventRows = messageIds.length
    ? await TransactionalDeliveryEvent.findAll({
        where: {
          messageId: { [Op.in]: messageIds },
          eventType: { [Op.in]: COUNTED_TYPES },
        },
        attributes: ["messageId", "eventType"],
      })
    : [];

  // Dedupe per (messageId, eventType) so a message that bounced 3 times
  // (provider retried) only counts once in "Bounced".
  const seen = new Set();
  const counts = { opened: 0, clicked: 0, bounced: 0, complained: 0, unsubscribed: 0 };
  for (const e of eventRows) {
    const key = `${e.messageId}:${e.eventType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    counts[e.eventType] = (counts[e.eventType] || 0) + 1;
  }

  // Percentages are relative to sent (industry convention).
  const pct = (n) => (sent > 0 ? Math.round((n / sent) * 1000) / 10 : 0);
  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    metrics: {
      sent: { count: sent, pct: sent > 0 ? 100 : 0 },
      delivered: { count: delivered, pct: pct(delivered) },
      opened: { count: counts.opened, pct: pct(counts.opened) },
      clicked: { count: counts.clicked, pct: pct(counts.clicked) },
      complained: { count: counts.complained, pct: pct(counts.complained) },
      bounced: { count: counts.bounced, pct: pct(counts.bounced) },
      unsubscribed: { count: counts.unsubscribed, pct: pct(counts.unsubscribed) },
      failed: { count: failed, pct: pct(failed) },
    },
  };
}

// Heuristic ESP detection from recipient domain — production should also
// inspect the bounce report's reporting MTA (event payload).
function detectEspFromAddress(address) {
  const domain = String(address || "").split("@")[1]?.toLowerCase() || "";
  if (/(gmail|googlemail)\./.test(domain)) return "Gmail";
  if (/(outlook|hotmail|live|msn)\./.test(domain)) return "Outlook US";
  if (/(office365|onmicrosoft|outlook365)\./.test(domain)) return "Outlook 365";
  if (/yahoo\./.test(domain)) return "Yahoo";
  if (/(apple|icloud|me\.com|mac\.com)\./.test(domain)) return "Apple";
  if (/(bell|rogers|telus|shaw)\.ca$/.test(domain)) return "Canadian";
  return "Other";
}

// Map provider error code / SMTP status to a bounce category + human
// definition. The lookup is intentionally simple; the messaging-core can
// override per-event with richer metadata in the payload.
const STATUS_DEFINITIONS = [
  { match: /^4\.2\.2|452/, category: "Mailbox Full/Unavailable", definition: "The recipient's mailbox is full and cannot accept new messages until space is freed." },
  { match: /^5\.5\.0|550/,  category: "Mailbox Full/Unavailable", definition: "The recipient's mailbox is unavailable or cannot accept messages." },
  { match: /^5\.1\.[1-7]|550/, category: "Uncategorized", definition: "Possible reasons: invalid email address, failed DMARC/DKIM authentication, or IP address on a DNS blacklist." },
  { match: /^5\.7\.1|554|501/, category: "Spam-Like / Unsolicited", definition: "The message was rejected as spam or for violating recipient security or content policies." },
  { match: /^4\.1\.8|450/, category: "No MX / DNS Issue", definition: "The sender's domain could not be found in DNS, so the message was rejected." },
  { match: /^602/, category: "Rate Limited/Throttled", definition: "The sending server is temporarily restricted due to high volume or low reputation." },
];

function classifyStatus(errorCode, statusCode) {
  const haystack = `${statusCode || ""} ${errorCode || ""}`.trim();
  for (const def of STATUS_DEFINITIONS) {
    if (def.match.test(haystack)) return def;
  }
  return { category: "Uncategorized", definition: "Bounce reason not yet classified." };
}

async function getBounceClassification(query = {}) {
  const { TransactionalMessage, TransactionalDeliveryEvent } = getModels();
  const { from, to } = parseRange(query);
  const locationId = query.locationId ? { locationId: Number(query.locationId) } : {};

  // Pull email-channel messages for the window once so we have address +
  // delivered counts without re-running the join per row.
  const messages = await TransactionalMessage.findAll({
    where: {
      channel: "email",
      ...locationId,
      createdAt: { [Op.between]: [from, to] },
    },
    attributes: ["id", "recipientAddress", "deliveredAt", "status"],
  });
  const messagesById = new Map(messages.map((m) => [m.id, m]));
  const totalDelivered = messages.filter((m) => m.deliveredAt).length;

  const bounceEvents = messages.length
    ? await TransactionalDeliveryEvent.findAll({
        where: {
          messageId: { [Op.in]: messages.map((m) => m.id) },
          eventType: "bounced",
        },
      })
    : [];

  // Group by (esp, errorCode, statusCode).
  const buckets = new Map();
  let permanentBounces = 0;
  let espBlocks = 0;
  for (const e of bounceEvents) {
    const payload = e.payload || {};
    const errorCode = String(payload.errorCode || payload.error_code || "");
    const statusCode = String(payload.statusCode || payload.status_code || "");
    const isPermanent = payload.bounceType
      ? String(payload.bounceType).toLowerCase() === "permanent"
      : /^5/.test(statusCode);
    if (isPermanent) permanentBounces += 1;
    if (/(blocked|throttled|rate limit)/i.test(payload.reason || "") || /^602/.test(errorCode)) {
      espBlocks += 1;
    }
    const msg = messagesById.get(e.messageId);
    const esp = detectEspFromAddress(msg?.recipientAddress);
    const { category, definition } = classifyStatus(errorCode, statusCode);
    const key = `${esp}:${category}:${errorCode}:${statusCode}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        emailServiceProvider: esp,
        category,
        errorCode: errorCode || "—",
        statusCode: statusCode || "NA",
        definition,
        count: 0,
      });
    }
    buckets.get(key).count += 1;
  }

  const total = bounceEvents.length || 0;
  const overview = Array.from(buckets.values())
    .map((b) => ({
      ...b,
      pct: total > 0 ? Math.round((b.count / total) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const totalAttempts = messages.length;
  const permanentBounceRate = totalAttempts > 0
    ? Math.round((permanentBounces / totalAttempts) * 10000) / 100
    : 0;
  const deliveryRate = totalAttempts > 0
    ? Math.round((totalDelivered / totalAttempts) * 10000) / 100
    : 0;

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    summary: {
      permanentBounces,
      permanentBounceRate,
      espBlocks,
      delivered: totalDelivered,
      deliveryRate,
    },
    overview,
  };
}

module.exports = { getEmailAnalytics, getBounceClassification };
