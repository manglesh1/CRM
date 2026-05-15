const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

const FAMILY_PROFILES = {
  booking: { accent: "#EF4444", dark: "#2F2F31", soft: "#FFF1F2", label: "Booking" },
  payment: { accent: "#0F766E", dark: "#123C3A", soft: "#ECFDF5", label: "Payment" },
  waiver: { accent: "#F04444", dark: "#332323", soft: "#FFF1F2", label: "Waiver" },
  membership: { accent: "#2563EB", dark: "#172554", soft: "#EFF6FF", label: "Membership" },
  giftcard: { accent: "#B45309", dark: "#3B2A16", soft: "#FFF7ED", label: "Gift Card" },
  guestList: { accent: "#7C3AED", dark: "#2E1A47", soft: "#F5F3FF", label: "Guest List" },
  simple: { accent: "#334155", dark: "#1F2937", soft: "#F8FAFC", label: "Notice" },
  system: { accent: "#334155", dark: "#1F2937", soft: "#F8FAFC", label: "Notice" },
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
      .txn-card{border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;background:#ffffff;}
      .txn-row{border-bottom:1px solid #eef2f7;}
      .txn-label{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;font-weight:700;}
      .txn-value{font-size:14px;color:#111827;font-weight:700;line-height:1.45;}
      .txn-muted{font-size:12px;color:#64748b;line-height:1.55;}
      .txn-total{font-size:24px;color:#111827;font-weight:800;line-height:1;}
      .txn-pill{display:inline-block;background:${profile.soft};color:${profile.accent};border-radius:999px;padding:5px 10px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;}
      .txn-link{color:${profile.accent};text-decoration:underline;font-weight:700;}
    </style>
  `;
}

function buildSummaryCard(profile, title, rowsHtml) {
  return `
    ${styleVars(profile)}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="txn-card">
      <tr>
        <td style="padding:16px 18px;background:${profile.soft};">
          <span class="txn-pill">${profile.label}</span>
          <h2 style="margin:10px 0 0;font-size:22px;line-height:1.2;color:#111827;">${title}</h2>
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
        <td style="padding:16px 18px;">
          <div class="txn-label">Booking ID</div>
          <div class="txn-value">{{bookingNumber}}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 18px;">
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
        <td style="padding:16px 18px;">
          <div class="txn-label">${isLink ? "Amount due" : "Amount paid"}</div>
          <div class="txn-total">${isLink ? "{{amountDue}}" : "{{amountPaid}}"}</div>
          <div class="txn-muted" style="margin-top:6px;">Booking {{bookingNumber}} at {{venueName}}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 18px;">
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
        <td style="padding:16px 18px;">
          <div class="txn-label">Guest</div>
          <div class="txn-value">{{guestName}}</div>
          <div class="txn-muted" style="margin-top:6px;">{{venueName}}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 18px;">
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
        <td style="padding:16px 18px;">
          <div class="txn-label">Member</div>
          <div class="txn-value">{{guestName}}</div>
          <div class="txn-muted" style="margin-top:6px;">{{membershipName}}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 18px;">
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
        <td style="padding:16px 18px;">
          <div class="txn-label">Guest</div>
          <div class="txn-value">{{guestName}}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 18px;">
          <div class="txn-label">Reference</div>
          <div class="txn-value">{{bookingNumber}}</div>
          <div class="txn-muted" style="margin-top:8px;">{{venueName}}</div>
        </td>
      </tr>
    `
  );
}

function actionFor(row) {
  const key = row.key;
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
      contentWidth: 640,
      backgroundColor: "#EEF2F7",
      bodyColor: "#ffffff",
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: 16,
      textColor: "#111827",
      headingColor: "#111827",
      linkColor: profile.accent,
      buttonColor: profile.accent,
      dividerColor: "#E5E7EB",
      customCss:
        "@media only screen and (max-width:480px){.txn-total{font-size:22px!important}.txn-card{border-radius:0!important}}",
    },
    sections: [
      section("sys_header", "2-3:1-3", { backgroundColor: "#ffffff", padding: { top: 22, right: 28, bottom: 18, left: 28 } }, [
        column("sys_header_brand", "66.66%", [
          text("sys_brand", "{{venueName}}", { fontSize: 18, fontWeight: 800, color: "#111827", padding: { top: 0, right: 0, bottom: 0, left: 0 } }),
          text("sys_address", "{{locationAddress}}", { fontSize: 12, color: "#64748B", padding: { top: 4, right: 0, bottom: 0, left: 0 } }),
        ]),
        column("sys_header_meta", "33.33%", [
          text("sys_booking_ref", "#{{bookingNumber}}", { align: "right", fontSize: 12, color: "#475569", blockBackgroundColor: "#F8FAFC", borderRadius: 999, padding: { top: 8, right: 12, bottom: 8, left: 12 } }),
        ]),
      ]),
      section("sys_hero", "2-3:1-3", { backgroundColor: profile.accent, padding: { top: 34, right: 34, bottom: 34, left: 34 } }, [
        column("sys_hero_copy", "66.66%", [
          heading("sys_heading", headingText, { fontSize: 38, lineHeight: "1.05", fontWeight: 800, color: "#ffffff", padding: { top: 0, right: 10, bottom: 12, left: 0 } }),
          text("sys_intro", paragraph, { fontSize: 15, lineHeight: "1.55", color: "#ffffff", padding: { top: 0, right: 10, bottom: 0, left: 0 } }),
        ]),
        column("sys_hero_qr", "33.33%", [
          image("sys_qr", "{{qrCodeUrl}}", { align: "right", width: 128, alt: "Booking QR code", borderRadius: 8, padding: { top: 2, right: 0, bottom: 10, left: 0 } }),
          text("sys_qr_hint", "Show this at check-in", { align: "right", fontSize: 12, color: "#ffffff", padding: { top: 0, right: 0, bottom: 0, left: 0 } }),
        ]),
      ]),
      section("sys_facts", "3", { backgroundColor: profile.dark, padding: { top: 20, right: 34, bottom: 20, left: 34 } }, [
        column("sys_fact_when", "33.33%", [
          text("sys_fact_when_label", "WHEN", { fontSize: 10, fontWeight: 800, color: "#CBD5E1", padding: { top: 0, right: 8, bottom: 6, left: 0 } }),
          text("sys_fact_when_value", "{{bookingDate}}", { fontSize: 14, fontWeight: 800, color: "#ffffff", padding: { top: 0, right: 8, bottom: 0, left: 0 } }),
        ]),
        column("sys_fact_where", "33.33%", [
          text("sys_fact_where_label", "WHERE", { fontSize: 10, fontWeight: 800, color: "#CBD5E1", padding: { top: 0, right: 8, bottom: 6, left: 0 } }),
          text("sys_fact_where_value", "{{venueName}}", { fontSize: 14, fontWeight: 800, color: "#ffffff", padding: { top: 0, right: 8, bottom: 0, left: 0 } }),
        ]),
        column("sys_fact_total", "33.33%", [
          text("sys_fact_total_label", "TOTAL", { fontSize: 10, fontWeight: 800, color: "#CBD5E1", padding: { top: 0, right: 0, bottom: 6, left: 0 } }),
          text("sys_fact_total_value", "{{totalAmount}}", { fontSize: 14, fontWeight: 800, color: "#ffffff", padding: { top: 0, right: 0, bottom: 0, left: 0 } }),
        ]),
      ]),
      section("sys_main", "1", { backgroundColor: "#ffffff", padding: { top: 30, right: 34, bottom: 28, left: 34 } }, [
        column("sys_main_col", "100%", [
          code("sys_main_card", mainHtml),
          ...(action
            ? [
                button("sys_action", action.label, action.href, {
                  backgroundColor: profile.accent,
                  color: "#ffffff",
                  align: "left",
                  padding: { top: 18, right: 0, bottom: 4, left: 0 },
                }),
              ]
            : []),
          divider("sys_divider", { color: "#E5E7EB", height: 1, padding: { top: 24, right: 0, bottom: 18, left: 0 } }),
          text("sys_support", "Need help? Contact us at <a href=\"mailto:{{locationEmail}}\">{{locationEmail}}</a> or {{locationPhone}}.", {
            fontSize: 13,
            color: "#64748B",
            lineHeight: "1.55",
            padding: { top: 0, right: 0, bottom: 0, left: 0 },
          }),
        ]),
      ]),
      section("sys_footer", "1", { backgroundColor: "#F8FAFC", padding: { top: 24, right: 34, bottom: 28, left: 34 } }, [
        column("sys_footer_col", "100%", [
          footer("sys_footer_text", "{{venueName}}<br>{{locationAddress}}<br>{{locationPhone}} {{locationEmail}}<br><br>Powered by Movira CRM", {
            align: "left",
            fontSize: 12,
            color: "#64748B",
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
