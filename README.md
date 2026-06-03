# Movira CRM

Movira CRM is the **communications service** for Movira. It owns:

- **Transactional messaging** — booking confirmations, receipts, payment links, waivers, OTPs, operational notifications.
- **Marketing messaging** — campaigns, broadcasts, templates, audience segments, journeys (roadmap), suppression, delivery analytics.
- **Notification routing** — event→template bindings that let admins switch which template fires for which event without code changes.
- **Provider integrations** — SES (email today), SMS/WhatsApp/Push roadmap-only.
- **Webhooks** — SES bounce/complaint/delivery events routed to the correct domain (transactional or marketing) and persisted as delivery events.
- **Audit log** — every template, binding, and campaign change is recorded.

Transactional and marketing live as **separate tables** but share **one builder UI** (in `my-admin-app`).

## Database boundary

`movira-crm` must use its own Postgres database, separate from the booking/core database.

Recommended production layout:

```
movira-core-db  -> bookings, payments, schedules, waivers, POS, staff
movira-crm-db   -> contacts, segments, email, automations, audit logs
```

Use `MOVIRA_CRM_DATABASE_URL` for this service. Do not use generic `DATABASE_URL`, `DB_NAME`, or `DB_HOST` keys here; those names can collide with the booking/core app and accidentally point CRM migrations at the wrong database.

CRM queue work is stored in `crm_queue_jobs` with separate queues:

- `contacts` -> CSV/contact import jobs, async advanced-filter count jobs, large bulk contact actions, and queued CSV exports
- `segments` -> dynamic segment recalculation jobs
- `automation` -> workflow trigger execution jobs

Run each worker independently so high import load does not block segment refreshes or automation execution.
Advanced-filter exact totals are cached in `crm_contact_filter_counts`; the customers grid previews the first page immediately and the contacts worker calculates the exact matching count asynchronously. Large bulk actions are tracked in `crm_contact_bulk_action_jobs` and executed by the contacts worker in batches. Large exports are tracked in `crm_contact_export_jobs`; configure `S3_CONTACT_EXPORTS_BUCKET` for private S3 storage, otherwise files are written to `CRM_CONTACT_EXPORT_DIR` or the OS temp directory locally.

## Architecture in 1 minute

```
Producer (aeroSportsAdmin booking/payment/waiver controllers)
   │
   ▼ HTTP POST  (services/crmNotify in aeroSportsAdmin)
POST /api/notifications/events  ──► movira-crm
   │
   ▼ binding lookup (event_template_bindings)
templateKey resolved
   │
   ▼ transactional service.enqueueMessage
crm_transactional_messages row inserted (status: queued)
   │
   ▼ SQS enqueue
transactional worker
   │
   ▼ render + dispatch
SES sendEmail (Raw if attachments) with EmailTags {domain, message_id}
   │
   ▼ SES events → SNS → POST /api/webhooks/ses
webhook handler detects domain → updates transactional OR marketing message + delivery event
```

## Documentation map

| Topic | File |
|---|---|
| System design overview | [docs/system-design.md](docs/system-design.md) |
| Notification events + bindings (the routing layer) | [docs/notification-events.md](docs/notification-events.md) |
| Transactional messages API | [docs/api/transactional-messages.md](docs/api/transactional-messages.md) |
| All 33 system templates + families | [docs/transactional-template-catalog.md](docs/transactional-template-catalog.md) |
| Marketing module overview | [docs/marketing.md](docs/marketing.md) |
| Marketing template builder | [docs/marketing-email-builder-platform.md](docs/marketing-email-builder-platform.md) |
| Admin UI structure (CRM settings + tabs) | [docs/settings.md](docs/settings.md) |
| Postman collection | [docs/postman.md](docs/postman.md) |

## Quick start

```bash
npm install
npm run migrate     # also runs seeders
npm run dev         # starts API on PORT from .env (default 4100)
npm run worker:transactional  # in a second terminal
npm run worker:marketing      # in a third terminal
npm run worker:contacts       # CRM contact import jobs
npm run worker:segments       # CRM segment recalculation jobs
npm run worker:automation     # CRM automation trigger jobs
```

`predev` script runs `migrate && seed` automatically when you `npm run dev`.

## Environment variables

| Var | Required | Purpose |
|---|---|---|
| `MOVIRA_CRM_DATABASE_URL` | prod | Dedicated Movira CRM Postgres connection string |
| `MOVIRA_CRM_DB_SSL` | prod | Enables/disables SSL for the CRM database connection |
| `MOVIRA_CRM_DB_USERNAME` | dev only | CRM DB username when no URL is provided |
| `MOVIRA_CRM_DB_PASSWORD` | dev only | CRM DB password when no URL is provided |
| `MOVIRA_CRM_DB_NAME` | dev only | CRM DB name when no URL is provided |
| `MOVIRA_CRM_DB_HOST` | dev only | CRM DB host when no URL is provided |
| `MOVIRA_CRM_DB_PORT` | dev only | CRM DB port when no URL is provided |
| `PORT` | no | API port (default 4100) |
| `AWS_REGION` | no | AWS region for SQS/SES (default us-east-1) |
| `AWS_*` SQS URLs | prod | Transactional + marketing queue URLs |
| `SES_DEFAULT_FROM` | prod | Default from address |
| `SES_TRANSACTIONAL_CONFIG_SET` | prod | SES transactional configuration set |
| `SES_MARKETING_CONFIG_SET` | prod | SES marketing configuration set |
| `AWS_SES_REGION` | prod | SES region |
| `CRM_QUEUE_WORKER_POLL_MS` | no | DB-backed CRM queue worker poll interval |
| `CRM_QUEUE_WORKER_BATCH_SIZE` | no | Jobs claimed per CRM queue worker poll |

Without SQS URLs, message rows are created with status `enqueue_skipped` — handy for local dev.

## Frontend

Both transactional and marketing UIs live in [my-admin-app](../my-admin-app/):

- `/crm/marketing?tab=templates&templateType=transactional` — transactional templates (33 system + custom variants), family-grouped
- `/crm/marketing?tab=templates&templateType=marketing` — marketing templates
- `/crm/marketing?tab=campaigns` — marketing campaigns
- `/crm/settings?channel=notifications` — event→template bindings (the routing layer)
- `/crm/settings?channel=email` — email provider/domain/route settings
- `/crm/marketing/templates/:id/builder?type=transactional` — visual builder (works for both types)

## Calling from aeroSportsAdmin

Producer code uses the [crmNotify helper](../aeroSportsAdmin/services/crmNotify/index.js):

```js
const crm = require("./services/crmNotify");

await crm.send({
  template: "bookingConfirmation",       // legacy slug; helper maps to eventType
  to: guest.guestEmail,
  data: { guestName, bookingNumber, venueName, ... },
  attachments: [{ filename: "invoice.pdf", content: pdfBuffer, contentType: "application/pdf" }],
  idempotencyKey: `booking.confirmed:${bookingId}`,
  venueId: location.locationId,
  priority: crm.PRIORITY.HIGH,
});
```

See [aeroSportsAdmin/docs/crmNotify.md](../aeroSportsAdmin/docs/crmNotify.md).
