const express = require("express");
const auth = require("../../shared/auth");
const service = require("./service");
const record = require("./recordService");
const auditService = require("../audit/service");
const automationService = require("../automation/service");

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
    req.log?.warn?.({ err, audit: input }, "contacts audit log write skipped");
  }
}

async function safeAutomation(req, event = {}) {
  try {
    if (!event.eventType) return null;
    return await automationService.triggerWorkflowsForEvent({
      ...event,
      locationId: event.locationId || req.body?.locationId || req.query?.locationId,
      source: event.source || "contacts",
    });
  } catch (err) {
    req.log?.warn?.({ err, automationEvent: event }, "contacts automation trigger skipped");
    return null;
  }
}

async function triggerContactAutomationEvents(req, events = []) {
  const results = [];
  for (const event of events.filter(Boolean)) {
    results.push(await safeAutomation(req, event));
  }
  return results.filter(Boolean);
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

router.post("/tags", async (req, res, next) => {
  try {
    const data = await service.createContactTag({ ...req.body, locationId: req.body.locationId || req.query.locationId });
    await safeAudit(req, {
      action: "tag_created",
      entityType: "crm_contact_tag",
      entityId: data.normalizedName || data.name,
      entityName: data.name,
      metadata: { description: data.description || null, color: data.color || null },
    });
    res.status(201).json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.patch("/tags/:tagName", async (req, res, next) => {
  try {
    const data = await service.updateContactTag(req.params.tagName, { ...req.body, locationId: req.body.locationId || req.query.locationId });
    await safeAudit(req, {
      action: "tag_updated",
      entityType: "crm_contact_tag",
      entityId: data.tag?.normalizedName || req.params.tagName,
      entityName: data.tag?.name || req.params.tagName,
      metadata: { previousName: req.params.tagName, affectedContacts: data.affected || 0, refreshedSegments: data.refreshedSegments || 0 },
    });
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.delete("/tags/:tagName", async (req, res, next) => {
  try {
    const data = await service.deleteContactTag(req.params.tagName, { ...req.query, locationId: req.query.locationId || req.body?.locationId });
    await safeAudit(req, {
      action: "tag_deleted",
      entityType: "crm_contact_tag",
      entityId: req.params.tagName,
      entityName: data.name || req.params.tagName,
      metadata: { affectedContacts: data.affected || 0, refreshedSegments: data.refreshedSegments || 0 },
    });
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

router.get("/audit-logs", async (req, res, next) => {
  try {
    const entityTypes = req.query.entityTypes || "crm_contact,crm_contact_tag,crm_segment,crm_import_job";
    const data = await auditService.listAuditLogs({ ...req.query, entityTypes });
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const data = await service.upsertContact({ ...req.body, locationId: req.body.locationId || req.query.locationId });
    await safeAudit(req, {
      action: data.created ? "contact_created" : "contact_upserted",
      entityType: "crm_contact",
      entityId: data.contact?.id,
      entityName: data.contact?.fullName || data.contact?.email || data.contact?.phone,
      metadata: { sourceType: data.contact?.sourceType, tags: data.contact?.tags || [] },
    });
    const automation = await triggerContactAutomationEvents(req, [
      {
        eventType: data.created ? "customer.created" : "contact.changed",
        contactId: data.contact?.id,
        payload: { sourceType: data.contact?.sourceType },
      },
      ...(data.tagsAdded || []).map((tag) => ({
        eventType: "contact.tag_added",
        contactId: data.contact?.id,
        tag,
        payload: { sourceType: data.contact?.sourceType },
      })),
    ]);
    data.automation = automation;
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
    const action = String(req.body?.action || "bulk_update");
    await safeAudit(req, {
      action: `contacts_${action}`,
      entityType: action === "add_to_segment" ? "crm_segment" : "crm_contact",
      entityId: req.body?.targetSegmentId || req.body?.segmentId || null,
      entityName: action.replace(/_/g, " "),
      metadata: {
        affected: data.affected || 0,
        tags: req.body?.tags || [],
        selectedIds: Array.isArray(req.body?.ids) ? req.body.ids.length : 0,
        allowAll: Boolean(req.body?.allowAll),
        refreshedSegments: data.refreshedSegments || 0,
      },
    });
    if (action === "add_tags") {
      data.automation = await triggerContactAutomationEvents(req, (data.tagsAdded || []).map((item) => ({
        eventType: "contact.tag_added",
        contactId: item.contactId,
        tag: item.tag,
        payload: { bulkAction: action },
      })));
    } else if (action === "add_to_segment") {
      data.automation = await triggerContactAutomationEvents(req, (data.memberContactIds || []).map((contactId) => ({
        eventType: "segment.joined",
        contactId,
        segmentId: data.segmentId,
        payload: { bulkAction: action },
      })));
    }
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.post("/import", async (req, res, next) => {
  try {
    const data = await service.importContacts({ ...req.body, locationId: req.body.locationId || req.query.locationId });
    await safeAudit(req, {
      action: "contacts_imported",
      entityType: "crm_import_job",
      entityId: data.job?.id,
      entityName: data.job?.fileName || req.body?.fileName || "CSV import",
      metadata: {
        sourceType: data.job?.sourceType || req.body?.sourceType,
        totalRows: data.job?.totalRows || 0,
        createdCount: data.job?.createdCount || 0,
        updatedCount: data.job?.updatedCount || 0,
        skippedCount: data.job?.skippedCount || 0,
        errorCount: data.job?.errorCount || 0,
      },
    });
    data.automation = await triggerContactAutomationEvents(req, data.automationEvents || []);
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
    await safeAudit(req, {
      action: "contacts_synced",
      entityType: "crm_import_job",
      entityId: data.job?.id,
      entityName: data.job?.fileName || "Movira customer sync",
      metadata: {
        totalRows: data.job?.totalRows || 0,
        createdCount: data.job?.createdCount || 0,
        updatedCount: data.job?.updatedCount || 0,
        skippedCount: data.job?.skippedCount || 0,
        errorCount: data.job?.errorCount || 0,
        refreshedSegments: data.refreshedSegments || 0,
      },
    });
    data.automation = await triggerContactAutomationEvents(req, data.automationEvents || []);
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
    await safeAudit(req, {
      action: "contact_updated",
      entityType: "crm_contact",
      entityId: data.id,
      entityName: data.fullName || data.email || data.phone,
      metadata: { fields: Object.keys(req.body || {}).filter((key) => key !== "locationId") },
    });
    data.automation = await triggerContactAutomationEvents(req, [
      {
        eventType: "contact.changed",
        contactId: data.id,
        payload: { fields: Object.keys(req.body || {}).filter((key) => key !== "locationId") },
      },
      ...(data.tagsAdded || []).map((tag) => ({
        eventType: "contact.tag_added",
        contactId: data.id,
        tag,
        payload: { source: "contact_update" },
      })),
      Object.prototype.hasOwnProperty.call(req.body || {}, "doNotContact") && {
        eventType: "contact.dnd",
        contactId: data.id,
        payload: { doNotContact: Boolean(data.doNotContact) },
      },
    ]);
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return sendError(res, err);
    return next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const data = await service.deleteContact(req.params.id, req.query || {});
    await safeAudit(req, {
      action: "contact_deleted",
      entityType: "crm_contact",
      entityId: data.id,
      entityName: data.fullName || data.email || data.phone,
      metadata: { sourceType: data.sourceType },
    });
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
    data.automation = await triggerContactAutomationEvents(req, [{
      eventType: "contact.note_added",
      contactId: req.params.id,
      payload: { noteId: data.id },
    }]);
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
