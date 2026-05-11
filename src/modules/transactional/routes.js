const express = require("express");
const transactionalService = require("./service");
const templateService = require("./templateService");

const router = express.Router();

router.get("/overview", (_req, res) => {
  res.json({
    success: true,
    data: {
      domain: "transactional",
      ownedByFrontend: "my-admin-app",
      queues: ["transactional-critical", "transactional-default"],
      status: "design-scaffold",
    },
  });
});

router.get("/templates", async (req, res, next) => {
  try {
    const data = await templateService.listTemplates(req.query);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get("/templates/:id", async (req, res, next) => {
  try {
    const data = await templateService.getTemplate(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    return next(err);
  }
});

router.post("/messages", async (req, res, next) => {
  try {
    const result = await transactionalService.enqueueMessage(req.body);
    const message = result.message;
    res.status(result.duplicate ? 200 : 202).json({
      success: true,
      duplicate: result.duplicate,
      data: {
        id: message.id,
        status: message.status,
        channel: message.channel,
        priority: message.priority,
        templateKey: message.templateKey,
        idempotencyKey: message.idempotencyKey,
        enqueue: result.enqueue,
      },
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: err.message,
      });
    }
    return next(err);
  }
});

module.exports = router;
