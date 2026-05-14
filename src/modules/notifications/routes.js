const express = require("express");
const service = require("./service");

const router = express.Router();

function handleError(err, res, next) {
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code || undefined,
    });
  }
  return next(err);
}

router.post("/events", async (req, res, next) => {
  try {
    const result = await service.ingestEvent(req.body);
    res.status(result.duplicate ? 200 : 202).json({
      success: true,
      duplicate: result.duplicate,
      data: result,
    });
  } catch (err) {
    handleError(err, res, next);
  }
});

router.get("/events", (_req, res) => {
  res.json({ success: true, data: service.listEvents() });
});

router.get("/bindings", async (req, res, next) => {
  try {
    const data = await service.listBindings(req.query);
    res.json({ success: true, data });
  } catch (err) {
    handleError(err, res, next);
  }
});

router.get("/bindings/:id", async (req, res, next) => {
  try {
    const data = await service.getBinding(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    handleError(err, res, next);
  }
});

router.post("/bindings", async (req, res, next) => {
  try {
    const data = await service.createBinding(req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    handleError(err, res, next);
  }
});

router.patch("/bindings/:id", async (req, res, next) => {
  try {
    const data = await service.updateBinding(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) {
    handleError(err, res, next);
  }
});

router.delete("/bindings/:id", async (req, res, next) => {
  try {
    const data = await service.deleteBinding(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    handleError(err, res, next);
  }
});

module.exports = router;
