const express = require("express");
const tracking = require("./tracking");

const router = express.Router();

const PIXEL = Buffer.from(
  "R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==",
  "base64"
);

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

router.get("/open/:messageId.gif", async (req, res) => {
  try {
    await tracking.recordTransactionalEngagementEvent(req.params.messageId, "open", {
      source: "tracking_pixel",
      ip: req.ip,
      userAgent: req.get?.("user-agent") || null,
      referer: req.get?.("referer") || null,
    });
  } catch (_err) {
    // Tracking pixels must never break the recipient experience.
  }
  res.set({
    "Content-Type": "image/gif",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Content-Length": PIXEL.length,
  });
  res.end(PIXEL);
});

router.get("/click/:messageId", async (req, res) => {
  const destinationUrl = req.query.u ? String(req.query.u) : "";
  if (!isHttpUrl(destinationUrl)) {
    return res.status(400).send("Invalid destination URL");
  }
  try {
    await tracking.recordTransactionalEngagementEvent(req.params.messageId, "click", {
      source: "tracked_redirect",
      destinationUrl,
      ip: req.ip,
      userAgent: req.get?.("user-agent") || null,
      referer: req.get?.("referer") || null,
    });
  } catch (_err) {
    // Still redirect; click tracking should degrade gracefully.
  }
  return res.redirect(302, destinationUrl);
});

module.exports = router;
