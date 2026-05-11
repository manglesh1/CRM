# Transactional Orchestrators

Transactional orchestrators are channel-aware but operationally focused.

Examples:

- `email`: booking confirmations, receipts, payment links, waiver links through SES.
- `sms`: urgent operational notifications through SMS provider.
- `whatsapp`: approved operational templates and service-window messages.
- `push`: app/device notifications.

Rules:

- Transactional orchestration never uses marketing queues.
- Transactional orchestration requires idempotency.
- Marketing unsubscribe does not block transactional messages.
- Hard bounce, complaint, admin block, and invalid recipient still block sends.
