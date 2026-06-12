const {
  SESv2Client,
  CreateEmailIdentityCommand,
  DeleteEmailIdentityCommand,
  GetEmailIdentityCommand,
  PutEmailIdentityMailFromAttributesCommand,
} = require("@aws-sdk/client-sesv2");
const config = require("../../../config");

let client;

function getClient() {
  if (!client) {
    client = new SESv2Client({ region: config.aws.ses.region || config.aws.region });
  }
  return client;
}

function isProvisioningEnabled() {
  return Boolean(config.aws.ses.domainProvisioningEnabled);
}

function mailFromDomain(domain) {
  return `email.${domain}`;
}

function feedbackMxTarget() {
  return `feedback-smtp.${config.aws.ses.region || config.aws.region}.amazonses.com`;
}

async function createIdentity(domain) {
  if (!isProvisioningEnabled()) {
    const err = new Error("SES domain provisioning is disabled. Enable SES_DOMAIN_PROVISIONING_ENABLED before adding sending domains.");
    err.statusCode = 503;
    throw err;
  }

  const created = await getClient().send(
    new CreateEmailIdentityCommand({
      EmailIdentity: domain,
      Tags: [{ Key: "managed_by", Value: "movira_crm" }],
    })
  );

  await putMailFrom(domain);
  const identity = await getIdentity(domain);
  return {
    enabled: true,
    providerIdentityName: domain,
    providerIdentityArn: created.IdentityArn || identity.providerIdentityArn || null,
    mailFromDomain: mailFromDomain(domain),
    dnsRecords: buildRecordsFromIdentity(domain, identity),
  };
}

async function getIdentity(domain) {
  if (!isProvisioningEnabled()) {
    const err = new Error("SES domain provisioning is disabled. Domain verification cannot run without SES.");
    err.statusCode = 503;
    throw err;
  }
  const result = await getClient().send(new GetEmailIdentityCommand({ EmailIdentity: domain }));
  return normalizeIdentity(domain, result);
}

async function putMailFrom(domain) {
  await getClient().send(
    new PutEmailIdentityMailFromAttributesCommand({
      EmailIdentity: domain,
      MailFromDomain: mailFromDomain(domain),
      BehaviorOnMxFailure: "USE_DEFAULT_VALUE",
    })
  );
}

async function deleteIdentity(domain) {
  if (!isProvisioningEnabled() || !domain) return false;
  try {
    await getClient().send(new DeleteEmailIdentityCommand({ EmailIdentity: domain }));
    return true;
  } catch (err) {
    if (err?.name === "NotFoundException" || err?.$metadata?.httpStatusCode === 404) return false;
    throw err;
  }
}

function normalizeIdentity(domain, result = {}) {
  const dkim = result.DkimAttributes || {};
  const mailFrom = result.MailFromAttributes || {};
  return {
    providerIdentityName: domain,
    providerIdentityArn: result.IdentityArn || null,
    verifiedForSendingStatus: Boolean(result.VerifiedForSendingStatus),
    dkimStatus: dkim.Status || null,
    dkimTokens: Array.isArray(dkim.Tokens) ? dkim.Tokens : [],
    mailFromDomain: mailFrom.MailFromDomain || mailFromDomain(domain),
    mailFromStatus: mailFrom.MailFromDomainStatus || null,
  };
}

function buildRecordsFromIdentity(domain, identity) {
  if (!identity?.dkimTokens?.length) {
    const err = new Error("SES did not return DKIM tokens for this domain yet. Try verification again in a few minutes.");
    err.statusCode = 409;
    throw err;
  }
  const mailFrom = identity.mailFromDomain || mailFromDomain(domain);
  return [
    {
      type: "TXT",
      host: "@",
      value: "v=spf1 include:amazonses.com ~all",
      purpose: "SPF — authorises Movira SES to send for this domain",
      status: "pending",
    },
    ...identity.dkimTokens.map((token) => ({
      type: "CNAME",
      host: `${token}._domainkey.${domain}`,
      value: `${token}.dkim.amazonses.com`,
      purpose: "DKIM — message signature verification",
      status: "pending",
    })),
    {
      type: "MX",
      host: mailFrom,
      value: `10 ${feedbackMxTarget()}`,
      purpose: "Custom MAIL FROM — bounce routing",
      status: "pending",
    },
    {
      type: "TXT",
      host: mailFrom,
      value: "v=spf1 include:amazonses.com ~all",
      purpose: "MAIL FROM SPF — aligns return-path with this domain",
      status: "pending",
    },
    {
      type: "TXT",
      host: `_dmarc.${domain}`,
      value: "v=DMARC1; p=none; rua=mailto:dmarc@movira.app",
      purpose: "DMARC alignment policy",
      status: "pending",
    },
  ];
}

module.exports = {
  buildRecordsFromIdentity,
  createIdentity,
  deleteIdentity,
  getIdentity,
  isProvisioningEnabled,
  mailFromDomain,
};
