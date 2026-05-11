const express = require("express");
const sesService = require("./sesService");

const router = express.Router();

router.post("/ses", async (req, res, next) => {
  try {
    const data = await sesService.handleSesWebhook(req.body || {});
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post("/sms", (_req, res) => {
  res.status(501).json({
    success: false,
    error: "SMS status webhook ingestion is not implemented yet.",
  });
});

module.exports = router;
