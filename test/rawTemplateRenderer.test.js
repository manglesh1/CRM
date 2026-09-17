const test = require("node:test");
const assert = require("node:assert/strict");
const { renderRawTemplate } = require("../src/modules/marketing/email/rawTemplateRenderer");

test("HTML preview escapes contact data and generates a readable text alternative", () => {
  const result = renderRawTemplate({ htmlBody: "<style>p{color:red}</style><p>Hi {{ contact.firstName }}</p><p>A &amp; B</p>", data: { contact: { firstName: "<Hema> & family" } } });
  assert.match(result.htmlBody, /Hi &lt;Hema&gt; &amp; family/);
  assert.equal(result.plainText, "Hi <Hema> & family\nA & B");
});

test("plain templates preserve line breaks, zero, and escape markup", () => {
  const result = renderRawTemplate({ editorType: "plain", plainText: "Hi {{contact.firstName}}\nBalance: {{payment.balance}}", data: { contact: { firstName: "<Hema>" }, payment: { balance: 0 } } });
  assert.equal(result.plainText, "Hi <Hema>\nBalance: 0");
  assert.match(result.htmlBody, /Hi &lt;Hema&gt;\nBalance: 0/);
});

test("explicit text alternative is rendered independently and missing fields are empty", () => {
  const result = renderRawTemplate({ htmlBody: "<p>Hello</p>", plainText: "Hi {{contact.firstName}} {{missing.field}}", data: { contact: { firstName: "Hema" } } });
  assert.equal(result.plainText, "Hi Hema ");
});

test("plain mode ignores stale HTML and empty bodies remain empty", () => {
  assert.equal(renderRawTemplate({ editorType: "plain", htmlBody: "OLD", plainText: "NEW" }).plainText, "NEW");
  assert.deepEqual(renderRawTemplate(), { htmlBody: "", plainText: "" });
});

test("draft preview service uses the same renderer for code and plain editors", () => {
  const { renderDraftTemplate } = require("../src/modules/marketing/email/service");
  const data = { contact: { firstName: "Hema" } };
  assert.equal(renderDraftTemplate({ editorType: "code", htmlBody: "<p>Hi {{contact.firstName}}</p>", data }).htmlBody, "<p>Hi Hema</p>");
  assert.equal(renderDraftTemplate({ editorType: "plain", plainText: "Hi {{contact.firstName}}", data }).plainText, "Hi Hema");
});

test("raw HTML tracks single and double quoted links without tracking unsubscribe", () => {
  const result = renderRawTemplate({ htmlBody: `<body><a href='https://shop.test/?a=1&amp;b=2'>Shop</a><a href="https://crm.test/m/unsubscribe/id">Unsubscribe</a></body>`, tracking: { clickBaseUrl: "https://crm.test/m/click/id", openPixelUrl: "https://crm.test/m/open/id.gif" } });
  assert.match(result.htmlBody, /click\/id\?u=https%3A%2F%2Fshop.test%2F%3Fa%3D1%26b%3D2/);
  assert.match(result.htmlBody, /href="https:\/\/crm.test\/m\/unsubscribe\/id"/);
  assert.match(result.htmlBody, /open\/id.gif/);
  assert.match(result.plainText, /Shop \(https:\/\/shop.test\/\?a=1&b=2\)/);
  assert.doesNotMatch(result.plainText, /m\/click/);
});

test("plain emails retain original text and track clickable HTML URLs", () => {
  const result = renderRawTemplate({ editorType: "plain", plainText: "Visit https://shop.test/deal", tracking: { clickBaseUrl: "https://crm.test/m/click/id", openPixelUrl: "https://crm.test/m/open/id.gif" } });
  assert.equal(result.plainText, "Visit https://shop.test/deal");
  assert.match(result.htmlBody, /m\/click\/id/);
  assert.match(result.htmlBody, /m\/open\/id.gif/);
});
