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

function handleError(err, res, next) {
  if (err.statusCode) {
    return res.status(err.statusCode).json({ success: false, error: err.message });
  }
  return next(err);
}

router.get("/templates", async (req, res, next) => {
  try {
    const data = await templateService.listTemplates(req.query);
    res.json({ success: true, data });
  } catch (err) {
    handleError(err, res, next);
  }
});

router.get("/templates/:id", async (req, res, next) => {
  try {
    const data = await templateService.getTemplate(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    handleError(err, res, next);
  }
});

router.post("/templates", async (req, res, next) => {
  try {
    const data = await templateService.createTemplate(req.body, req.user);
    res.status(201).json({ success: true, data });
  } catch (err) {
    handleError(err, res, next);
  }
});

router.patch("/templates/:id", async (req, res, next) => {
  try {
    const data = await templateService.updateTemplate(req.params.id, req.body, req.user);
    res.json({ success: true, data });
  } catch (err) {
    handleError(err, res, next);
  }
});

router.delete("/templates/:id", async (req, res, next) => {
  try {
    const data = await templateService.deleteTemplate(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    handleError(err, res, next);
  }
});

router.post("/templates/:id/clone", async (req, res, next) => {
  try {
    const data = await templateService.cloneTemplate(req.params.id, req.body || {}, req.user);
    res.status(201).json({ success: true, data });
  } catch (err) {
    handleError(err, res, next);
  }
});

router.post("/templates/:id/test-send", async (req, res, next) => {
  try {
    const data = await templateService.testSendTemplate(req.params.id, req.body || {});
    res.json({ success: true, data });
  } catch (err) {
    handleError(err, res, next);
  }
});

router.post("/templates/render", async (req, res, next) => {
  try {
    const data = await templateService.renderDraft(req.body || {});
    res.json({ success: true, data });
  } catch (err) {
    handleError(err, res, next);
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
