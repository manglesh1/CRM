# Notification Events

The notifications module is the **event-driven routing layer** between producer systems (booking, payment, waiver flows in aeroSportsAdmin) and the transactional send pipeline. It decouples *what happened* (an event) from *what to send* (a template).

## Why this layer exists

Without bindings, every caller hard-codes a template slug:

```js
engage.send({ template: "bookingConfirmation", ... });
```

Switching to a new template, A/B testing, or per-location overrides requires deploys. The bindings layer makes it a DB row:

| event_type | channel | location_id | template_key | active |
|---|---|---|---|---|
| booking.confirmed | email | NULL (default) | bookingConfirmation | true |
| booking.confirmed | email | 12 (Mumbai) | bookingConfirmation_hi | true |
| payment.received | email | NULL | payment-receipt | true |

Admin UI flips dropdowns; code does not change.

## Concepts

| Concept | Storage | Purpose |
|---|---|---|
| Event registry | code (`src/modules/notifications/eventRegistry.js`) | Closed set of event types; unknown events rejected at ingest |
| Bindings table | `crm_event_template_bindings` | Maps `eventType + channel + locationId` → `templateKey` |
| Variable map | `bindings.variableMap` JSONB | Optional rename from payload paths to template variable names |
| Event log | `crm_transactional_messages` | Every accepted event produces one row |

### Lookup precedence

When an event arrives with `locationId=12`, the binding lookup tries:

1. `eventType + channel + locationId=12 + active=true`
2. Fallback: `eventType + channel + locationId=NULL + active=true` (the default)

If neither matches → HTTP 422 `binding_not_found`.

## Registered events (current)

| Event type | Source resource | Required payload fields |
|---|---|---|
| `booking.confirmed` | booking | `guestName`, `bookingNumber`, `venueName` |
| `payment.received` | payment | `guestName`, `bookingNumber`, `venueName`, `amountPaid` |
| `payment.link.requested` | payment | `guestName`, `bookingNumber`, `venueName`, `paymentLink`, `amountDue` |
| `waiver.link.requested` | waiver | `guestName`, `venueName`, `waiverLink` |
| `waiver.completed` | waiver | `guestName`, `venueName` |
| `waiver.expiring` | waiver | `guestName`, `venueName`, `expiryDate` |

Adding a new event = one entry in `eventRegistry.js`.

## REST API

### Ingest event

```
POST /api/notifications/events
```

Request:

```json
{
  "eventType": "booking.confirmed",
  "locationId": 12,
  "recipient": { "email": "guest@example.com", "name": "Aarav" },
  "payload": {
    "guestName": "Aarav",
    "bookingNumber": "BK-991",
    "venueName": "Movira Mumbai",
    "bookingDate": "2026-05-20",
    "totalAmount": "$120.00",
    "paymentLink": "https://..."
  },
  "attachments": [
    { "filename": "invoice.pdf", "content": "<base64>", "contentType": "application/pdf", "encoding": "base64" }
  ],
  "idempotencyKey": "booking.confirmed:BK-991",
  "priority": "high"
}
```

Response (202):

```json
{
  "success": true,
  "duplicate": false,
  "data": {
    "messageId": "65bfeb67-0737-42d4-9c0d-3c4194955828",
    "status": "queued",
    "eventType": "booking.confirmed",
    "templateKey": "bookingConfirmation",
    "bindingId": "dff93be4-b880-404a-a781-390cb48ace9f"
  }
}
```

Duplicate (same `idempotencyKey`): HTTP 200 with `duplicate: true` and the existing `messageId`.

### List events (registry)

```
GET /api/notifications/events
```

Returns every event type the system knows about with description + sample payload.

### Bindings CRUD

```
GET    /api/notifications/bindings                    List (filter: eventType, channel, locationId)
GET    /api/notifications/bindings/:id                Get one
POST   /api/notifications/bindings                    Create
PATCH  /api/notifications/bindings/:id                Update
DELETE /api/notifications/bindings/:id                Delete
```

Body for create/update:

```json
{
  "eventType": "booking.confirmed",
  "channel": "email",
  "locationId": null,
  "templateKey": "bookingConfirmation",
  "priority": "high",
  "variableMap": { "bookingNumber": "bookingId" },
  "isActive": true,
  "notes": "Default booking confirmation"
}
```

Unique constraint: `(eventType, channel, locationId)`. Duplicate → HTTP 409.

## Variable mapping

By default, payload keys map 1:1 to template variables:

```
payload.guestName     →  {{guestName}}
payload.bookingNumber →  {{bookingNumber}}
```

If a template uses a different name, set `variableMap`:

```json
{ "bookingNumber": "bookingId" }
```

Means: when rendering, `{{bookingNumber}}` reads from `payload.bookingId` instead. Dot paths supported (`"customerName": "guest.fullName"`).

## Admin UI

Manage bindings at:

```
/crm/settings?channel=notifications
```

Features:

- Registered events panel (collapsible reference)
- Bindings table — event, location, template, priority, active toggle
- "+ Add Binding" modal
- Per-binding edit / delete
- Active toggle persists immediately

Activity also recorded to **audit log** (`crm_audit_logs`) — every create/update/delete has an entry tagged `entityType=notification_binding`.

## Future channels

The `channel` column accepts `email` only today. When SMS/WhatsApp/Push providers ship:

1. Add channel to `ALLOWED_CHANNELS` in `src/modules/notifications/validation.js`
2. Dispatcher gets a provider entry in `messaging-core/providers/`
3. Same bindings UI starts serving SMS/WhatsApp bindings — no schema change needed

## Local testing

```bash
curl -X POST http://localhost:4100/api/notifications/events \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "booking.confirmed",
    "locationId": 1,
    "recipient": {"email": "test@example.com"},
    "payload": {"guestName": "Test", "bookingNumber": "BK-1", "venueName": "Test"},
    "idempotencyKey": "test-1"
  }'
```

Without SQS, the row is created with `status: enqueue_skipped` — the routing/binding/template lookup still runs and is verifiable in the DB.
