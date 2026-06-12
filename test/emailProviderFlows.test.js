const assert = require("node:assert/strict");
const { afterEach, mock, test } = require("node:test");
const { SESv2Client } = require("@aws-sdk/client-sesv2");
const { sendWithProviderRow } = require("../src/modules/messaging-core/providers/emailProviderRouter");
const providerEventsService = require("../src/modules/webhooks/providerEventsService");
const sesWebhookService = require("../src/modules/webhooks/sesService");
const marketingTrackingService = require("../src/modules/marketing/tracking/service");
const transactionalTracking = require("../src/modules/transactional/tracking");

afterEach(() => {
  mock.restoreAll();
});

function providerRow(provider, encryptedConfig = {}) {
  return {
    id: 42,
    provider,
    domain: "transactional",
    encryptedConfig,
  };
}

const emailInput = {
  to: "guest@example.test",
  from: "sender@example.test",
  subject: "Order confirmed",
  html: "<p>Hello</p>",
  text: "Hello",
  messageId: "msg_tx_123",
  trackingTags: [
    { name: "template_id", value: "tpl_1" },
    { name: "location_id", value: "15" },
  ],
};

test("customer SES provider sends transactional metadata tags", async () => {
  let commandInput = null;
  mock.method(SESv2Client.prototype, "send", async (command) => {
    commandInput = command.input;
    return { MessageId: "ses-message-id" };
  });

  const result = await sendWithProviderRow(providerRow("customer_ses", {
    region: "ap-south-1",
    accessKeyId: "AKIA_TEST",
    secretAccessKey: "secret",
    configurationSet: "customer-config-set",
    fromEmail: "ses@example.test",
  }), emailInput, "transactional");

  assert.equal(result.provider, "customer_ses");
  assert.equal(result.providerMessageId, "ses-message-id");
  assert.equal(commandInput.ConfigurationSetName, "customer-config-set");
  assert.equal(commandInput.FromEmailAddress, "sender@example.test");
  assert.deepEqual(commandInput.EmailTags, [
    { Name: "domain", Value: "transactional" },
    { Name: "message_id", Value: "msg_tx_123" },
    { Name: "template_id", Value: "tpl_1" },
    { Name: "location_id", Value: "15" },
  ]);
});

test("SendGrid provider sends custom args used by the Event Webhook", async () => {
  let request = null;
  mock.method(global, "fetch", async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      headers: { get: (name) => (String(name).toLowerCase() === "x-message-id" ? "sendgrid-message-id" : null) },
    };
  });

  const result = await sendWithProviderRow(providerRow("customer_sendgrid", {
    apiKey: "SG.test",
    fromEmail: "sg@example.test",
  }), emailInput, "transactional");

  const body = JSON.parse(request.options.body);
  assert.equal(result.provider, "customer_sendgrid");
  assert.equal(result.providerMessageId, "sendgrid-message-id");
  assert.equal(request.url, "https://api.sendgrid.com/v3/mail/send");
  assert.equal(body.custom_args.domain, "transactional");
  assert.equal(body.custom_args.message_id, "msg_tx_123");
  assert.equal(body.custom_args.template_id, "tpl_1");
  assert.equal(body.personalizations[0].to[0].email, "guest@example.test");
});

test("Mailgun provider sends variables used by Mailgun webhooks", async () => {
  let request = null;
  mock.method(global, "fetch", async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      text: async () => JSON.stringify({ id: "mailgun-message-id" }),
    };
  });

  const result = await sendWithProviderRow(providerRow("customer_mailgun", {
    apiKey: "key-test",
    domain: "mg.example.test",
    region: "us",
    fromEmail: "mailgun@example.test",
  }), emailInput, "transactional");

  const fields = Object.fromEntries(request.options.body.entries());
  assert.equal(result.provider, "customer_mailgun");
  assert.equal(result.providerMessageId, "mailgun-message-id");
  assert.equal(request.url, "https://api.mailgun.net/v3/mg.example.test/messages");
  assert.equal(fields["v:domain"], "transactional");
  assert.equal(fields["v:message_id"], "msg_tx_123");
  assert.equal(fields["v:template_id"], "tpl_1");
});

test("Postmark provider sends metadata used by Postmark webhooks", async () => {
  let request = null;
  mock.method(global, "fetch", async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      text: async () => JSON.stringify({ MessageID: "postmark-message-id" }),
    };
  });

  const result = await sendWithProviderRow(providerRow("customer_postmark", {
    serverToken: "server-token",
    fromEmail: "postmark@example.test",
    messageStream: "outbound",
  }), emailInput, "transactional");

  const body = JSON.parse(request.options.body);
  assert.equal(result.provider, "customer_postmark");
  assert.equal(result.providerMessageId, "postmark-message-id");
  assert.equal(request.url, "https://api.postmarkapp.com/email");
  assert.equal(body.MessageStream, "outbound");
  assert.equal(body.Metadata.domain, "transactional");
  assert.equal(body.Metadata.message_id, "msg_tx_123");
  assert.equal(body.Metadata.template_id, "tpl_1");
});

test("SendGrid, Mailgun, and Postmark webhooks route events to transactional and marketing tracking", async () => {
  const transactionalCalls = [];
  const marketingCalls = [];
  mock.method(transactionalTracking, "recordTransactionalProviderEvent", async (payload) => {
    transactionalCalls.push(payload);
    return { matched: true, messageId: payload.taggedMessageId, eventType: payload.eventType };
  });
  mock.method(marketingTrackingService, "recordMarketingEvent", async (...args) => {
    marketingCalls.push(args);
    return { messageId: args[0], eventType: args[1] };
  });

  await providerEventsService.handleSendgridWebhook([
    {
      event: "delivered",
      domain: "transactional",
      message_id: "tx_sendgrid",
      sg_message_id: "sg_provider_id",
    },
    {
      event: "click",
      domain: "marketing",
      message_id: "mk_sendgrid",
      sg_message_id: "sg_provider_id_2",
    },
  ]);
  await providerEventsService.handleMailgunWebhook({
    "event-data": {
      event: "failed",
      id: "mg_provider_id",
      "user-variables": {
        domain: "transactional",
        message_id: "tx_mailgun",
      },
    },
  });
  await providerEventsService.handlePostmarkWebhook({
    RecordType: "Bounce",
    MessageID: "pm_provider_id",
    Metadata: {
      domain: "transactional",
      message_id: "tx_postmark",
    },
  });

  assert.equal(transactionalCalls.length, 3);
  assert.deepEqual(transactionalCalls.map((call) => call.provider), ["sendgrid", "mailgun", "postmark"]);
  assert.deepEqual(transactionalCalls.map((call) => call.eventType), ["delivered", "bounce", "bounce"]);
  assert.deepEqual(transactionalCalls.map((call) => call.taggedMessageId), ["tx_sendgrid", "tx_mailgun", "tx_postmark"]);

  assert.equal(marketingCalls.length, 1);
  assert.equal(marketingCalls[0][0], "mk_sendgrid");
  assert.equal(marketingCalls[0][1], "click");
  assert.equal(marketingCalls[0][2].source, "sendgrid_webhook");
});

test("SES webhook routes tagged transactional and marketing events", async () => {
  const transactionalCalls = [];
  const marketingCalls = [];
  mock.method(transactionalTracking, "recordTransactionalSesEvent", async (payload) => {
    transactionalCalls.push(payload);
    return { matched: true, messageId: payload.taggedMessageId, eventType: payload.eventType };
  });
  mock.method(marketingTrackingService, "recordSesEvent", async (payload) => {
    marketingCalls.push(payload);
    return { messageId: "mk_ses", eventType: "delivered" };
  });

  const transactionalResult = await sesWebhookService.handleSesWebhook({
    eventType: "Delivery",
    mail: {
      messageId: "ses_provider_tx",
      tags: {
        domain: ["transactional"],
        message_id: ["tx_ses"],
      },
    },
  });
  const marketingResult = await sesWebhookService.handleSesWebhook({
    eventType: "Delivery",
    mail: {
      messageId: "ses_provider_mk",
      tags: {
        domain: ["marketing"],
        message_id: ["mk_ses"],
      },
    },
  });

  assert.equal(transactionalResult.domain, "transactional");
  assert.equal(transactionalCalls[0].eventType, "delivered");
  assert.equal(transactionalCalls[0].taggedMessageId, "tx_ses");
  assert.equal(marketingResult.domain, "marketing");
  assert.equal(marketingCalls.length, 1);
});
