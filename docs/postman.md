# Postman

Import this collection:

```txt
movira-crm/postman-collection.json
```

Collection variable:

```txt
baseUrl = http://localhost:4100
```

Recommended local order:

1. Run migrations with `npm run migrate`.
2. Start the service with `npm run dev`.
3. Call `GET /health`.
4. Call `GET /api/transactional/templates?channel=email`.
5. Call `POST /api/transactional/messages - Booking Confirmation`.

If SQS queue URLs are not configured, message creation still works and the expected status is `enqueue_skipped`.

Useful CRM settings routes:

```txt
GET    /api/settings/email
POST   /api/settings/email/domains
POST   /api/settings/email/domains/:id/verify
POST   /api/settings/email/providers
POST   /api/settings/email/providers/:id/test
DELETE /api/settings/email/providers/:id
```
