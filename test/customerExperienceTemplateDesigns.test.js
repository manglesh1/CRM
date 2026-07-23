"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildTransactionalSystemDesign,
  buildTransactionalPlainText,
} = require("../src/modules/transactional/systemTemplateDesigns");

function serializedDesign(key) {
  return JSON.stringify(
    buildTransactionalSystemDesign({
      key,
      name: key,
      family: "customer_experience",
      defaults: {
        heading: key === "customerExperienceFeedbackRequest" ? "How was your visit?" : "New guest feedback",
        paragraph: "Customer Experience message",
      },
    })
  );
}

test("Customer Experience feedback request uses a survey CTA without booking-only chrome", () => {
  const design = serializedDesign("customerExperienceFeedbackRequest");
  assert.match(design, /Start survey/);
  assert.match(design, /feedbackUrl.*rating=5/);
  assert.match(design, /feedbackUrl/);
  assert.match(design, /surveyFormName/);
  assert.doesNotMatch(design, /qrCodeUrl/);
  assert.doesNotMatch(design, /Show this at check-in/);
  assert.doesNotMatch(design, /sys_fact_total/);
});

test("Customer Experience response notification includes operational response context", () => {
  const design = serializedDesign("customerExperienceFeedbackReceived");
  assert.match(design, /ratingOverall/);
  assert.match(design, /feedbackComment/);
  assert.match(design, /factorRatingsHtml/);
  assert.match(design, /guestEmail/);
  assert.match(design, /feedbackAdminUrl/);
});

test("Customer Experience request plain text includes a usable survey URL", () => {
  const text = buildTransactionalPlainText({
    key: "customerExperienceFeedbackRequest",
    family: "customer_experience",
    defaults: { heading: "How was your visit?", paragraph: "Tell us how it went." },
  });
  assert.match(text, /Start survey: \{\{feedbackUrl\}\}/);
});
