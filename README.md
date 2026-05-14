# Movira CRM

Movira CRM is the **communications service** for Movira. It owns:

- **Transactional messaging** — booking confirmations, receipts, payment links, waivers, OTPs, operational notifications.
- **Marketing messaging** — campaigns, broadcasts, templates, audience segments, journeys (roadmap), suppression, delivery analytics.
- **Notification routing** — event→template bindings that let admins switch which template fires for which event without code changes.
- **Provider integrations** — SES (email today), SMS/WhatsApp/Push roadmap-only.
- **Webhooks** — SES bounce/complaint/delivery events routed to the correct domain (transactional or marketing) and persisted as delivery events.
- **Audit log** — every template, binding, and campaign change is recorded.

Transactional and marketing live as **separate tables** but share **one builder UI** (in `my-admin-app`).

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
```

`predev` script runs `migrate && seed` automatically when you `npm run dev`.

## Environment variables

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `PORT` | no | API port (default 4100) |
| `AWS_REGION` | no | AWS region for SQS/SES (default us-east-1) |
| `AWS_*` SQS URLs | prod | Transactional + marketing queue URLs |
| `AWS_SES_DEFAULT_FROM` | prod | Default from address |
| `AWS_SES_*_CONFIG_SET` | prod | SES configuration sets |

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
