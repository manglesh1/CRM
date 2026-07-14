const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

// All accents derive from the Aero brand orange (#FF7A24 / #F45B0A). Each
// family gets a distinct orange shade so emails stay on-theme while remaining
// visually distinguishable. `accent` = hero/button/pill/link, `dark` = facts
// strip background, `soft` = pill + card-header tint.
const FAMILY_PROFILES = {
  booking: { accent: "#F45B0A", dark: "#5A2706", soft: "#FFF4EC", label: "Booking" },
  payment: { accent: "#EA6A12", dark: "#5A2E08", soft: "#FFF3E8", label: "Payment" },
  waiver: { accent: "#D14808", dark: "#54260A", soft: "#FFF1E8", label: "Waiver" },
  membership: { accent: "#C2410C", dark: "#4A1F08", soft: "#FDEFE6", label: "Membership" },
  giftcard: { accent: "#FB8B24", dark: "#6A3410", soft: "#FFF6EA", label: "Gift Card" },
  guestList: { accent: "#E2560F", dark: "#561F08", soft: "#FFF2EA", label: "Guest List" },
  saas: { accent: "#F45B0A", dark: "#3D1708", soft: "#FFF3E8", label: "Movira SaaS" },
  simple: { accent: "#B45309", dark: "#44260C", soft: "#FBF3EA", label: "Notice" },
  system: { accent: "#B45309", dark: "#44260C", soft: "#FBF3EA", label: "Notice" },
};

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function section(id, layout, settings, columns) {
  return {
    id,
    type: "section",
    layout,
    settings: {
      backgroundType: "content",
      mobileStack: true,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      ...settings,
    },
    columns,
  };
}

function column(id, width, blocks) {
  return { id, width, blocks };
}

function text(id, content, settings = {}) {
  return { id, type: "text", content, settings };
}

function heading(id, content, settings = {}) {
  return { id, type: "heading", content, settings };
}

function button(id, label, href, settings = {}) {
  return {
    id,
    type: "button",
    content: label,
    settings: {
      href,
      align: "left",
      radius: 999,
      paddingY: 12,
      paddingX: 20,
      fontSize: 14,
      ...settings,
    },
  };
}

function image(id, src, settings = {}) {
  return { id, type: "image", settings: { src, width: 132, alt: "", ...settings } };
}

function divider(id, settings = {}) {
  return { id, type: "divider", settings };
}

function code(id, content, settings = {}) {
  return { id, type: "code", content, settings };
}

function footer(id, content, settings = {}) {
  return { id, type: "footer", content, settings };
}

function styleVars(profile) {
  return `
    <style>
      .txn-card{border:1px solid #ECECEC;border-radius:10px;overflow:hidden;background:#ffffff;}
      .txn-row{border-bottom:1px solid #F3F0EC;}
      .txn-label{font-size:10px;color:#9A8F84;text-transform:uppercase;letter-spacing:.07em;font-weight:700;}
      .txn-value{font-size:14px;color:#1A1614;font-weight:700;line-height:1.4;}
      .txn-muted{font-size:12px;color:#8A8079;line-height:1.5;}
      .txn-total{font-size:21px;color:#1A1614;font-weight:800;line-height:1;}
      .txn-pill{display:inline-block;background:${profile.accent};color:#ffffff;border-radius:999px;padding:4px 9px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;}
      .txn-link{color:${profile.accent};text-decoration:underline;font-weight:700;}
    </style>
  `;
}

function buildSummaryCard(profile, title, rowsHtml) {
  return `
    ${styleVars(profile)}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="txn-card">
      <tr>
        <td style="padding:13px 16px;background:${profile.soft};border-bottom:1px solid #F3F0EC;">
          <span class="txn-pill">${profile.label}</span>
          <h2 style="margin:8px 0 0;font-size:18px;line-height:1.2;color:#1A1614;font-weight:800;">${title}</h2>
        </td>
      </tr>
      ${rowsHtml}
    </table>
  `;
}

function buildBookingMain(profile) {
  return buildSummaryCard(
    profile,
    "Your order",
    `
      <tr class="txn-row">
        <td style="padding:13px 16px;">
          <div class="txn-label">Booking ID</div>
          <div class="txn-value">{{bookingNumber}}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:13px 16px;">
          <div class="txn-label" style="margin-bottom:8px;">Items</div>
          {{lineItemsHtml}}
          <div style="height:14px;line-height:14px;">&nbsp;</div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">{{pricingRowsHtml}}</table>
          {{chargedSummaryHtml}}
        </td>
      </tr>
    `
  );
}

function buildPaymentMain(profile, key) {
  const isLink = key === "paymentLink";
  return buildSummaryCard(
    profile,
    isLink ? "Complete your payment" : "Payment received",
    `
      <tr class="txn-row">
        <td style="padding:13px 16px;">
          <div class="txn-label">${isLink ? "Amount due" : "Amount paid"}</div>
          <div class="txn-total">${isLink ? "{{amountDue}}" : "{{amountPaid}}"}</div>
          <div class="txn-muted" style="margin-top:6px;">Booking {{bookingNumber}} at {{venueName}}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:13px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">{{pricingRowsHtml}}</table>
          {{chargedSummaryHtml}}
          <div class="txn-muted" style="margin-top:12px;">Gateway: {{gateway}}</div>
        </td>
      </tr>
    `
  );
}

function buildWaiverMain(profile, key) {
  const signed = key === "waiver-complete";
  const expiring = key === "waiverExpiryReminder";
  return buildSummaryCard(
    profile,
    signed ? "Waiver signed" : expiring ? "Renew your waiver" : "Sign before you arrive",
    `
      <tr class="txn-row">
        <td style="padding:13px 16px;">
          <div class="txn-label">Guest</div>
          <div class="txn-value">{{guestName}}</div>
          <div class="txn-muted" style="margin-top:6px;">{{venueName}}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:13px 16px;">
          <div class="txn-label">${signed || expiring ? "Expiry" : "Waiver link"}</div>
          <div class="txn-value">${signed || expiring ? "{{expiryDate}}" : '<a class="txn-link" href="{{waiverShareUrl}}">Open waiver</a>'}</div>
          <div class="txn-muted" style="margin-top:8px;">Booking {{bookingNumber}}</div>
        </td>
      </tr>
    `
  );
}

function buildMembershipMain(profile) {
  return buildSummaryCard(
    profile,
    "Membership details",
    `
      <tr class="txn-row">
        <td style="padding:13px 16px;">
          <div class="txn-label">Member</div>
          <div class="txn-value">{{guestName}}</div>
          <div class="txn-muted" style="margin-top:6px;">{{membershipName}}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:13px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr><td class="txn-muted">Status</td><td align="right" class="txn-value">{{membership.status}}</td></tr>
            <tr><td class="txn-muted">Activated</td><td align="right" class="txn-value">{{membership.activatedAt}}</td></tr>
            <tr><td class="txn-muted">Expires</td><td align="right" class="txn-value">{{membership.expiresAt}}</td></tr>
          </table>
        </td>
      </tr>
    `
  );
}

function buildGenericMain(profile, title) {
  return buildSummaryCard(
    profile,
    title,
    `
      <tr class="txn-row">
        <td style="padding:13px 16px;">
          <div class="txn-label">Guest</div>
          <div class="txn-value">{{guestName}}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:13px 16px;">
          <div class="txn-label">Reference</div>
          <div class="txn-value">{{bookingNumber}}</div>
          <div class="txn-muted" style="margin-top:8px;">{{venueName}}</div>
        </td>
      </tr>
    `
  );
}

function saasRow(label, value) {
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #F3F0EC;">
        <div class="txn-label">${label}</div>
      </td>
      <td align="right" style="padding:10px 0;border-bottom:1px solid #F3F0EC;">
        <div class="txn-value">${value}</div>
      </td>
    </tr>
  `;
}

function saasStatusFor(row) {
  const key = row.key || "";
  if (key === "saasInvoicePaymentLink") return "Payment due";
  if (key === "saasInvoicePaid") return "Paid";
  if (key === "saasInvoiceReminder") return "Reminder";
  if (key === "saasInvoiceVoided") return "Voided";
  if (key === "saasInvoiceRefunded") return "Refunded";
  if (key === "saasBillingPastDue") return "Past due";
  if (key === "saasBillingSuspended") return "Billing hold";
  if (key === "saasBillingRecovered") return "Recovered";
  if (key === "saasParkGoLive") return "Live";
  if (key === "saasParkGoLiveBlocked") return "Needs checks";
  if (key === "saasOnboardingStarted") return "Onboarding";
  return "SaaS update";
}

function buildSaasMain(profile, row) {
  const key = row.key || "";
  const onboarding = key === "saasOnboardingStarted" || key === "saasParkGoLive" || key === "saasParkGoLiveBlocked";
  const paymentLink = key === "saasInvoicePaymentLink";
  const paid = key === "saasInvoicePaid";
  const reminder = key === "saasInvoiceReminder" || key === "saasBillingPastDue" || key === "saasBillingSuspended";
  const refunded = key === "saasInvoiceRefunded";
  const title = onboarding ? "Park launch status" : paid ? "Payment receipt" : paymentLink ? "Secure payment request" : "Billing summary";
  const amountValue = paid ? "{{paidAmountLabel}}" : refunded ? "{{paidAmountLabel}}" : reminder ? "{{balanceDueLabel}}" : "{{totalAmountLabel}}";
  const rows = onboarding
    ? [
        saasRow("Park", "{{venueName}}"),
        saasRow("Organization", "{{organizationName}}"),
        saasRow("Current phase", "{{onboardingPhase}}"),
        saasRow("Modules", "{{modules}}"),
      ].join("")
    : [
        saasRow("Invoice", "{{invoiceNumber}}"),
        saasRow("Billing cycle", "{{billingCycle}}"),
        saasRow("Period", "{{periodStart}} - {{periodEnd}}"),
        saasRow("Due date", "{{dueDate}}"),
        saasRow(paid ? "Paid amount" : refunded ? "Current paid balance" : reminder ? "Balance due" : "Total", amountValue),
      ].join("");

  return buildSummaryCard(
    profile,
    title,
    `
      <tr class="txn-row">
        <td style="padding:16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td>
                <div class="txn-label">Status</div>
                <div class="txn-total" style="margin-top:5px;">${saasStatusFor(row)}</div>
              </td>
              <td align="right">
                <div style="display:inline-block;padding:8px 12px;border-radius:999px;background:${profile.soft};color:${profile.accent};font-size:12px;font-weight:800;">${saasStatusFor(row)}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr class="txn-row">
        <td style="padding:6px 16px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${rows}</table>
        </td>
      </tr>
      <tr>
        <td style="padding:15px 16px;background:#FFFBF7;">
          ${
            onboarding
              ? '<div class="txn-muted">{{lifecycleMessage}}</div><div class="txn-muted">Phase: {{onboardingPhase}}</div><div style="height:10px;line-height:10px;">&nbsp;</div>{{ownerAccessHtml}}'
              : '<div class="txn-label" style="margin-bottom:8px;">Line items</div>{{lineItemsHtml}}<div style="height:10px;line-height:10px;">&nbsp;</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td class="txn-muted">Base</td><td align="right" class="txn-value">{{baseAmount}}</td></tr><tr><td class="txn-muted">Modules</td><td align="right" class="txn-value">{{moduleAmount}}</td></tr><tr><td class="txn-muted">Discount</td><td align="right" class="txn-value">{{discountAmount}}</td></tr><tr><td class="txn-muted">Tax</td><td align="right" class="txn-value">{{taxAmount}}</td></tr></table>'
          }
          ${
            paymentLink
              ? '<div style="margin-top:14px;padding:12px 14px;border-radius:10px;background:#ffffff;border:1px solid #FED7AA;color:#7C2D12;font-size:13px;line-height:1.5;">This payment link is generated by Movira for SaaS subscription billing. It is separate from guest checkout and POS payments.</div>'
              : ""
          }
        </td>
      </tr>
    `
  );
}

function actionFor(row) {
  const key = row.key;
  if (key === "saasInvoicePaymentLink") return { label: "Pay invoice", href: "{{paymentLink}}" };
  if (key === "saasOnboardingStarted") return { label: "Open Movira", href: "{{loginUrl}}" };
  if (key === "paymentLink") return { label: "Pay now", href: "{{paymentLink}}" };
  if (["waiverLink", "waiverExpiryReminder", "waiver-reminder"].includes(key)) {
    return { label: "Sign waiver", href: "{{waiverShareUrl}}" };
  }
  if (["booking-agreement"].includes(key)) return { label: "Review agreement", href: "{{agreementUrl}}" };
  if (["payment-details-update-link", "membership-1st-failed-payment", "membership-3rd-failed-payment", "membership-suspended"].includes(key)) {
    return { label: "Update payment details", href: "{{paymentUpdateUrl}}" };
  }
  if (key === "bookingConfirmation") return { label: "View tickets", href: "{{ticketsUrl}}" };
  if (key === "payment-receipt") return { label: "View receipt", href: "{{receiptUrl}}" };
  return null;
}

function mainContentFor(row, profile, headingText) {
  if (row.family === "saas") return buildSaasMain(profile, row);
  if (row.family === "booking" && row.key === "bookingConfirmation") return buildBookingMain(profile);
  if (row.family === "payment") return buildPaymentMain(profile, row.key);
  if (row.family === "waiver") return buildWaiverMain(profile, row.key);
  if (row.family === "membership") return buildMembershipMain(profile);
  return buildGenericMain(profile, headingText);
}

function buildTransactionalSystemDesign(row = {}) {
  const defaults = parseJson(row.defaults);
  const family = row.family || row.category || "system";
  const profile = FAMILY_PROFILES[family] || FAMILY_PROFILES.system;
  const headingText = defaults.heading || row.name || "Update from {{venueName}}";
  const paragraph = defaults.paragraph || "Hi {{guestName}},<br/>Here are the details for your visit.";
  const action = actionFor(row);
  const mainHtml = mainContentFor(row, profile, headingText);

  return {
    schemaVersion: 1,
    settings: {
      contentWidth: 600,
      backgroundColor: "#F5F1EC",
      bodyColor: "#ffffff",
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: 15,
      textColor: "#1A1614",
      headingColor: "#1A1614",
      linkColor: profile.accent,
      buttonColor: profile.accent,
      dividerColor: "#ECE7E1",
      customCss:
        "@media only screen and (max-width:480px){.txn-total{font-size:20px!important}.txn-card{border-radius:0!important}}",
    },
    sections: [
      section("sys_header", "2-3:1-3", { backgroundColor: "#ffffff", padding: { top: 18, right: 24, bottom: 14, left: 24 } }, [
        column("sys_header_brand", "66.66%", [
          text("sys_brand", "{{venueName}}", { fontSize: 17, fontWeight: 800, color: "#1A1614", padding: { top: 0, right: 0, bottom: 0, left: 0 } }),
          text("sys_address", "{{locationAddress}}", { fontSize: 12, color: "#8A8079", padding: { top: 3, right: 0, bottom: 0, left: 0 } }),
        ]),
        column("sys_header_meta", "33.33%", [
          text("sys_booking_ref", "#{{bookingNumber}}", { align: "right", fontSize: 12, fontWeight: 700, color: profile.accent, blockBackgroundColor: profile.soft, borderRadius: 999, padding: { top: 7, right: 12, bottom: 7, left: 12 } }),
        ]),
      ]),
      section("sys_hero", "2-3:1-3", { backgroundColor: profile.accent, padding: { top: 26, right: 28, bottom: 26, left: 28 } }, [
        column("sys_hero_copy", "66.66%", [
          heading("sys_heading", headingText, { fontSize: 26, lineHeight: "1.15", fontWeight: 800, color: "#ffffff", padding: { top: 0, right: 10, bottom: 8, left: 0 } }),
          text("sys_intro", paragraph, { fontSize: 14, lineHeight: "1.5", color: "#ffffff", padding: { top: 0, right: 10, bottom: 0, left: 0 } }),
        ]),
        column("sys_hero_qr", "33.33%", [
          image("sys_qr", "{{qrCodeUrl}}", { align: "right", width: 104, alt: "Booking QR code", borderRadius: 8, padding: { top: 2, right: 0, bottom: 8, left: 0 } }),
          text("sys_qr_hint", "Show this at check-in", { align: "right", fontSize: 11, color: "#ffffff", padding: { top: 0, right: 0, bottom: 0, left: 0 } }),
        ]),
      ]),
      section("sys_facts", "3", { backgroundColor: profile.dark, padding: { top: 15, right: 28, bottom: 15, left: 28 } }, [
        column("sys_fact_when", "33.33%", [
          text("sys_fact_when_label", "WHEN", { fontSize: 10, fontWeight: 800, color: "#E8D6C6", padding: { top: 0, right: 8, bottom: 5, left: 0 } }),
          text("sys_fact_when_value", "{{bookingDate}}", { fontSize: 13, fontWeight: 800, color: "#ffffff", padding: { top: 0, right: 8, bottom: 0, left: 0 } }),
        ]),
        column("sys_fact_where", "33.33%", [
          text("sys_fact_where_label", "WHERE", { fontSize: 10, fontWeight: 800, color: "#E8D6C6", padding: { top: 0, right: 8, bottom: 5, left: 0 } }),
          text("sys_fact_where_value", "{{venueName}}", { fontSize: 13, fontWeight: 800, color: "#ffffff", padding: { top: 0, right: 8, bottom: 0, left: 0 } }),
        ]),
        column("sys_fact_total", "33.33%", [
          text("sys_fact_total_label", "TOTAL", { fontSize: 10, fontWeight: 800, color: "#E8D6C6", padding: { top: 0, right: 0, bottom: 5, left: 0 } }),
          text("sys_fact_total_value", "{{totalAmount}}", { fontSize: 13, fontWeight: 800, color: "#ffffff", padding: { top: 0, right: 0, bottom: 0, left: 0 } }),
        ]),
      ]),
      section("sys_main", "1", { backgroundColor: "#ffffff", padding: { top: 24, right: 24, bottom: 22, left: 24 } }, [
        column("sys_main_col", "100%", [
          code("sys_main_card", mainHtml),
          ...(action
            ? [
                button("sys_action", action.label, action.href, {
                  backgroundColor: profile.accent,
                  color: "#ffffff",
                  align: "left",
                  fontSize: 13,
                  paddingY: 11,
                  padding: { top: 16, right: 0, bottom: 4, left: 0 },
                }),
              ]
            : []),
          divider("sys_divider", { color: "#ECE7E1", height: 1, padding: { top: 20, right: 0, bottom: 16, left: 0 } }),
          text("sys_support", "Need help? Contact us at <a href=\"mailto:{{locationEmail}}\">{{locationEmail}}</a> or {{locationPhone}}.", {
            fontSize: 13,
            color: "#8A8079",
            lineHeight: "1.5",
            padding: { top: 0, right: 0, bottom: 0, left: 0 },
          }),
        ]),
      ]),
      section("sys_footer", "1", { backgroundColor: "#FBF7F2", padding: { top: 20, right: 24, bottom: 22, left: 24 } }, [
        column("sys_footer_col", "100%", [
          footer("sys_footer_text", "{{venueName}}<br>{{locationAddress}}<br>{{locationPhone}} {{locationEmail}}<br><br>Powered by Movira CRM", {
            align: "left",
            fontSize: 12,
            color: "#8A8079",
            lineHeight: "1.6",
          }),
        ]),
      ]),
    ],
  };
}

function collectTokens(value, out = new Set()) {
  if (value == null) return out;
  if (typeof value === "string") {
    let match;
    while ((match = TOKEN_RE.exec(value)) !== null) out.add(match[1]);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectTokens(item, out));
    return out;
  }
  if (typeof value === "object") {
    Object.values(value).forEach((item) => collectTokens(item, out));
  }
  return out;
}

function collectTransactionalVariables(row, design) {
  return Array.from(collectTokens([row.subject, row.body, row.plainText, design])).sort();
}

function buildTransactionalPlainText(row = {}) {
  const defaults = parseJson(row.defaults);
  if (row.family === "saas") {
    return [
      defaults.heading || row.name || "Movira SaaS update",
      "",
      String(defaults.paragraph || "Hi {{guestName}}, here is your Movira SaaS update.")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, ""),
      "",
      "Park: {{venueName}}",
      "Organization: {{organizationName}}",
      "Invoice: {{invoiceNumber}}",
      "Status: {{status}}",
      "Amount due: {{amountDueLabel}}",
      "Due date: {{dueDate}}",
      "Payment link: {{paymentLink}}",
      "Login URL: {{loginUrl}}",
    ].join("\n");
  }
  return [
    defaults.heading || row.name || "Update from {{venueName}}",
    "",
    String(defaults.paragraph || "Hi {{guestName}}, here are your details.").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""),
    "",
    "Booking: {{bookingNumber}}",
    "Date: {{bookingDate}}",
    "Venue: {{venueName}}",
    "Total: {{totalAmount}}",
  ].join("\n");
}

module.exports = {
  buildTransactionalSystemDesign,
  buildTransactionalPlainText,
  collectTransactionalVariables,
};
