const express = require("express");
const auth = require("../../shared/auth");
const authorizeLocation = require("../../shared/authorizeLocation");
const service = require("./service");

const router = express.Router();
router.use(auth, authorizeLocation({
  action: (req) => {
    if (req.method === "DELETE") return "crm:contact-fields:delete";
    return `crm:contact-fields:${req.method === "GET" ? "read" : "write"}`;
  },
  requireLocation: true,
}));

function sendError(res, err) {
  return res.status(err.statusCode || 500).json({
    success: false,
    error: err.message || "Internal server error",
    errors: err.errors || [],
  });
}

router.get("/", async (req, res, next) => {
  try {
    const data = await service.listFields(req.query || {});
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.get("/catalog", async (req, res, next) => {
  try {
    const data = await service.getCatalog(req.query || {});
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const data = await service.createField({ ...req.body, locationId: req.body.locationId || req.query.locationId });
    res.status(201).json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.post("/reorder", async (req, res, next) => {
  try {
    const data = await service.reorderFields({ ...req.body, locationId: req.body.locationId || req.query.locationId });
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const data = await service.updateField(req.params.id, { ...req.body, locationId: req.body.locationId || req.query.locationId });
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const data = await service.deleteField(req.params.id, req.query || {});
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

module.exports = router;
