const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2");
const config = require("../../../config");

let client = null;

function getClient() {
  if (!client) {
    client = new SESv2Client({ region: config.aws.region });
  }
  return client;
}

async function sendTransactionalEmail({ to, subject, html, text, from }) {
  const command = new SendEmailCommand({
    FromEmailAddress: from || config.aws.ses.defaultFrom,
    ConfigurationSetName: config.aws.ses.transactionalConfigSet,
    Destination: {
      ToAddresses: [to],
    },
    Content: {
      Simple: {
        Subject: {
          Data: subject || "",
          Charset: "UTF-8",
        },
        Body: {
          Html: {
            Data: html || text || "",
            Charset: "UTF-8",
          },
          Text: {
            Data: text || stripHtml(html || ""),
            Charset: "UTF-8",
          },
        },
      },
    },
  });

  const result = await getClient().send(command);
  return {
    provider: "ses",
    providerMessageId: result.MessageId,
  };
}

async function sendMarketingEmail({ to, subject, html, text, from, trackingTags = [] }) {
  const command = new SendEmailCommand({
    FromEmailAddress: from || config.aws.ses.defaultFrom,
    ConfigurationSetName: config.aws.ses.marketingConfigSet,
    Destination: {
      ToAddresses: [to],
    },
    EmailTags: trackingTags.map((tag) => ({
      Name: String(tag.name).slice(0, 256),
      Value: String(tag.value).slice(0, 256),
    })),
    Content: {
      Simple: {
        Subject: {
          Data: subject || "",
          Charset: "UTF-8",
        },
        Body: {
          Html: {
            Data: html || text || "",
            Charset: "UTF-8",
          },
          Text: {
            Data: text || stripHtml(html || ""),
            Charset: "UTF-8",
          },
        },
      },
    },
  });

  const result = await getClient().send(command);
  return {
    provider: "ses",
    providerMessageId: result.MessageId,
  };
}

function stripHtml(html) {
  return String(html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

module.exports = {
  sendTransactionalEmail,
  sendMarketingEmail,
};
