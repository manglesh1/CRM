const express = require("express");
const auth = require("../../../shared/auth");
const service = require("./service");

const router = express.Router();
router.use(auth);

function sendError(res, err) {
  return res.status(err.statusCode).json({
    success: false,
    error: err.message,
    errors: err.errors || [],
  });
}

router.get("/", async (req, res, next) => {
  try {
    const data = await service.listTriggerLinks(req.query);
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const data = await service.getTriggerLink(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const data = await service.createTriggerLink({
      ...req.body,
      locationId: req.body.locationId || req.query.locationId,
    });
    res.status(201).json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const data = await service.updateTriggerLink(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    await service.deleteTriggerLink(req.params.id);
    res.json({ success: true });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

module.exports = router;
