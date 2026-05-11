# Transactional Messages API

## Create Message

```txt
POST /api/transactional/messages
```

Creates durable transactional message state and enqueues a small reference to SQS.

## Request

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
  "priority": "high",
  "idempotencyKey": "booking.confirmation:991"
}
```

## Required Fields

- `locationId`
- `sourceEventType`
- `channel`
- `recipientAddress`
- `templateKey`
- `idempotencyKey`

## Template APIs

```txt
GET /api/transactional/templates
GET /api/transactional/templates/:id
```

Optional filters:

- `locationId`
- `channel`

System template variables are documented in [../transactional-template-catalog.md](../transactional-template-catalog.md).

## Channel Validation

- `email`: recipient must be an email address.
- `sms`: recipient must be E.164, for example `+14165551234`.
- `whatsapp`: recipient must be E.164.
- `push`: recipient must be present.

## Priority

Transactional priorities:

- `critical`
- `high`
- `normal`

`critical` and `high` route to the transactional critical SQS queue. `normal` routes to the transactional default SQS queue.

## Response

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
    "enqueue": {
      "skipped": false,
      "sqsMessageId": "..."
    }
  }
}
```

If the same `idempotencyKey` is used again, the API returns the existing message with `duplicate: true`.

## Local Development

If SQS URLs are missing, the row is still created and marked `enqueue_skipped`. This keeps local development possible without AWS credentials. Production must configure real SQS URLs.

Run the Sequelize migration before testing:

```bash
npm run migrate
```

Run the transactional worker:

```bash
npm run worker:transactional
```
