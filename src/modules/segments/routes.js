const express = require("express");
const auth = require("../../shared/auth");
const service = require("./service");
const auditService = require("../audit/service");
const queueJobs = require("../queueJobs/service");

const router = express.Router();
router.use(auth);

function sendError(res, err) {
  return res.status(err.statusCode || 500).json({
    success: false,
    error: err.message || "Internal server error",
    errors: err.errors || [],
  });
}

async function safeAudit(req, input = {}) {
  try {
    await auditService.recordAuditLog({
      ...auditService.requestContext(req),
      ...input,
      locationId: input.locationId || req.body?.locationId || req.query?.locationId,
    });
  } catch (err) {
    req.log?.warn?.({ err, audit: input }, "segments audit log write skipped");
  }
}

async function queueSegmentRefresh(req, segment, source) {
  try {
    return await queueJobs.enqueueSegmentRefresh(
      segment.id,
      segment.locationId || req.body?.locationId || req.query?.locationId,
      { source }
    );
  } catch (err) {
    req.log?.warn?.({ err, segmentId: segment?.id }, "segment refresh enqueue skipped");
    return { queued: 0, jobIds: [] };
  }
}

router.get("/", async (req, res, next) => {
  try {
    const data = await service.listSegments(req.query || {});
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.get("/stats", async (req, res, next) => {
  try {
    const data = await service.getSegmentStats(req.query || {});
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.post("/preview", async (req, res, next) => {
  try {
    const data = await service.previewSegment({ ...req.body, locationId: req.body.locationId || req.query.locationId });
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const data = await service.createSegment({ ...req.body, locationId: req.body.locationId || req.query.locationId });
    await safeAudit(req, {
      action: "segment_created",
      entityType: "crm_segment",
      entityId: data.id,
      entityName: data.name,
      metadata: { segmentType: data.segmentType, memberCount: data.memberCount || 0 },
    });
    data.segmentRefresh = await queueSegmentRefresh(req, data, "segment_created");
    res.status(202).json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const data = await service.getSegment(req.params.id, req.query || {});
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const data = await service.updateSegment(req.params.id, { ...req.body, locationId: req.body.locationId || req.query.locationId });
    await safeAudit(req, {
      action: "segment_updated",
      entityType: "crm_segment",
      entityId: data.id,
      entityName: data.name,
      metadata: { fields: Object.keys(req.body || {}).filter((key) => key !== "locationId"), memberCount: data.memberCount || 0 },
    });
    if (data.refreshQueued) {
      data.segmentRefresh = await queueSegmentRefresh(req, data, "segment_updated");
    }
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const data = await service.deleteSegment(req.params.id, req.query || {});
    await safeAudit(req, {
      action: "segment_deleted",
      entityType: "crm_segment",
      entityId: data.id,
      entityName: data.name,
      metadata: { memberCount: data.memberCount || 0, segmentType: data.segmentType },
    });
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.post("/:id/refresh", async (req, res, next) => {
  try {
    const data = await service.getSegment(req.params.id, { ...req.query, ...req.body });
    await safeAudit(req, {
      action: "segment_refresh_queued",
      entityType: "crm_segment",
      entityId: data.id,
      entityName: data.name,
      metadata: { memberCount: data.memberCount || 0, lastCalculatedAt: data.lastCalculatedAt },
    });
    data.segmentRefresh = await queueSegmentRefresh(req, data, "segment_manual_refresh");
    res.status(202).json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.get("/:id/contacts", async (req, res, next) => {
  try {
    const data = await service.listSegmentContacts(req.params.id, req.query || {});
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

module.exports = router;
