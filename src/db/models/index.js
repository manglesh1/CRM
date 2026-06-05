const { getSequelize } = require("../sequelize");
const defineTransactionalMessage = require("./TransactionalMessage");
const defineTransactionalTemplate = require("./TransactionalTemplate");
const defineTransactionalDeliveryEvent = require("./TransactionalDeliveryEvent");
const defineCrmProviderConfig = require("./CrmProviderConfig");
const defineCrmEmailDomain = require("./CrmEmailDomain");
const defineCrmEmailDomainRoute = require("./CrmEmailDomainRoute");
const defineCrmEmailReplyForwardSettings = require("./CrmEmailReplyForwardSettings");
const defineCrmMarketingFolder = require("./CrmMarketingFolder");
const defineCrmMarketingTemplate = require("./CrmMarketingTemplate");
const defineCrmMarketingCampaign = require("./CrmMarketingCampaign");
const defineCrmMarketingMessage = require("./CrmMarketingMessage");
const defineCrmMarketingDeliveryEvent = require("./CrmMarketingDeliveryEvent");
const defineCrmTriggerLink = require("./CrmTriggerLink");
const defineCrmMarketingAsset = require("./CrmMarketingAsset");
const defineCrmMarketingSnippet = require("./CrmMarketingSnippet");
const defineCrmMarketingTemplateRevision = require("./CrmMarketingTemplateRevision");
const defineCrmMarketingSuppression = require("./CrmMarketingSuppression");
const defineCrmMarketingWorkerHeartbeat = require("./CrmMarketingWorkerHeartbeat");
const defineCrmMarketingCampaignAudienceJob = require("./CrmMarketingCampaignAudienceJob");
const defineCrmMarketingCalendarPlan = require("./CrmMarketingCalendarPlan");
const defineCrmMarketingCalendarRule = require("./CrmMarketingCalendarRule");
const defineCrmMarketingCalendarOverride = require("./CrmMarketingCalendarOverride");
const defineCrmAuditLog = require("./CrmAuditLog");
const defineCrmEventTemplateBinding = require("./CrmEventTemplateBinding");
const defineCrmContact = require("./CrmContact");
const defineCrmContactIdentity = require("./CrmContactIdentity");
const defineCrmContactImportJob = require("./CrmContactImportJob");
const defineCrmContactBulkActionJob = require("./CrmContactBulkActionJob");
const defineCrmContactExportJob = require("./CrmContactExportJob");
const defineCrmContactTag = require("./CrmContactTag");
const defineCrmContactFilterCount = require("./CrmContactFilterCount");
const defineCrmContactField = require("./CrmContactField");
const defineCrmContactNote = require("./CrmContactNote");
const defineCrmSegment = require("./CrmSegment");
const defineCrmSegmentMember = require("./CrmSegmentMember");
const defineCrmAutomationWorkflow = require("./CrmAutomationWorkflow");
const defineCrmAutomationRun = require("./CrmAutomationRun");
const defineCrmAutomationEnrollmentJob = require("./CrmAutomationEnrollmentJob");
const defineCrmQueueJob = require("./CrmQueueJob");

let models = null;

function getModels() {
  if (models) return models;
  const sequelize = getSequelize();
  const TransactionalMessage = defineTransactionalMessage(sequelize);
  const TransactionalTemplate = defineTransactionalTemplate(sequelize);
  const TransactionalDeliveryEvent = defineTransactionalDeliveryEvent(sequelize);
  const CrmProviderConfig = defineCrmProviderConfig(sequelize);
  const CrmEmailDomain = defineCrmEmailDomain(sequelize);
  const CrmEmailDomainRoute = defineCrmEmailDomainRoute(sequelize);
  const CrmEmailReplyForwardSettings = defineCrmEmailReplyForwardSettings(sequelize);
  const CrmMarketingFolder = defineCrmMarketingFolder(sequelize);
  const CrmMarketingTemplate = defineCrmMarketingTemplate(sequelize);
  const CrmMarketingCampaign = defineCrmMarketingCampaign(sequelize);
  const CrmMarketingMessage = defineCrmMarketingMessage(sequelize);
  const CrmMarketingDeliveryEvent = defineCrmMarketingDeliveryEvent(sequelize);
  const CrmTriggerLink = defineCrmTriggerLink(sequelize);
  const CrmMarketingAsset = defineCrmMarketingAsset(sequelize);
  const CrmMarketingSnippet = defineCrmMarketingSnippet(sequelize);
  const CrmMarketingTemplateRevision = defineCrmMarketingTemplateRevision(sequelize);
  const CrmMarketingSuppression = defineCrmMarketingSuppression(sequelize);
  const CrmMarketingWorkerHeartbeat = defineCrmMarketingWorkerHeartbeat(sequelize);
  const CrmMarketingCampaignAudienceJob = defineCrmMarketingCampaignAudienceJob(sequelize);
  const CrmMarketingCalendarPlan = defineCrmMarketingCalendarPlan(sequelize);
  const CrmMarketingCalendarRule = defineCrmMarketingCalendarRule(sequelize);
  const CrmMarketingCalendarOverride = defineCrmMarketingCalendarOverride(sequelize);
  const CrmAuditLog = defineCrmAuditLog(sequelize);
  const CrmEventTemplateBinding = defineCrmEventTemplateBinding(sequelize);
  const CrmContact = defineCrmContact(sequelize);
  const CrmContactIdentity = defineCrmContactIdentity(sequelize);
  const CrmContactImportJob = defineCrmContactImportJob(sequelize);
  const CrmContactBulkActionJob = defineCrmContactBulkActionJob(sequelize);
  const CrmContactExportJob = defineCrmContactExportJob(sequelize);
  const CrmContactTag = defineCrmContactTag(sequelize);
  const CrmContactFilterCount = defineCrmContactFilterCount(sequelize);
  const CrmContactField = defineCrmContactField(sequelize);
  const CrmContactNote = defineCrmContactNote(sequelize);
  const CrmSegment = defineCrmSegment(sequelize);
  const CrmSegmentMember = defineCrmSegmentMember(sequelize);
  const CrmAutomationWorkflow = defineCrmAutomationWorkflow(sequelize);
  const CrmAutomationRun = defineCrmAutomationRun(sequelize);
  const CrmAutomationEnrollmentJob = defineCrmAutomationEnrollmentJob(sequelize);
  const CrmQueueJob = defineCrmQueueJob(sequelize);

  CrmMarketingFolder.hasMany(CrmMarketingTemplate, { foreignKey: "folderId", as: "templates" });
  CrmMarketingTemplate.belongsTo(CrmMarketingFolder, { foreignKey: "folderId", as: "folder" });
  CrmMarketingTemplate.hasMany(CrmMarketingTemplateRevision, { foreignKey: "templateId", as: "revisions" });
  CrmMarketingTemplateRevision.belongsTo(CrmMarketingTemplate, { foreignKey: "templateId", as: "template" });
  CrmMarketingFolder.hasMany(CrmMarketingCampaign, { foreignKey: "folderId", as: "campaigns" });
  CrmMarketingCampaign.belongsTo(CrmMarketingFolder, { foreignKey: "folderId", as: "folder" });
  CrmMarketingCampaign.belongsTo(CrmMarketingTemplate, { foreignKey: "templateId", as: "template" });
  CrmMarketingCampaign.hasMany(CrmMarketingMessage, { foreignKey: "campaignId", as: "messages" });
  CrmMarketingMessage.belongsTo(CrmMarketingCampaign, { foreignKey: "campaignId", as: "campaign" });
  CrmMarketingMessage.belongsTo(CrmMarketingTemplate, { foreignKey: "templateId", as: "template" });
  CrmMarketingMessage.hasMany(CrmMarketingDeliveryEvent, { foreignKey: "messageId", as: "deliveryEvents" });
  CrmMarketingDeliveryEvent.belongsTo(CrmMarketingMessage, { foreignKey: "messageId", as: "message" });
  CrmMarketingMessage.hasMany(CrmMarketingSuppression, { foreignKey: "messageId", as: "suppressions" });
  CrmMarketingSuppression.belongsTo(CrmMarketingMessage, { foreignKey: "messageId", as: "message" });
  CrmMarketingCampaign.hasMany(CrmMarketingSuppression, { foreignKey: "campaignId", as: "suppressions" });
  CrmMarketingSuppression.belongsTo(CrmMarketingCampaign, { foreignKey: "campaignId", as: "campaign" });
  CrmMarketingCampaign.hasMany(CrmMarketingCampaignAudienceJob, { foreignKey: "campaignId", as: "audienceJobs" });
  CrmMarketingCampaignAudienceJob.belongsTo(CrmMarketingCampaign, { foreignKey: "campaignId", as: "campaign" });
  CrmMarketingCampaignAudienceJob.belongsTo(CrmMarketingTemplate, { foreignKey: "templateId", as: "template" });
  CrmMarketingCalendarPlan.hasMany(CrmMarketingCalendarRule, { foreignKey: "planId", as: "rules" });
  CrmMarketingCalendarRule.belongsTo(CrmMarketingCalendarPlan, { foreignKey: "planId", as: "plan" });
  CrmMarketingCalendarPlan.hasMany(CrmMarketingCalendarOverride, { foreignKey: "planId", as: "overrides" });
  CrmMarketingCalendarOverride.belongsTo(CrmMarketingCalendarPlan, { foreignKey: "planId", as: "plan" });
  CrmMarketingFolder.hasMany(CrmMarketingAsset, { foreignKey: "folderId", as: "assets" });
  CrmMarketingAsset.belongsTo(CrmMarketingFolder, { foreignKey: "folderId", as: "folder" });
  CrmContact.hasMany(CrmContactIdentity, { foreignKey: "contactId", as: "identities" });
  CrmContactIdentity.belongsTo(CrmContact, { foreignKey: "contactId", as: "contact" });
  CrmContact.hasMany(CrmContactNote, { foreignKey: "contactId", as: "notes" });
  CrmContactNote.belongsTo(CrmContact, { foreignKey: "contactId", as: "contact" });
  CrmSegment.hasMany(CrmSegmentMember, { foreignKey: "segmentId", as: "members" });
  CrmSegmentMember.belongsTo(CrmSegment, { foreignKey: "segmentId", as: "segment" });
  CrmContact.hasMany(CrmSegmentMember, { foreignKey: "contactId", as: "segmentMemberships" });
  CrmSegmentMember.belongsTo(CrmContact, { foreignKey: "contactId", as: "contact" });
  CrmAutomationWorkflow.hasMany(CrmAutomationRun, { foreignKey: "workflowId", as: "runs" });
  CrmAutomationRun.belongsTo(CrmAutomationWorkflow, { foreignKey: "workflowId", as: "workflow" });
  CrmAutomationWorkflow.hasMany(CrmAutomationEnrollmentJob, { foreignKey: "workflowId", as: "enrollmentJobs" });
  CrmAutomationEnrollmentJob.belongsTo(CrmAutomationWorkflow, { foreignKey: "workflowId", as: "workflow" });
  CrmContact.hasMany(CrmAutomationRun, { foreignKey: "contactId", as: "automationRuns" });
  CrmAutomationRun.belongsTo(CrmContact, { foreignKey: "contactId", as: "contact" });

  TransactionalMessage.hasMany(TransactionalDeliveryEvent, {
    foreignKey: "messageId",
    as: "deliveryEvents",
  });

  TransactionalDeliveryEvent.belongsTo(TransactionalMessage, {
    foreignKey: "messageId",
    as: "message",
  });

  CrmEmailDomain.hasMany(CrmEmailDomainRoute, {
    foreignKey: "domainId",
    as: "routes",
  });

  CrmEmailDomainRoute.belongsTo(CrmEmailDomain, {
    foreignKey: "domainId",
    as: "domain",
  });

  models = {
    sequelize,
    TransactionalMessage,
    TransactionalTemplate,
    TransactionalDeliveryEvent,
    CrmProviderConfig,
    CrmEmailDomain,
    CrmEmailDomainRoute,
    CrmEmailReplyForwardSettings,
    CrmMarketingFolder,
    CrmMarketingTemplate,
    CrmMarketingCampaign,
    CrmMarketingMessage,
    CrmMarketingDeliveryEvent,
    CrmTriggerLink,
    CrmMarketingAsset,
    CrmMarketingSnippet,
    CrmMarketingTemplateRevision,
    CrmMarketingSuppression,
    CrmMarketingWorkerHeartbeat,
    CrmMarketingCampaignAudienceJob,
    CrmMarketingCalendarPlan,
    CrmMarketingCalendarRule,
    CrmMarketingCalendarOverride,
    CrmAuditLog,
    CrmEventTemplateBinding,
    CrmContact,
    CrmContactIdentity,
    CrmContactImportJob,
    CrmContactBulkActionJob,
    CrmContactExportJob,
    CrmContactTag,
    CrmContactFilterCount,
    CrmContactField,
    CrmContactNote,
    CrmSegment,
    CrmSegmentMember,
    CrmAutomationWorkflow,
    CrmAutomationRun,
    CrmAutomationEnrollmentJob,
    CrmQueueJob,
  };
  return models;
}

module.exports = { getModels };
