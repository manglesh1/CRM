const express = require("express");
const auth = require("../../shared/auth");
const service = require("./service");
const record = require("./recordService");

const router = express.Router();
router.use(auth);

function sendError(res, err) {
  return res.status(err.statusCode || 500).json({
    success: false,
    error: err.message || "Internal server error",
    errors: err.errors || [],
  });
}

router.get("/", async (req, res, next) => {
  try {
    const data = await service.listContacts(req.query || {});
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.get("/stats", async (req, res, next) => {
  try {
    const data = await service.getContactStats(req.query || {});
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.get("/tags", async (req, res, next) => {
  try {
    const data = await service.listContactTags(req.query || {});
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.post("/export", async (req, res, next) => {
  try {
    const data = await service.exportContacts({ ...req.body, locationId: req.body.locationId || req.query.locationId });
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.get("/duplicates", async (req, res, next) => {
  try {
    const data = await record.findDuplicates(req.query || {});
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.post("/merge", async (req, res, next) => {
  try {
    const data = await record.mergeContacts({ ...req.body, locationId: req.body.locationId || req.query.locationId });
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.get("/import-jobs", async (req, res, next) => {
  try {
    const data = await service.listImportJobs(req.query || {});
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const data = await service.upsertContact({ ...req.body, locationId: req.body.locationId || req.query.locationId });
    res.status(data.created ? 201 : 200).json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.post("/search", async (req, res, next) => {
  try {
    const data = await service.searchContacts({ ...req.body, locationId: req.body.locationId || req.query.locationId });
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.post("/bulk", async (req, res, next) => {
  try {
    const data = await service.bulkUpdateContacts({ ...req.body, locationId: req.body.locationId || req.query.locationId });
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.post("/import", async (req, res, next) => {
  try {
    const data = await service.importContacts({ ...req.body, locationId: req.body.locationId || req.query.locationId });
    res.status(201).json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.post("/sync/movira", async (req, res, next) => {
  try {
    const data = await service.syncMoviraCustomers({
      ...req.body,
      locationId: req.body.locationId || req.query.locationId,
      authorization: req.headers.authorization,
    });
    res.status(201).json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const data = await service.getContact(req.params.id, req.query || {});
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const data = await service.updateContact(req.params.id, { ...req.body, locationId: req.body.locationId || req.query.locationId });
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const data = await service.deleteContact(req.params.id, req.query || {});
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.get("/:id/activity", async (req, res, next) => {
  try {
    const data = await record.getActivity(req.params.id, req.query || {});
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.get("/:id/notes", async (req, res, next) => {
  try {
    const data = await record.listNotes(req.params.id, req.query || {});
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.post("/:id/notes", async (req, res, next) => {
  try {
    const data = await record.createNote(req.params.id, { ...req.body, locationId: req.body.locationId || req.query.locationId });
    res.status(201).json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.delete("/:id/notes/:noteId", async (req, res, next) => {
  try {
    const data = await record.deleteNote(req.params.noteId, req.query || {});
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

module.exports = router;
