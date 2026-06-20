const express = require("express");
const sesService = require("./sesService");
const providerEventsService = require("./providerEventsService");
const contactsService = require("../contacts/service");
const queueJobs = require("../queueJobs/service");
const { webhookAuth } = require("../../shared/webhookAuth");

const router = express.Router();

router.post("/ses", webhookAuth("ses"), async (req, res, next) => {
  try {
    const data = await sesService.handleSesWebhook(req.body || {});
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post("/mailgun", webhookAuth("mailgun"), async (req, res, next) => {
  try {
    const data = await providerEventsService.handleMailgunWebhook(req.body || {});
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post("/postmark", webhookAuth("postmark"), async (req, res, next) => {
  try {
    const data = await providerEventsService.handlePostmarkWebhook(req.body || {});
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post("/sendgrid", webhookAuth("sendgrid"), async (req, res, next) => {
  try {
    const data = await providerEventsService.handleSendgridWebhook(req.body || {});
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post("/movira/customer", webhookAuth("movira"), async (req, res, next) => {
  try {
    const data = await contactsService.processMoviraCustomerWebhook(req.body || {});
    const locationId = data.job?.locationId || req.body?.locationId || req.body?.location_id;
    data.automation = await queueJobs.enqueueAutomationEvents(data.automationEvents || [], {
      locationId,
      source: "movira_webhook",
    });
    data.segmentRefresh = await queueJobs.enqueueSegmentRefreshForLocation(locationId, {
      source: "movira_webhook",
      webhookRunId: data.job?.id,
    });
    res.status(202).json({ success: true, data });
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
