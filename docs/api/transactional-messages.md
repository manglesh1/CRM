# Transactional Messages API

The transactional API handles direct message creation when a template key is already known. Most callers should use the **higher-level event ingestion** instead: see [notification-events.md](../notification-events.md).

## Endpoints overview

```
POST   /api/transactional/messages          Direct create (caller knows templateKey)
GET    /api/transactional/templates         List templates
GET    /api/transactional/templates/:id     Get one template
POST   /api/transactional/templates         Create custom template
PATCH  /api/transactional/templates/:id     Update template
DELETE /api/transactional/templates/:id     Delete (non-system only)
POST   /api/transactional/templates/:id/clone        Clone
POST   /api/transactional/templates/:id/test-send    Send a test
POST   /api/transactional/templates/render            Render a draft design with sample data
```

## Create message (low-level)

```
POST /api/transactional/messages
```

Most callers should prefer `POST /api/notifications/events` so they don't need to know template keys. Use this endpoint only when:

- You're inside CRM itself (e.g. the events service calls into this)
- You're scripting a one-off send with a known template

### Request

```json
{
  "locationId": 12,
  "sourceSystem": "aeroSportsAdmin",
  "sourceEventType": "booking.confirmation",
  "sourceResourceType": "booking",
  "sourceResourceId": "991",
  "channel": "email",
  "recipientAddress": "guest@example.com",
  "templateKey": "bookingConfirmation",
  "payload": {
    "guestName": "Aarav",
    "bookingNumber": "BK-991",
    "venueName": "Movira London"
  },
  "attachments": [
    {
      "filename": "invoice-BK-991.pdf",
      "content": "<base64>",
      "contentType": "application/pdf",
      "encoding": "base64"
    }
  ],
  "priority": "high",
  "idempotencyKey": "booking.confirmation:991"
}
```

### Required fields

- `locationId`
- `sourceEventType`
- `channel`
- `recipientAddress`
- `templateKey`
- `idempotencyKey`

### Channel validation

- `email`: recipient must be a valid email address
- `sms` / `whatsapp`: recipient must be E.164 (e.g. `+14165551234`) — providers not yet wired
- `push`: recipient must be present — providers not yet wired

### Priority

- `critical` / `high` → routes to `transactional-critical` SQS queue
- `normal` → routes to `transactional-default` SQS queue

### Response (202)

```json
{
  "success": true,
  "duplicate": false,
  "data": {
    "id": "0be7f244-6d22-4acb-babc-f14bb36d1918",
    "status": "queued",
    "channel": "email",
    "priority": "high",
    "templateKey": "bookingConfirmation",
    "idempotencyKey": "booking.confirmation:991",
    "enqueue": { "skipped": false, "sqsMessageId": "..." }
  }
}
```

Duplicate `idempotencyKey` → HTTP 200, `duplicate: true`, existing messageId returned.

## Attachments

Attachments are stored on the message row (`attachments` JSONB column) and applied at send time via SES MIME (`SendEmailCommand` with `Content.Raw`).

Per-attachment shape:

```json
{
  "filename": "invoice.pdf",
  "content": "<base64 encoded bytes>",
  "contentType": "application/pdf",
  "encoding": "base64"
}
```

aeroSportsAdmin's [crmNotify helper](../../../aeroSportsAdmin/services/crmNotify/index.js) accepts native `Buffer` content and base64-encodes automatically before calling the API.

**Limits to keep in mind:**

- SES has a 40 MB raw message size limit (after encoding overhead)
- DB JSONB column has practical limits — keep individual attachments small
- For files larger than ~5 MB, consider S3 + a link in the email body instead

## Template CRUD

### List

```
GET /api/transactional/templates?channel=email&includeBindings=true
```

Query params:

- `channel` — defaults to all; pass `email` to filter
- `locationId` — include tenant overrides for this location + system defaults
- `includeBindings` — include `bindings[]` per template showing which events fire it

### Create

```json
POST /api/transactional/templates

{
  "key": "bookingConfirmationVip",
  "name": "VIP Booking Confirmation",
  "channel": "email",
  "editorType": "design",
  "family": "booking",
  "subject": "Your VIP visit at {{venueName}} is confirmed",
  "designJson": { ... },
  "description": "VIP guests booking confirmation",
  "variables": ["guestName", "bookingNumber", "venueName"]
}
```

`key` must be unique per `(locationId, channel)` and alphanumeric with hyphens/underscores. System templates' keys cannot be changed.

### Update / Delete / Clone

```
PATCH  /templates/:id           {body fields to update}
DELETE /templates/:id            System templates protected; templates with active bindings protected
POST   /templates/:id/clone     {key: "new-slug", name: "..."}    optional fields
POST   /templates/:id/test-send  {to, data, subject?}
```

`test-send` uses the stored template, renders with the provided `data`, and sends via SES.

### Render draft

```
POST /api/transactional/templates/render

{
  "name": "Preview",
  "subject": "Welcome {{name}}",
  "editorType": "design",
  "designJson": { ... },
  "data": { "name": "Yogesh" }
}
```

Returns `{ subject, html, text }`. Useful for builder preview before saving.

## Delivery tracking (SES webhooks)

When SES sends an email, it includes `EmailTags`:

```
{ domain: "transactional", message_id: "<uuid>" }
```

Recommended production flow:

```
AWS SES configuration set
  -> SNS topic
  -> SQS queue from SQS_WEBHOOK_EVENTS_URL
  -> npm run worker:webhooks
  -> crm_transactional_delivery_events / crm_marketing_delivery_events
```

The older HTTPS route `POST /api/webhooks/ses` still exists for local tests or direct integrations, but production should prefer SNS → SQS so provider events are not lost if the CRM API is temporarily down.

Customer-owned API providers can also post directly to provider-specific webhook endpoints:

```
SendGrid -> POST /api/webhooks/sendgrid
Mailgun  -> POST /api/webhooks/mailgun
Postmark -> POST /api/webhooks/postmark
```

Movira adds provider metadata when sending (`domain` and `message_id`) so those webhooks can update the right transactional or marketing message. SMTP-only providers can send mail and use Movira open/click tracking, but SMTP does not reliably provide delivery, bounce, or complaint callbacks.

When AWS SES bounces/delivers/etc., it publishes to SNS. SNS sends the notification to the webhook-events SQS queue. The webhook worker reads that queue and calls the same SES handler. The handler:

1. Detects `domain` tag → routes to transactional or marketing pipeline
2. Looks up the message by `message_id` tag (or `providerMessageId` fallback)
3. Updates `crm_transactional_messages`:
   - `delivered` → `status: delivered`, `deliveredAt` set
   - `bounce` → `status: failed`, `lastError: "bounce: <reason>"`, `failedAt` set
4. Inserts a row into `crm_transactional_delivery_events` with the full SES payload

Marketing path is similar but uses `crm_marketing_messages` and `crm_marketing_delivery_events`.

Required runtime:

```
SQS_WEBHOOK_EVENTS_URL=https://sqs.<region>.amazonaws.com/<account>/movira-ses-events
npm run worker:webhooks
```

Local development starts this worker automatically through `npm run dev`.

## Audit logging

Every template + binding change is recorded in `crm_audit_logs`:

| Entity type | Actions logged |
|---|---|
| `transactional_template` | `template.create`, `template.update`, `template.delete`, `template.clone` |
| `notification_binding` | `binding.create`, `binding.update`, `binding.delete` |

Entry includes: actor (when available), entity name, changed fields, metadata.

## Local development

Without SQS URLs configured, the row is created with `status: enqueue_skipped`. This is by design — the binding lookup, template resolution, variable mapping, and attachment storage all happen and are inspectable in DB. Add `SQS_TRANSACTIONAL_CRITICAL_URL` + `SQS_TRANSACTIONAL_DEFAULT_URL` to actually enqueue, plus run `npm run worker:transactional` for the worker to dispatch.

```bash
npm run migrate
npm run seed       # loads 33 system templates + 6 default bindings
npm run dev        # API
npm run worker:transactional   # worker (separate terminal)
```

## Related docs

- [Notification events (the higher-level routing layer)](../notification-events.md)
- [Template catalog (all 33 system templates)](../transactional-template-catalog.md)
- [Marketing module](../marketing.md)
- [Admin UI structure](../settings.md)
