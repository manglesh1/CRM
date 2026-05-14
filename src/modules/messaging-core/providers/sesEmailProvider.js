const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2");
const MailComposer = require("nodemailer/lib/mail-composer");
const config = require("../../../config");

let client = null;

function getClient() {
  if (!client) {
    client = new SESv2Client({ region: config.aws.region });
  }
  return client;
}

function buildRawMime({ from, to, subject, html, text, attachments }) {
  return new Promise((resolve, reject) => {
    const composer = new MailComposer({
      from,
      to,
      subject: subject || "",
      html: html || "",
      text: text || stripHtml(html || ""),
      attachments: (attachments || []).map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType || undefined,
        encoding: a.encoding || undefined,
      })),
    });
    composer.compile().build((err, message) => {
      if (err) return reject(err);
      resolve(message);
    });
  });
}

async function sendTransactionalEmail({ to, subject, html, text, from, attachments = [], messageId }) {
  const fromAddress = from || config.aws.ses.defaultFrom;
  const tags = [{ Name: "domain", Value: "transactional" }];
  if (messageId) tags.push({ Name: "message_id", Value: String(messageId).slice(0, 256) });

  if (attachments && attachments.length > 0) {
    const rawMessage = await buildRawMime({
      from: fromAddress,
      to,
      subject,
      html,
      text,
      attachments,
    });
    const command = new SendEmailCommand({
      FromEmailAddress: fromAddress,
      ConfigurationSetName: config.aws.ses.transactionalConfigSet,
      Destination: { ToAddresses: [to] },
      EmailTags: tags,
      Content: { Raw: { Data: rawMessage } },
    });
    const result = await getClient().send(command);
    return { provider: "ses", providerMessageId: result.MessageId };
  }

  const command = new SendEmailCommand({
    FromEmailAddress: fromAddress,
    ConfigurationSetName: config.aws.ses.transactionalConfigSet,
    Destination: {
      ToAddresses: [to],
    },
    EmailTags: tags,
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
