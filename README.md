# Movira CRM

Movira CRM is the communication service for Movira.

It owns outbound email, SMS, WhatsApp, push, CRM contacts, marketing campaigns, journeys, provider webhooks, delivery events, suppression, analytics, and inbox/conversation workflows.

The service keeps **transactional** and **marketing** messaging separate from day one:

- Transactional messaging supports booking confirmations, receipts, payment links, waiver links, OTPs, and operational notifications.
- Marketing CRM supports contacts, segments, broadcasts, campaigns, journeys, inbox, automations, and consent-aware messaging.

Frontend ownership:

- Transactional UI stays in `my-admin-app`.
- Marketing/CRM UI is portable and should later move to a dedicated CRM frontend.

See [docs/system-design.md](docs/system-design.md).

## First API Contract

Transactional message enqueue:

- [docs/api/transactional-messages.md](docs/api/transactional-messages.md)
- [docs/transactional-template-catalog.md](docs/transactional-template-catalog.md)

Initial migration:

- [migrations/20260507000100-create-transactional-messages.js](migrations/20260507000100-create-transactional-messages.js)

Development startup:

```bash
npm run dev
```

`predev` runs migrations and seeders before starting the service.

Postman:

- [postman-collection.json](postman-collection.json)
- [docs/postman.md](docs/postman.md)
