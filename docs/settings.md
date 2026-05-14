# Admin UI: CRM Settings

CRM settings lives at `/crm/settings` in `my-admin-app`. The page is a **channel-pill hub** — each pill represents a communication channel (or cross-channel routing layer) with its own configuration UI.

```
/crm/settings?channel=<key>&tab=<sub-tab>
```

URL state syncs with the active channel pill and the sub-tab inside it.

## Pills (current)

| Pill | Component | Status | Purpose |
|---|---|---|---|
| Notification Events | `NotificationBindingsView` | ✅ Built | Event→template routing (cross-channel) |
| Email Setting | `EmailChannel` | ✅ Built | Providers, sending domains, route assignments, reply/forward, analytics |
| Phone Setting | Coming Soon | 🟡 Stub | SMS providers (Twilio, SNS), sender numbers, opt-in/out |
| WhatsApp Setting | Coming Soon | 🟡 Stub | WhatsApp Business API, phone verification, message templates |

Adding a new pill = append an entry to `CHANNELS` in [`src/pages/crm/CrmSettings.jsx`](../../../my-admin-app/src/pages/crm/CrmSettings.jsx).

## Notification Events pill

The most important "cross-channel" pill. Documented separately in [notification-events.md](notification-events.md).

URL: `/crm/settings?channel=notifications`

Shows:

- Registered events list (collapsible)
- Bindings table — event → template per location with active toggle
- Add binding modal — pick event, channel, template, location override, priority

This pill lives in settings (not marketing) because bindings are **channel-agnostic** by design — same event can fire email today + SMS tomorrow without UI changes.

## Email Setting pill

URL: `/crm/settings?channel=email&tab=<sub-tab>`

Sub-tabs inside:

### Providers

- Add SES / SMTP / SendGrid credentials
- Test connectivity before save
- Activate / deactivate / set priority
- Mark as default for sending

API: `GET/POST/PATCH/DELETE /api/settings/email/providers`

### Domains

- Add sending domain
- Verify DNS records (TXT + CNAME for DKIM/SPF/DMARC)
- Set default sending domain
- View verification status

API: `GET/POST /api/settings/email/domains`, `POST /api/settings/email/domains/:id/verify`

### Routes

8 use-case routes that map traffic to a sending domain:

- `calendar`
- `payments`
- `bulk_email`
- `campaign`
- `workflow`
- `transactional`
- `notification`
- `customer_support`

Each route can split traffic across multiple domains (per-domain percentage). Domain warmup is tracked per-route.

API: `GET /api/settings/email/routes`, `PATCH /api/settings/email/routes/:id`

### Reply / Forward

Per-location settings:

- BCC for outbound mail
- Reply-to address override
- Forward-to inbox

API: `GET/PUT /api/settings/email/reply-forward`

### Analytics

Aggregated email metrics per domain or template (bounce rate, complaint rate, delivery rate). Currently lightly built — extend as needed.

API: `GET /api/settings/email/analytics`

## Phone Setting (placeholder)

When SMS support is added:

1. Build `src/pages/crm/settings/PhoneChannel.jsx` (mirror EmailChannel structure)
2. Replace the `ComingSoon` component in `CHANNELS` array
3. Backend: add `/api/settings/phone/*` routes
4. Add SMS to `ALLOWED_CHANNELS` in notifications validation
5. Provider abstraction in `messaging-core/providers/` (Twilio + SNS)

## WhatsApp Setting (placeholder)

Same pattern as Phone. Meta Cloud API integration.

## Auth and access control

**Important known gap**: settings APIs do NOT currently enforce auth. The whole CRM service is auth-less in dev — see [system-design.md](system-design.md). When adding auth:

- Settings + bindings should be admin-only
- Per-location scoping should be enforced via `locationId` claim on the JWT/session
- Audit log already captures actor when `req.user` is set, so the audit trail will fill out automatically
