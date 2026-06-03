const { Op } = require("sequelize");
const { getModels } = require("../../db/models");

const JOB_TYPES = {
  AUTOMATION_EVENT: "automation.event",
  AUTOMATION_ENROLLMENT: "automation.enrollment",
  CONTACTS_BULK_ACTION: "contacts.bulk_action",
  CONTACTS_EXPORT: "contacts.export",
  CONTACTS_FILTER_COUNT: "contacts.filter_count",
  CONTACTS_IMPORT: "contacts.import",
  MARKETING_CAMPAIGN_AUDIENCE: "marketing.campaign_audience",
  SEGMENTS_REFRESH_LOCATION: "segments.refresh_location",
  SEGMENT_REFRESH: "segments.refresh_one",
};

const QUEUES = {
  AUTOMATION: "automation",
  CONTACTS: "contacts",
  MARKETING: "marketing",
  SEGMENTS: "segments",
};

const JOB_QUEUE = {
  [JOB_TYPES.AUTOMATION_EVENT]: QUEUES.AUTOMATION,
  [JOB_TYPES.AUTOMATION_ENROLLMENT]: QUEUES.AUTOMATION,
  [JOB_TYPES.CONTACTS_BULK_ACTION]: QUEUES.CONTACTS,
  [JOB_TYPES.CONTACTS_EXPORT]: QUEUES.CONTACTS,
  [JOB_TYPES.CONTACTS_FILTER_COUNT]: QUEUES.CONTACTS,
  [JOB_TYPES.CONTACTS_IMPORT]: QUEUES.CONTACTS,
  [JOB_TYPES.MARKETING_CAMPAIGN_AUDIENCE]: QUEUES.MARKETING,
  [JOB_TYPES.SEGMENTS_REFRESH_LOCATION]: QUEUES.SEGMENTS,
  [JOB_TYPES.SEGMENT_REFRESH]: QUEUES.SEGMENTS,
};

function plain(row) {
  return row?.get ? row.get({ plain: true }) : row;
}

function queueForJobType(jobType) {
  return JOB_QUEUE[jobType] || "general";
}

async function enqueueJob({ jobType, locationId = null, payload = {}, priority = 50, runAt = null, maxAttempts = 3, queueName = null }) {
  const models = getModels();
  const job = await models.CrmQueueJob.create({
    queueName: queueName || queueForJobType(jobType),
    jobType,
    locationId,
    payload,
    priority,
    runAt: runAt || new Date(),
    maxAttempts,
  });
  return plain(job);
}

async function enqueueAutomationEvents(events = [], defaults = {}) {
  const jobs = [];
  for (const event of events.filter(Boolean)) {
    if (!event.eventType && !event.triggerKey) continue;
    jobs.push(await enqueueJob({
      jobType: JOB_TYPES.AUTOMATION_EVENT,
      locationId: event.locationId || defaults.locationId || null,
      priority: defaults.priority || 40,
      payload: {
        event: {
          ...event,
          locationId: event.locationId || defaults.locationId,
          source: event.source || defaults.source || "crm",
        },
      },
    }));
  }
  return { queued: jobs.length, jobIds: jobs.map((job) => job.id) };
}

async function enqueueSegmentRefreshForLocation(locationId, payload = {}) {
  if (!locationId) return { queued: 0, jobIds: [] };
  const job = await enqueueJob({
    jobType: JOB_TYPES.SEGMENTS_REFRESH_LOCATION,
    locationId,
    priority: 60,
    payload,
  });
  return { queued: 1, jobIds: [job.id] };
}

async function enqueueSegmentRefresh(segmentId, locationId, payload = {}) {
  if (!segmentId || !locationId) return { queued: 0, jobIds: [] };
  const job = await enqueueJob({
    jobType: JOB_TYPES.SEGMENT_REFRESH,
    locationId,
    priority: 55,
    payload: { ...payload, segmentId },
  });
  return { queued: 1, jobIds: [job.id] };
}

async function claimPendingJobs({ workerId, queueName, limit = 10 } = {}) {
  const models = getModels();
  const rows = await models.CrmQueueJob.findAll({
    where: {
      queueName,
      status: "pending",
      runAt: { [Op.lte]: new Date() },
    },
    order: [["priority", "ASC"], ["createdAt", "ASC"]],
    limit,
  });

  const claimed = [];
  for (const row of rows) {
    const [updated] = await models.CrmQueueJob.update(
      {
        status: "processing",
        lockedAt: new Date(),
        lockedBy: workerId,
        startedAt: row.startedAt || new Date(),
        attempts: Number(row.attempts || 0) + 1,
      },
      { where: { id: row.id, status: "pending" } }
    );
    if (!updated) continue;
    const fresh = await models.CrmQueueJob.findByPk(row.id);
    if (fresh) claimed.push(fresh);
  }
  return claimed;
}

async function completeJob(job, result = {}) {
  return job.update({
    status: "completed",
    result,
    completedAt: new Date(),
    lockedAt: null,
    lockedBy: null,
    lastError: null,
  });
}

async function failJob(job, err) {
  const attempts = Number(job.attempts || 0);
  const maxAttempts = Number(job.maxAttempts || 3);
  const retry = attempts < maxAttempts;
  return job.update({
    status: retry ? "pending" : "failed",
    runAt: retry ? new Date(Date.now() + Math.min(60000, 1000 * 2 ** attempts)) : job.runAt,
    completedAt: retry ? null : new Date(),
    lockedAt: null,
    lockedBy: null,
    lastError: err?.message || String(err || "Unknown queue job error"),
  });
}

module.exports = {
  JOB_TYPES,
  QUEUES,
  claimPendingJobs,
  completeJob,
  enqueueAutomationEvents,
  enqueueJob,
  enqueueSegmentRefresh,
  enqueueSegmentRefreshForLocation,
  failJob,
};
