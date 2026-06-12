const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2");
const MailComposer = require("nodemailer/lib/mail-composer");
const { Op } = require("sequelize");
const { getModels } = require("../../../db/models");
const config = require("../../../config");
const moviraSesProvider = require("./sesEmailProvider");
const domainSenderResolver = require("./domainSenderResolver");

function providerUseCase(kind) {
  return kind === "transactional" ? "transactional" : "marketing";
}

async function findProvider({ locationId, useCase }) {
  const { CrmProviderConfig } = getModels();
  if (!locationId) return null;
  const rows = await CrmProviderConfig.findAll({
    where: {
      locationId: Number(locationId),
      channel: "email",
      isActive: true,
      domain: { [Op.in]: [useCase, "both"] },
    },
    order: [["priority", "ASC"], ["createdAt", "ASC"]],
    limit: 1,
  });
  return rows[0] || null;
}

async function sendTransactionalEmail(input = {}) {
  return sendEmail({ ...input, useCase: "transactional" });
}

async function sendMarketingEmail(input = {}) {
  return sendEmail({ ...input, useCase: "marketing" });
}

async function sendEmail(input = {}) {
  const useCase = providerUseCase(input.useCase);
  const sender = await domainSenderResolver.resolveSender({ locationId: input.locationId, useCase });
  const resolvedInput = sender ? { ...input, from: sender.from } : input;
  const providerRow = sender?.providerConfigId
    ? await findProviderById(sender.providerConfigId)
    : await findProvider({ locationId: input.locationId, useCase });
  if (!providerRow || providerRow.provider === "movira_ses") {
    const result = useCase === "transactional"
      ? moviraSesProvider.sendTransactionalEmail(resolvedInput)
      : moviraSesProvider.sendMarketingEmail(resolvedInput);
    return enrichResult(await result, providerRow, sender);
  }
  return enrichResult(await sendWithProviderRow(providerRow, resolvedInput, useCase), providerRow, sender);
}

async function findProviderById(id) {
  const { CrmProviderConfig } = getModels();
  if (!id) return null;
  return CrmProviderConfig.findOne({
    where: {
      id,
      channel: "email",
      isActive: true,
    },
  });
}

async function sendWithProviderRow(providerRow, input = {}, useCase = providerUseCase(providerRow?.domain)) {
  const cfg = providerRow.encryptedConfig || {};
  if (providerRow.provider === "customer_ses") {
    return sendCustomerSes(providerRow, cfg, input, useCase);
  }
  if (providerRow.provider === "customer_sendgrid") {
    return sendSendgrid(providerRow, cfg, input, useCase);
  }
  if (providerRow.provider === "customer_mailgun") {
    return sendMailgun(providerRow, cfg, input, useCase);
  }
  if (providerRow.provider === "customer_postmark") {
    return sendPostmark(providerRow, cfg, input, useCase);
  }

  return useCase === "transactional"
    ? moviraSesProvider.sendTransactionalEmail(input)
    : moviraSesProvider.sendMarketingEmail(input);
}

function enrichResult(result = {}, providerRow, sender) {
  return {
    ...result,
    providerConfigId: result.providerConfigId || providerRow?.id || sender?.providerConfigId || null,
    senderDomainId: sender?.domainId || null,
    senderDomain: sender?.domain || null,
  };
}

async function sendCustomerSes(providerRow, cfg, input, useCase) {
  const client = new SESv2Client({
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
  const tags = [
    { Name: "domain", Value: useCase },
    ...(input.messageId ? [{ Name: "message_id", Value: String(input.messageId).slice(0, 256) }] : []),
    ...(input.trackingTags || []).map((tag) => ({
      Name: String(tag.name).slice(0, 256),
      Value: String(tag.value).slice(0, 256),
    })),
  ];
  const fromAddress = input.from || cfg.fromEmail || config.aws.ses.defaultFrom;
  const base = {
    FromEmailAddress: fromAddress,
    ConfigurationSetName: input.configurationSet || cfg.configurationSet || undefined,
    Destination: { ToAddresses: [input.to] },
    EmailTags: tags,
  };
  const content = input.attachments?.length
    ? { Raw: { Data: await buildRawMime({ ...input, from: fromAddress }) } }
    : {
        Simple: {
          Subject: { Data: input.subject || "", Charset: "UTF-8" },
          Body: {
            Html: { Data: input.html || input.text || "", Charset: "UTF-8" },
            Text: { Data: input.text || stripHtml(input.html || ""), Charset: "UTF-8" },
          },
        },
      };
  const result = await client.send(new SendEmailCommand({ ...base, Content: content }));
  return {
    provider: providerRow.provider,
    providerConfigId: providerRow.id,
    providerMessageId: result.MessageId || null,
  };
}

async function sendSendgrid(providerRow, cfg, input, useCase = providerUseCase(providerRow?.domain)) {
  if (typeof fetch !== "function") {
    throw new Error("SendGrid provider requires Node 18+ fetch support.");
  }
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: input.to }] }],
      from: { email: input.from || cfg.fromEmail || config.aws.ses.defaultFrom },
      subject: input.subject || "",
      custom_args: {
        domain: useCase,
        ...(input.messageId ? { message_id: String(input.messageId) } : {}),
        ...(input.trackingTags || []).reduce((acc, tag) => {
          acc[String(tag.name).slice(0, 120)] = String(tag.value).slice(0, 500);
          return acc;
        }, {}),
      },
      content: [
        { type: "text/plain", value: input.text || stripHtml(input.html || "") },
        { type: "text/html", value: input.html || input.text || "" },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`SendGrid send failed: ${res.status} ${res.statusText}${text ? ` ${text}` : ""}`);
  }
  return {
    provider: providerRow.provider,
    providerConfigId: providerRow.id,
    providerMessageId: res.headers.get("x-message-id") || null,
  };
}

async function sendMailgun(providerRow, cfg, input, useCase) {
  if (typeof fetch !== "function" || typeof FormData !== "function") {
    throw new Error("Mailgun provider requires Node 18+ fetch/FormData support.");
  }
  const form = new FormData();
  form.append("from", input.from || cfg.fromEmail || config.aws.ses.defaultFrom);
  form.append("to", input.to);
  form.append("subject", input.subject || "");
  form.append("html", input.html || input.text || "");
  form.append("text", input.text || stripHtml(input.html || ""));
  form.append("v:domain", useCase);
  if (input.messageId) form.append("v:message_id", String(input.messageId));
  for (const tag of input.trackingTags || []) {
    form.append(`v:${String(tag.name).slice(0, 120)}`, String(tag.value).slice(0, 500));
  }
  for (const attachment of input.attachments || []) {
    const content = Buffer.isBuffer(attachment.content)
      ? attachment.content
      : Buffer.from(String(attachment.content || ""), attachment.encoding === "base64" ? "base64" : "utf8");
    form.append(
      "attachment",
      new Blob([content], { type: attachment.contentType || "application/octet-stream" }),
      attachment.filename || "attachment"
    );
  }

  const res = await fetch(`${mailgunApiBase(cfg.region)}/v3/${encodeURIComponent(cfg.domain)}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${cfg.apiKey}`).toString("base64")}`,
    },
    body: form,
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Mailgun send failed: ${res.status} ${res.statusText}${text ? ` ${text}` : ""}`);
  }
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch (_err) {
    parsed = {};
  }
  return {
    provider: providerRow.provider,
    providerConfigId: providerRow.id,
    providerMessageId: parsed.id || null,
  };
}

async function sendPostmark(providerRow, cfg, input, useCase) {
  if (typeof fetch !== "function") {
    throw new Error("Postmark provider requires Node 18+ fetch support.");
  }
  const body = {
    From: input.from || cfg.fromEmail || config.aws.ses.defaultFrom,
    To: input.to,
    Subject: input.subject || "",
    HtmlBody: input.html || input.text || "",
    TextBody: input.text || stripHtml(input.html || ""),
    Metadata: {
      domain: useCase,
      ...(input.messageId ? { message_id: String(input.messageId) } : {}),
      ...(input.trackingTags || []).reduce((acc, tag) => {
        acc[String(tag.name).slice(0, 120)] = String(tag.value).slice(0, 500);
        return acc;
      }, {}),
    },
  };
  if (cfg.messageStream) body.MessageStream = cfg.messageStream;
  if (input.attachments?.length) {
    body.Attachments = input.attachments.map((attachment) => {
      const content = Buffer.isBuffer(attachment.content)
        ? attachment.content
        : Buffer.from(String(attachment.content || ""), attachment.encoding === "base64" ? "base64" : "utf8");
      return {
        Name: attachment.filename || "attachment",
        Content: content.toString("base64"),
        ContentType: attachment.contentType || "application/octet-stream",
      };
    });
  }
  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": cfg.serverToken,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Postmark send failed: ${res.status} ${res.statusText}${text ? ` ${text}` : ""}`);
  }
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch (_err) {
    parsed = {};
  }
  return {
    provider: providerRow.provider,
    providerConfigId: providerRow.id,
    providerMessageId: parsed.MessageID || parsed.MessageId || null,
  };
}

function mailgunApiBase(region) {
  return String(region || "us").toLowerCase() === "eu"
    ? "https://api.eu.mailgun.net"
    : "https://api.mailgun.net";
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

function stripHtml(html) {
  return String(html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

module.exports = {
  sendTransactionalEmail,
  sendMarketingEmail,
  sendWithProviderRow,
};
