# Transactional Template Catalog

System templates are seeded into `crm_transactional_templates` with `isSystem=true`. Tenants clone them to create custom variants. System templates **cannot be deleted** (toggle `isActive=false` instead) and their `key` is immutable.

**33 system templates** across **7 families**, all email channel, recovered from the original engage system catalog.

Template interpolation uses Mustache-style tokens:

```
{{guestName}}
{{bookingNumber}}
{{venueName}}
```

Dot paths supported: `{{guest.firstName}}`.

For visual design mode, the template stores `designJson` (shared block schema with marketing builder) — same renderer in `messaging-core` produces HTML at send time.

## Schema

| Column | Type | Purpose |
|---|---|---|
| `id` | UUID | PK |
| `locationId` | INT | NULL = system default, otherwise tenant override |
| `key` | VARCHAR(150) | Lookup slug used by bindings |
| `channel` | VARCHAR(20) | `email` only today |
| `name` | VARCHAR(180) | Display name in UI |
| `family` | VARCHAR(60) | Grouping (booking, payment, waiver, etc.) |
| `category` | VARCHAR(80) | Legacy field, kept for backward compat |
| `description` | TEXT | What this template is for |
| `subject` | VARCHAR(500) | Email subject (Mustache supported) |
| `body` | TEXT | HTML body (code mode) |
| `editorType` | VARCHAR(20) | `code`, `design`, or `plain` |
| `designJson` | JSONB | When editorType=design — visual builder structure |
| `plainText` | TEXT | Optional plain-text fallback |
| `defaults` | JSONB | Original heading/paragraph/subject from system seed |
| `variables` | JSONB | Array of variable names (auto-extracted) |
| `config` | JSONB | `{ contentType, textFallback, from }` |
| `isSystem` | BOOL | System templates protected from delete + key change |
| `isActive` | BOOL | Soft delete |

## Families (7)

| Family | Count | Used for |
|---|---|---|
| `booking` | 6 | Order confirmations, F&B, reminders, agreements |
| `payment` | 3 | Receipts, payment links, invoices |
| `waiver` | 4 | Waiver request, complete, expiry, reminder |
| `membership` | 12 | Details, failed payments, suspension, renewal |
| `giftcard` | 2 | Received, sent |
| `guestList` | 3 | Update, RSVP confirmed, RSVP reminder |
| `simple` | 3 | Guest deleted, discount code, loyalty reminder |

## Complete template list

### booking (6)

| Key | Name | Description |
|---|---|---|
| `bookingConfirmation` | Order confirmation | Sent to guest when a booking is made |
| `canceled-tentative-booking` | Canceled tentative booking | Sent when a tentative booking auto-cancels due to non-payment |
| `fnb-order-confirmation` | Food and beverage order confirmation | Sent for F&B orders |
| `booking-reminder` | Booking reminder | Pre-visit reminder with useful info |
| `signed-booking-agreement` | Signed booking agreement | After guest signs a booking agreement |
| `booking-agreement` | Booking agreement | Request guest to sign a booking agreement |

### payment (3)

| Key | Name | Description |
|---|---|---|
| `payment-receipt` | Payment receipt | Receipt sent after payment captured |
| `paymentLink` | Payment link | Email containing a Stripe/Razorpay payment link |
| `invoice-email` | Invoice email | Invoice attached from venue manager |

### waiver (4)

| Key | Name | Description |
|---|---|---|
| `waiverLink` | Waiver request | Request guest to sign their waiver |
| `waiver-complete` | Waiver complete | Confirmation after signing |
| `waiverExpiryReminder` | Waiver expiry reminder | Sent before expiry |
| `waiver-reminder` | Waiver reminder | Reminder to sign waiver |

### membership (12)

| Key | Name | Description |
|---|---|---|
| `membership-details` | Membership details | After membership purchase |
| `membership-purchase-receipt` | Membership purchase details | With membership card / QR |
| `membership-1st-failed-payment` | 1st failed payment | First payment failure notice |
| `membership-3rd-failed-payment` | 3rd failed payment | Final notice before cancel |
| `membership-suspended` | Membership suspended | After 2nd failed payment |
| `membership-successful-payment` | Membership successful payment | Confirmation of charge |
| `membership-cancelled` | Membership cancelled | After cancel request |
| `membership-expired` | Membership expired | When membership period ends |
| `membership-renewal-winback` | Membership renewal winback | 30/60 day winback nudge |
| `membership-pending-cancellation` | Membership pending cancellation | Acknowledgment of cancel request |
| `group-membership-edited` | Group membership edited | Group member add/remove |
| `payment-details-update-link` | Payment details update link | Update card on file |

### giftcard (2)

| Key | Name | Description |
|---|---|---|
| `giftcard-received` | Giftcard received | To the recipient |
| `gift-card-sent` | Gift card sent | To the sender confirming delivery |

### guestList (3)

| Key | Name | Description |
|---|---|---|
| `guest-list-update` | Guest list update | Booking holder notified of new RSVPs |
| `guest-list-rsvp-confirmed` | Guest list RSVP confirmed | To the guest who RSVPd |
| `guest-list-rsvp-reminder` | Guest list RSVP reminder | 24h before booking |

### simple (3)

| Key | Name | Description |
|---|---|---|
| `guest-deleted` | Guest deleted | Acknowledge account deletion |
| `discount-code-issued` | Discount code issued | A thank-you discount |
| `loyalty-reward-reminder` | Loyalty reward reminder | Redeem before expiry |

## Common variables

Most templates use a subset of these:

| Variable | Source | Example |
|---|---|---|
| `guestName` | payload.guestName | Yogesh Niranjan |
| `venueName` | payload.venueName | Mumbai Sports Park |
| `bookingNumber` | payload.bookingNumber | BK-2026-001 |
| `bookingDate` | payload.bookingDate | Wednesday, May 20 |
| `totalAmount` | payload.totalAmount | $120.00 |
| `paymentLink` | payload.paymentLink | https://pay.example.com/xyz |
| `waiverShareUrl` / `waiverLink` | payload.waiverLink | https://example.com/waiver/abc |
| `amountPaid` | payload.amountPaid | $120.00 |
| `amountDue` | payload.amountDue | $50.00 |
| `expiryDate` | payload.expiryDate | Dec 31, 2026 |
| `expiryDays` | payload.expiryDays | 365 |
| `gateway` | payload.gateway | Stripe |
| `discountCode` | payload.discountCode | WELCOME10 |
| `paymentUpdateLink` | payload.paymentUpdateLink | https://... |
| `membershipName` | payload.membershipName | Gold Annual |

If the payload uses a different key name, set `variableMap` on the binding to remap.

## Editing templates

System templates can be **edited** (subject, body, design) but **not deleted**. The intended pattern:

1. Open `/crm/marketing?tab=templates&templateType=transactional`
2. Click a system template → opens marketing builder with `?type=transactional`
3. Edit visually or in code mode → auto-saves to `crm_transactional_templates`
4. To create a tenant variant: clone via the row's clone button (creates a non-system row with a new key)
5. Bindings page (`/crm/settings?channel=notifications`) lets you point an event at the variant instead of the system default

## Adding a new system template

1. Add a row to the seeder at `seeders/20260512000400-seed-engage-system-templates.js`
2. Re-run `npm run seed` — it's idempotent (uses key lookup)
3. (Optional) Add a binding via `seeders/20260512000100-seed-event-template-bindings.js` if a new event should fire it
