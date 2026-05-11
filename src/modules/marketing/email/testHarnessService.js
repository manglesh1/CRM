const { Op } = require("sequelize");
const config = require("../../../config");
const { getModels } = require("../../../db/models");
const marketingMessageRepository = require("./messageRepository");
const trackingService = require("../tracking/service");

const HARNESS_PREFIX = "[Local E2E]";
const DEFAULT_RECIPIENTS = [
  { email: "ava.local@example.test", data: { firstName: "Ava", plan: "Founders" } },
  { email: "leo.local@example.test", data: { firstName: "Leo", plan: "Growth" } },
  { email: "mia.local@example.test", data: { firstName: "Mia", plan: "Premium" } },
];

function requireLocation(locationId) {
  if (!locationId) {
    const err = new Error("locationId is required");
    err.statusCode = 400;
    throw err;
  }
  return Number(locationId);
}

function notFound(label) {
  const err = new Error(`${label} not found`);
  err.statusCode = 404;
  return err;
}

function validate(rules) {
  const errors = rules.filter(Boolean);
  if (errors.length) {
    const err = new Error(errors[0].message || "Validation failed");
    err.statusCode = 400;
    err.errors = errors;
    throw err;
  }
}

function publicBaseUrl() {
  return config.urls.trackingBaseUrl || config.urls.publicBaseUrl || `http://localhost:${config.port || 4100}`;
}

function serializeCampaign(row) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    campaignType: row.campaignType,
    templateId: row.templateId,
    totalRecipients: row.totalRecipients,
    totalDelivered: row.totalDelivered,
    totalOpened: row.totalOpened,
    totalClicked: row.totalClicked,
    totalBounced: row.totalBounced,
    totalUnsubscribed: row.totalUnsubscribed,
    totalComplained: row.totalComplained,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function serializeMessage(row) {
  const base = publicBaseUrl();
  return {
    id: row.id,
    campaignId: row.campaignId,
    templateId: row.templateId,
    recipient: row.recipient,
    subject: row.subject,
    status: row.status,
    provider: row.provider,
    providerMessageId: row.providerMessageId,
    metadata: row.metadata || {},
    queuedAt: row.queuedAt,
    sentAt: row.sentAt,
    deliveredAt: row.deliveredAt,
    openedAt: row.openedAt,
    clickedAt: row.clickedAt,
    bouncedAt: row.bouncedAt,
    complainedAt: row.complainedAt,
    unsubscribedAt: row.unsubscribedAt,
    links: {
      open: `${base}/m/open/${row.id}.gif`,
      click: `${base}/m/click/${row.id}?u=${encodeURIComponent("https://example.test/local-click")}`,
      unsubscribe: `${base}/m/unsubscribe/${row.id}`,
      view: `${base}/m/view/${row.id}`,
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function getHarnessStatus({ locationId, limit = 5 } = {}) {
  const loc = requireLocation(locationId);
  const { CrmMarketingCampaign, CrmMarketingMessage } = getModels();
  const campaigns = await CrmMarketingCampaign.findAll({
    where: {
      locationId: loc,
      name: { [Op.iLike]: `${HARNESS_PREFIX}%` },
    },
    order: [["createdAt", "DESC"]],
    limit: Math.min(20, Math.max(1, Number(limit) || 5)),
  });
  const campaignIds = campaigns.map((campaign) => campaign.id);
  const messages = campaignIds.length
    ? await CrmMarketingMessage.findAll({
        where: { campaignId: { [Op.in]: campaignIds } },
        order: [["createdAt", "DESC"]],
        limit: 100,
      })
    : [];

  return {
    mode: "local",
    usesAws: false,
    note: "Local harness writes CRM rows and delivery events directly. It does not call SES or SQS.",
    campaigns: campaigns.map(serializeCampaign),
    messages: messages.map(serializeMessage),
  };
}

async function seedHarnessScenario({ locationId, recipientCount = 3, subject, name } = {}) {
  const loc = requireLocation(locationId);
  const { CrmMarketingCampaign, CrmMarketingTemplate } = getModels();
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const count = Math.min(20, Math.max(1, Number(recipientCount) || DEFAULT_RECIPIENTS.length));
  const recipients = Array.from({ length: count }, (_, index) => {
    const source = DEFAULT_RECIPIENTS[index % DEFAULT_RECIPIENTS.length];
    const suffix = index + 1;
    return {
      email: source.email.replace("@", `+${stamp}-${suffix}@`),
      data: {
        ...source.data,
        firstName: `${source.data.firstName} ${suffix}`,
        businessName: "Movira Local Test",
      },
    };
  });

  const template = await CrmMarketingTemplate.create({
    locationId: loc,
    name: `${HARNESS_PREFIX} Template ${stamp}`,
    editorType: "code",
    useCase: "marketing",
    htmlBody: localTemplateHtml(),
    plainText: "Hi {{firstName}}, this is a local E2E marketing test. Unsubscribe: https://example.test/unsubscribe",
  });

  const campaign = await CrmMarketingCampaign.create({
    locationId: loc,
    name: name || `${HARNESS_PREFIX} Campaign ${stamp}`,
    channel: "email",
    campaignType: "email_campaign",
    templateId: template.id,
    status: "sending",
    executionDate: now,
  });

  const queued = [];
  for (const recipient of recipients) {
    const message = await marketingMessageRepository.createMessage({
      locationId: loc,
      campaignId: campaign.id,
      templateId: template.id,
      channel: "email",
      recipient: recipient.email,
      subject: subject || "Local E2E campaign test",
      payload: {
        subject: subject || "Local E2E campaign test",
        data: recipient.data,
        from: "local-test@movira.test",
      },
      metadata: {
        queueType: "bulk",
        source: "local_test_harness",
      },
    });
    const updated = await marketingMessageRepository.markQueued(message, {
      skipped: false,
      fake: true,
      sqsMessageId: `local-sqs-${message.id}`,
    });
    await marketingMessageRepository.createDeliveryEvent({
      messageId: updated.id,
      campaignId: campaign.id,
      eventType: "queued",
      payload: {
        source: "local_test_harness",
        fakeSqs: true,
        queueType: "bulk",
      },
    });
    queued.push(updated);
  }

  await campaign.increment("totalRecipients", { by: queued.length });
  await campaign.reload();

  return {
    campaign: serializeCampaign(campaign),
    template: {
      id: template.id,
      name: template.name,
      editorType: template.editorType,
      useCase: template.useCase,
    },
    queued: queued.map(serializeMessage),
    totalQueued: queued.length,
  };
}

async function processHarnessCampaign(campaignId, { limit = 50, outcome = "sent" } = {}) {
  const { CrmMarketingCampaign, CrmMarketingMessage } = getModels();
  const campaign = await CrmMarketingCampaign.findByPk(campaignId);
  if (!campaign) throw notFound("Campaign");
  const messages = await CrmMarketingMessage.findAll({
    where: {
      campaignId,
      status: { [Op.in]: ["pending", "queued", "failed"] },
    },
    order: [["createdAt", "ASC"]],
    limit: Math.min(100, Math.max(1, Number(limit) || 50)),
  });

  const processed = [];
  for (const message of messages) {
    processed.push(await processHarnessMessage(message.id, { outcome }));
  }

  return {
    campaign: serializeCampaign(await campaign.reload()),
    processed,
    totalProcessed: processed.length,
  };
}

async function processHarnessMessage(messageId, { outcome = "sent" } = {}) {
  const message = await marketingMessageRepository.findMessageById(messageId);
  if (!message) throw notFound("Marketing message");
  validate([
    !["pending", "queued", "failed"].includes(message.status) && {
      field: "status",
      message: "Only pending, queued, or failed messages can be locally processed.",
    },
  ]);

  await marketingMessageRepository.markSending(message);
  await marketingMessageRepository.createDeliveryEvent({
    messageId: message.id,
    campaignId: message.campaignId,
    eventType: "sending",
    payload: { source: "local_test_harness_worker" },
  });

  if (outcome === "failed") {
    await marketingMessageRepository.markFailed(message, new Error("Local harness forced failure"));
    await marketingMessageRepository.createDeliveryEvent({
      messageId: message.id,
      campaignId: message.campaignId,
      eventType: "failed",
      payload: { source: "local_test_harness_worker", error: "Local harness forced failure" },
    });
    await message.reload();
    return serializeMessage(message);
  }

  await marketingMessageRepository.markSent(message, {
    provider: "local-test",
    providerMessageId: `local-ses-${message.id}`,
  });
  await marketingMessageRepository.createDeliveryEvent({
    messageId: message.id,
    campaignId: message.campaignId,
    provider: "local-test",
    providerMessageId: `local-ses-${message.id}`,
    eventType: "sent",
    payload: { source: "local_test_harness_worker", fakeSes: true },
  });
  await message.reload();
  return serializeMessage(message);
}

async function simulateHarnessEvent(messageId, { eventType, destinationUrl } = {}) {
  const allowed = ["delivered", "open", "click", "bounce", "complaint", "unsubscribe", "failed"];
  validate([
    !allowed.includes(eventType) && {
      field: "eventType",
      message: `eventType must be one of: ${allowed.join(", ")}.`,
    },
  ]);

  const normalized = eventType === "delivered" ? "delivered" : eventType;
  const result = await trackingService.recordMarketingEvent(messageId, normalized, {
    source: "local_test_harness_event",
    provider: "local-test",
    destinationUrl: destinationUrl || "https://example.test/local-click",
    bounceType: eventType === "bounce" ? "Permanent" : undefined,
  });
  const message = await marketingMessageRepository.findMessageById(messageId);
  return {
    result,
    message: serializeMessage(message),
  };
}

function localTemplateHtml() {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f3f6f8;font-family:Arial,sans-serif;color:#172033;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6f8;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px;">
                <h1 style="margin:0 0 12px;font-size:26px;line-height:1.25;">Local E2E campaign</h1>
                <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">Hi {{firstName}}, this email was generated by the local harness so you can test queue, worker, tracking, bounce, complaint, and unsubscribe flows without AWS.</p>
                <p style="margin:0 0 22px;">
                  <a href="https://example.test/local-click" style="display:inline-block;background:#2169f3;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:bold;">Track local click</a>
                </p>
                <p style="margin:0;font-size:12px;line-height:1.5;color:#64748b;">Movira Local Test<br><a href="https://example.test/unsubscribe" style="color:#2169f3;">Unsubscribe</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

module.exports = {
  getHarnessStatus,
  seedHarnessScenario,
  processHarnessCampaign,
  processHarnessMessage,
  simulateHarnessEvent,
};
