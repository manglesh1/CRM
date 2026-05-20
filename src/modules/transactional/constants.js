const CHANNELS = new Set(["email", "sms", "whatsapp", "push"]);
const PRIORITIES = new Set(["critical", "high", "normal"]);

const STATUS = {
  PENDING: "pending",
  QUEUED: "queued",
  ENQUEUE_SKIPPED: "enqueue_skipped",
  SENDING: "sending",
  SENT: "sent",
  DELIVERED: "delivered",
  FAILED: "failed",
  CANCELLED: "cancelled",
};

const DELIVERY_EVENT = {
  QUEUED: "queued",
  SENDING: "sending",
  SENT: "sent",
  FAILED: "failed",
  DELIVERED: "delivered",
  BOUNCED: "bounced",
  COMPLAINED: "complained",
  OPENED: "opened",
  CLICKED: "clicked",
  UNSUBSCRIBED: "unsubscribed",
};

module.exports = {
  CHANNELS,
  PRIORITIES,
  STATUS,
  DELIVERY_EVENT,
};
