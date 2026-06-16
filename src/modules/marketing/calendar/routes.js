const express = require("express");
const auth = require("../../../shared/auth");
const authorizeLocation = require("../../../shared/authorizeLocation");
const service = require("./service");

const router = express.Router();
router.use(auth, authorizeLocation({
  action: (req) => `crm:marketing-calendar:${req.method === "GET" ? "read" : "write"}`,
  requireLocation: true,
}));

function locationFrom(req) {
  return req.query.locationId || req.body.locationId;
}

function userIdFrom(req) {
  return req.user?.user_id || req.user?.id || null;
}

function sendError(res, err) {
  return res.status(err.statusCode || 500).json({
    success: false,
    message: err.message,
    error: err.message,
    errors: err.errors || [],
  });
}

router.get("/", async (req, res, next) => {
  try {
    const result = await service.listPlans({
      ...req.query,
      locationId: locationFrom(req),
    });
    res.json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const result = await service.getPlan({
      id: req.params.id,
      locationId: locationFrom(req),
    });
    res.json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const result = await service.createPlan({
      body: req.body,
      locationId: locationFrom(req),
      userId: userIdFrom(req),
    });
    res.status(201).json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const result = await service.updatePlan({
      id: req.params.id,
      body: req.body,
      locationId: locationFrom(req),
    });
    res.json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const result = await service.deletePlan({
      id: req.params.id,
      locationId: locationFrom(req),
    });
    res.json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.get("/:id/preview", async (req, res, next) => {
  try {
    const result = await service.previewPlan({
      id: req.params.id,
      locationId: locationFrom(req),
    });
    res.json(result);
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

module.exports = router;
