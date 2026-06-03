const contactService = require("./service");
const queueJobs = require("../queueJobs/service");

function plain(row) {
  return row?.get ? row.get({ plain: true }) : row;
}

async function processContactQueueJob(job) {
  const data = plain(job);
  const payload = data.payload || {};
  if (data.jobType === queueJobs.JOB_TYPES.CONTACTS_BULK_ACTION) {
    if (!payload.bulkActionJobId) throw new Error("contacts.bulk_action requires payload.bulkActionJobId");
    return contactService.processContactBulkActionJob(payload.bulkActionJobId);
  }

  if (data.jobType === queueJobs.JOB_TYPES.CONTACTS_EXPORT) {
    if (!payload.exportJobId) throw new Error("contacts.export requires payload.exportJobId");
    return contactService.processContactExportJob(payload.exportJobId);
  }

  if (data.jobType === queueJobs.JOB_TYPES.CONTACTS_FILTER_COUNT) {
    if (!payload.filterCountId) throw new Error("contacts.filter_count requires payload.filterCountId");
    return contactService.processContactFilterCountJob(payload.filterCountId);
  }

  if (data.jobType !== queueJobs.JOB_TYPES.CONTACTS_IMPORT) {
    throw new Error(`Unsupported contacts queue job type: ${data.jobType}`);
  }
  if (!payload.importJobId) throw new Error("contacts.import requires payload.importJobId");

  const result = await contactService.processContactImportJob(payload.importJobId);
  const locationId = result.job?.locationId || data.locationId;
  await queueJobs.enqueueAutomationEvents(result.automationEvents || [], {
    locationId,
    source: "contact_import",
  });
  await queueJobs.enqueueSegmentRefreshForLocation(locationId, {
    source: "contact_import",
    importJobId: payload.importJobId,
  });

  return {
    importJobId: payload.importJobId,
    createdCount: result.job?.createdCount || 0,
    updatedCount: result.job?.updatedCount || 0,
    skippedCount: result.job?.skippedCount || 0,
    errorCount: result.job?.errorCount || 0,
  };
}

module.exports = { processContactQueueJob };
