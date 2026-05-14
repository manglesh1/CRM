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
const defineCrmAuditLog = require("./CrmAuditLog");
const defineCrmEventTemplateBinding = require("./CrmEventTemplateBinding");

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
  const CrmAuditLog = defineCrmAuditLog(sequelize);
  const CrmEventTemplateBinding = defineCrmEventTemplateBinding(sequelize);

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
  CrmMarketingFolder.hasMany(CrmMarketingAsset, { foreignKey: "folderId", as: "assets" });
  CrmMarketingAsset.belongsTo(CrmMarketingFolder, { foreignKey: "folderId", as: "folder" });

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
    CrmAuditLog,
    CrmEventTemplateBinding,
  };
  return models;
}

module.exports = { getModels };
