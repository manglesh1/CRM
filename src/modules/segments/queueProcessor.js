const { getModels } = require("../../db/models");
const segmentService = require("./service");
const queueJobs = require("../queueJobs/service");

function plain(row) {
  return row?.get ? row.get({ plain: true }) : row;
}

async function refreshSegmentsForLocation(locationId) {
  const models = getModels();
  const segments = await models.CrmSegment.findAll({
    where: { locationId, segmentType: "dynamic", status: "active" },
    attributes: ["id"],
  });
  let refreshed = 0;
  let automationEventsQueued = 0;
  for (const segment of segments) {
    const result = await segmentService.refreshSegment(segment.id, { locationId });
    const automation = await queueSegmentJoinAutomations(result, "segment_refresh_location");
    automationEventsQueued += automation.queued || 0;
    refreshed += 1;
  }
  return { refreshedSegments: refreshed, automationEventsQueued };
}

async function queueSegmentJoinAutomations(segment, source) {
  const entered = Array.isArray(segment?.enteredContactIds) ? segment.enteredContactIds : [];
  if (!entered.length) return { queued: 0, jobIds: [] };
  return queueJobs.enqueueAutomationEvents(
    entered.map((contactId) => ({
      locationId: segment.locationId,
      eventType: "segment.joined",
      contactId,
      segmentId: segment.id,
      source,
      payload: { segmentName: segment.name },
    })),
    { locationId: segment.locationId, source }
  );
}

async function processSegmentQueueJob(job) {
  const data = plain(job);
  const payload = data.payload || {};

  if (data.jobType === queueJobs.JOB_TYPES.SEGMENTS_REFRESH_LOCATION) {
    return refreshSegmentsForLocation(data.locationId || payload.locationId);
  }

  if (data.jobType === queueJobs.JOB_TYPES.SEGMENT_REFRESH) {
    if (!payload.segmentId) throw new Error("segments.refresh_one requires payload.segmentId");
    const refreshed = await segmentService.refreshSegment(payload.segmentId, {
      locationId: data.locationId || payload.locationId,
    });
    const automation = await queueSegmentJoinAutomations(refreshed, payload.source || "segment_refresh");
    return {
      segmentId: payload.segmentId,
      memberCount: refreshed.memberCount || 0,
      automationEventsQueued: automation.queued || 0,
    };
  }

  throw new Error(`Unsupported segments queue job type: ${data.jobType}`);
}

module.exports = { processSegmentQueueJob };
