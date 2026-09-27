const { Op } = require("sequelize");
const { getModels } = require("../../../db/models");
const queueJobs = require("../../queueJobs/service");
const suppressionService = require("./suppressionService");
const messageRepository = require("./messageRepository");
const { enqueueMarketingMessage } = require("../../messaging-core/aws/sqsClient");

const ACTIVE_STATUSES = ["active", "paused"];

function durationMs(amount, unit) {
  const value = Math.max(1, Number(amount) || 1);
  const multiplier = unit === "days" ? 86400000 : unit === "hours" ? 3600000 : 60000;
  return value * multiplier;
}

function serializeEnrollment(row) {
  const value = row?.get ? row.get({ plain: true }) : row;
  return value ? {
    id: value.id,
    campaignId: value.campaignId,
    recipient: value.recipient,
    status: value.status,
    currentStepIndex: value.currentStepIndex,
    totalSteps: value.stepsSnapshot?.length || 0,
    lastMessageId: value.lastMessageId,
    nextRunAt: value.nextRunAt,
    completedAt: value.completedAt,
    lastError: value.lastError,
  } : null;
}

async function enqueueStep(enrollment, runAt = new Date()) {
  const job = await queueJobs.enqueueJob({
    jobType: queueJobs.JOB_TYPES.MARKETING_DRIP_STEP,
    locationId: enrollment.locationId,
    priority: 42,
    runAt,
    payload: {
      dripEnrollmentId: enrollment.id,
      stepIndex: Number(enrollment.currentStepIndex || 0),
    },
  });
  await enrollment.update({ nextRunAt: runAt });
  return job;
}

async function enrollRecipient({ campaign, recipient, data = {}, steps, sendOptions = {} }) {
  const { CrmMarketingDripEnrollment } = getModels();
  const normalizedRecipient = String(recipient || "").trim().toLowerCase();
  const [enrollment, created] = await CrmMarketingDripEnrollment.findOrCreate({
    where: { campaignId: campaign.id, normalizedRecipient },
    defaults: {
      locationId: campaign.locationId,
      campaignId: campaign.id,
      recipient: normalizedRecipient,
      normalizedRecipient,
      status: "active",
      currentStepIndex: 0,
      stepsSnapshot: steps,
      sendOptions,
      data,
      startedAt: new Date(),
    },
  });
  if (!created) return { created: false, enrollment: serializeEnrollment(enrollment) };
  const firstRun = campaign.scheduledAt && new Date(campaign.scheduledAt) > new Date()
    ? new Date(campaign.scheduledAt)
    : new Date();
  const job = await enqueueStep(enrollment, firstRun);
  return { created: true, enrollment: serializeEnrollment(enrollment), job };
}

async function completeEnrollment(enrollment, status = "completed", error = null) {
  await enrollment.update({
    status,
    completedAt: new Date(),
    nextRunAt: null,
    conditionDeadline: null,
    lastError: error,
  });
  await finishCampaignIfDone(enrollment.campaignId);
  return serializeEnrollment(enrollment);
}

async function finishCampaignIfDone(campaignId) {
  const { CrmMarketingCampaign, CrmMarketingDripEnrollment } = getModels();
  const remaining = await CrmMarketingDripEnrollment.count({
    where: { campaignId, status: { [Op.in]: ACTIVE_STATUSES } },
  });
  if (remaining) return;
  const campaign = await CrmMarketingCampaign.findByPk(campaignId);
  if (campaign?.status === "sending") await campaign.update({ status: "sent" });
}

async function processEmailStep(enrollment, campaign, step, stepIndex) {
  const { CrmMarketingMessage } = getModels();
  const suppression = await suppressionService.isSuppressed(enrollment.locationId, enrollment.recipient);
  if (suppression) return completeEnrollment(enrollment, "suppressed", suppression.reason || "Recipient suppressed");

  let message = await CrmMarketingMessage.findOne({
    where: {
      campaignId: campaign.id,
      recipient: enrollment.normalizedRecipient,
      metadata: { [Op.contains]: { dripEnrollmentId: enrollment.id, dripStepIndex: stepIndex } },
    },
  });
  if (!message) {
    const options = enrollment.sendOptions || {};
    message = await messageRepository.createMessage({
      locationId: enrollment.locationId,
      campaignId: campaign.id,
      templateId: step.templateId,
      channel: "email",
      recipient: enrollment.recipient,
      subject: step.subject || options.subject || campaign.name,
      payload: { data: enrollment.data || {}, from: options.from || undefined, subject: step.subject || options.subject || undefined },
      metadata: {
        queueType: "journey",
        source: "campaign_drip",
        dripEnrollmentId: enrollment.id,
        dripStepIndex: stepIndex,
      },
    });
  }
  if (message.status === "pending") {
    const enqueue = await enqueueMarketingMessage({ messageId: message.id, campaignId: campaign.id, channel: "email", queueType: "journey" });
    message = await messageRepository.markQueued(message, enqueue);
    await messageRepository.createDeliveryEvent({
      messageId: message.id,
      campaignId: campaign.id,
      eventType: enqueue?.skipped ? "enqueue_skipped" : "queued",
      payload: { source: "campaign_drip", enqueue, stepIndex },
    });
  }
  await enrollment.update({ currentStepIndex: stepIndex + 1, lastMessageId: message.id, conditionDeadline: null, lastError: null });
  return advance(enrollment);
}

async function processConditionStep(enrollment, step, stepIndex) {
  const { CrmMarketingMessage } = getModels();
  const message = enrollment.lastMessageId ? await CrmMarketingMessage.findByPk(enrollment.lastMessageId) : null;
  const matched = step.event === "clicked" ? Boolean(message?.clickedAt) : Boolean(message?.openedAt || message?.clickedAt);
  if (matched) {
    await enrollment.update({ currentStepIndex: stepIndex + 1, conditionDeadline: null, lastError: null });
    return advance(enrollment);
  }
  const deadline = enrollment.conditionDeadline
    ? new Date(enrollment.conditionDeadline)
    : new Date(Date.now() + durationMs(step.timeoutAmount, step.timeoutUnit));
  if (!enrollment.conditionDeadline) await enrollment.update({ conditionDeadline: deadline });
  if (deadline > new Date()) {
    const nextCheck = new Date(Math.min(deadline.getTime(), Date.now() + 5 * 60000));
    const job = await enqueueStep(enrollment, nextCheck);
    return { enrollment: serializeEnrollment(enrollment), waitingFor: step.event, job };
  }
  if (step.onTimeout === "stop") return completeEnrollment(enrollment, "completed", `Stopped: ${step.event} condition timed out`);
  await enrollment.update({ currentStepIndex: stepIndex + 1, conditionDeadline: null });
  return advance(enrollment);
}

async function advance(enrollment) {
  if (Number(enrollment.currentStepIndex) >= (enrollment.stepsSnapshot || []).length) {
    return completeEnrollment(enrollment);
  }
  const job = await enqueueStep(enrollment, new Date());
  return { enrollment: serializeEnrollment(enrollment), job };
}

async function processDripStep(enrollmentId, expectedStepIndex, retryContext = {}) {
  const { CrmMarketingDripEnrollment, CrmMarketingCampaign } = getModels();
  const enrollment = await CrmMarketingDripEnrollment.findByPk(enrollmentId);
  if (!enrollment) return { skipped: "enrollment_not_found" };
  if (enrollment.status !== "active") return { skipped: `enrollment_${enrollment.status}` };
  if (Number(enrollment.currentStepIndex) !== Number(expectedStepIndex)) return { skipped: "stale_step_job" };
  const campaign = await CrmMarketingCampaign.findByPk(enrollment.campaignId);
  if (!campaign || campaign.status === "cancelled") return completeEnrollment(enrollment, "cancelled", "Campaign cancelled");
  if (campaign.status === "paused") {
    await enrollment.update({ status: "paused", nextRunAt: null });
    return { enrollment: serializeEnrollment(enrollment), paused: true };
  }
  const stepIndex = Number(enrollment.currentStepIndex);
  const step = (enrollment.stepsSnapshot || [])[stepIndex];
  if (!step) return completeEnrollment(enrollment);
  try {
    if (step.type === "email") return processEmailStep(enrollment, campaign, step, stepIndex);
    if (step.type === "condition") return processConditionStep(enrollment, step, stepIndex);
    if (step.type === "wait") {
      const runAt = new Date(Date.now() + durationMs(step.amount, step.unit));
      await enrollment.update({ currentStepIndex: stepIndex + 1, nextRunAt: runAt, conditionDeadline: null, lastError: null });
      if (Number(enrollment.currentStepIndex) >= (enrollment.stepsSnapshot || []).length) return completeEnrollment(enrollment);
      const job = await enqueueStep(enrollment, runAt);
      return { enrollment: serializeEnrollment(enrollment), waitingUntil: runAt, job };
    }
    return completeEnrollment(enrollment, "failed", `Unsupported drip step: ${step.type}`);
  } catch (err) {
    const lastError = err.message || String(err);
    const finalAttempt = Number(retryContext.attempt || 0) >= Number(retryContext.maxAttempts || 3);
    if (finalAttempt) await completeEnrollment(enrollment, "failed", lastError);
    else await enrollment.update({ lastError });
    throw err;
  }
}

async function wakeEnrollmentForMessage(message) {
  const enrollmentId = message?.metadata?.dripEnrollmentId;
  if (!enrollmentId) return { skipped: "not_a_drip_message" };
  const { CrmMarketingDripEnrollment } = getModels();
  const enrollment = await CrmMarketingDripEnrollment.findByPk(enrollmentId);
  if (!enrollment || enrollment.status !== "active") return { skipped: "enrollment_not_active" };
  const step = (enrollment.stepsSnapshot || [])[Number(enrollment.currentStepIndex || 0)];
  if (step?.type !== "condition") return { skipped: "not_waiting_for_condition" };
  const matched = step.event === "clicked" ? Boolean(message.clickedAt) : Boolean(message.openedAt || message.clickedAt);
  if (!matched) return { skipped: "condition_not_matched" };
  const job = await enqueueStep(enrollment, new Date());
  return { enrollment: serializeEnrollment(enrollment), job };
}

async function pauseCampaignEnrollments(campaignId) {
  const { CrmMarketingDripEnrollment } = getModels();
  return CrmMarketingDripEnrollment.update({ status: "paused", nextRunAt: null }, { where: { campaignId, status: "active" } });
}

async function resumeCampaignEnrollments(campaignId) {
  const { CrmMarketingDripEnrollment } = getModels();
  const rows = await CrmMarketingDripEnrollment.findAll({ where: { campaignId, status: "paused" } });
  for (const row of rows) {
    await row.update({ status: "active", lastError: null });
    await enqueueStep(row, new Date());
  }
  return rows.length;
}

async function cancelCampaignEnrollments(campaignId, reason) {
  const { CrmMarketingDripEnrollment } = getModels();
  const [count] = await CrmMarketingDripEnrollment.update({
    status: "cancelled",
    completedAt: new Date(),
    nextRunAt: null,
    lastError: reason || "Campaign cancelled",
  }, { where: { campaignId, status: { [Op.in]: ACTIVE_STATUSES } } });
  return count;
}

async function listCampaignEnrollments(campaignId, { locationId, status, page = 1, pageSize = 50 } = {}) {
  const { CrmMarketingCampaign, CrmMarketingDripEnrollment } = getModels();
  const loc = Number(locationId);
  if (!Number.isFinite(loc) || loc <= 0) {
    const err = new Error("A valid locationId is required");
    err.statusCode = 400;
    throw err;
  }
  const campaign = await CrmMarketingCampaign.findOne({ where: { id: campaignId, locationId: loc } });
  if (!campaign) {
    const err = new Error("Campaign not found");
    err.statusCode = 404;
    throw err;
  }
  const where = { campaignId };
  if (status) where.status = status;
  const limit = Math.min(100, Math.max(1, Number(pageSize) || 50));
  const offset = Math.max(0, (Number(page) - 1) * limit);
  const [{ rows, count }, grouped] = await Promise.all([
    CrmMarketingDripEnrollment.findAndCountAll({ where, order: [["updatedAt", "DESC"]], limit, offset }),
    CrmMarketingDripEnrollment.count({ where: { campaignId }, group: ["status"] }),
  ]);
  const summary = Object.fromEntries(grouped.map((item) => [item.status, Number(item.count || 0)]));
  return {
    campaignId,
    items: rows.map(serializeEnrollment),
    total: count,
    page: Number(page) || 1,
    pageSize: limit,
    summary,
  };
}

module.exports = {
  cancelCampaignEnrollments,
  enrollRecipient,
  finishCampaignIfDone,
  listCampaignEnrollments,
  pauseCampaignEnrollments,
  processDripStep,
  resumeCampaignEnrollments,
  serializeEnrollment,
  wakeEnrollmentForMessage,
  durationMs,
};
