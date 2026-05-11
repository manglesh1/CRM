# Movira CRM System Design

## 1. Product Decision

Movira CRM is a separate backend service for all outbound communication and CRM workflows:

- Email
- SMS
- WhatsApp
- Push notifications
- Provider webhooks
- Delivery analytics
- CRM contacts
- Marketing campaigns
- Journeys and automations
- Suppression, unsubscribe, and consent

The service is split into two independent product domains:

1. **Transactional Communication**
2. **Marketing CRM**

They may share low-level infrastructure, but their UI, APIs, queues, dashboards, templates, metrics, compliance rules, and database tables must remain separate.

## 2. Frontend Ownership

### 2.1 Transactional UI

Transactional communication stays inside `my-admin-app` because it is part of the operations/admin product.

Example routes:

```txt
/transactional
/transactional/messages
/transactional/templates
/transactional/delivery
/transactional/dlq
/transactional/providers
/transactional/settings
```

This UI shows only operational messages:

- Booking confirmations
- Payment receipts
- Payment links
- Waiver links
- Waiver expiry reminders
- OTP/password reset/security notifications
- POS/customer service notifications

### 2.2 Marketing CRM UI

Marketing CRM UI should be portable from the beginning. It can temporarily live inside `my-admin-app`, but route names, folders, API clients, and components should be designed so they can move to a dedicated CRM frontend later.

Example routes:

```txt
/crm
/crm/contacts
/crm/inbox
/crm/campaigns
/crm/segments
/crm/journeys
/crm/automations
/crm/templates
/crm/settings/providers
/crm/settings/compliance
```

This UI shows CRM/marketing data only:

- Contacts
- Campaigns
- Broadcasts
- Segments
- Journeys
- Conversations/inbox
- Marketing templates
- Unsubscribes
- Audience and campaign analytics

## 3. Backend Ownership

### 3.1 aeroSportsAdmin

`aeroSportsAdmin` remains the system of record for business operations:

- Bookings
- Payments
- POS
- Waivers
- Tickets
- Customers/guests
- Locations
- Admin users and roles

It does not own communication delivery infrastructure.

It triggers communication by calling `movira-crm` internal APIs or by writing outbox events that are later delivered to `movira-crm`.

### 3.2 movira-crm

`movira-crm` owns communication and CRM:

- Transactional send APIs
- Marketing send APIs
- Message state
- SQS queue production
- Workers
- SES/SMS/WhatsApp/push providers
- Templates
- Delivery events
- Provider webhooks
- Suppression/consent
- Campaigns
- Journeys
- Conversations
- CRM analytics

## 4. Domain Boundary

```txt
movira-crm
  src/modules
    transactional
      messages
      templates
      dashboard
      delivery
      dlq
      providers

    marketing
      contacts
      segments
      campaigns
      journeys
      automations
      inbox
      templates
      analytics
      compliance

    messaging-core
      aws
      rendering
      workers
      provider-clients
      delivery-events
      idempotency
      rate-limits
      locks

    webhooks
      ses
      sms
      whatsapp
      push
```

Rule: `transactional` and `marketing` may both use `messaging-core`, but they must not depend on each other's tables, routes, dashboards, or business rules.

## 5. AWS Architecture

### 5.1 Services

Use AWS managed services for production queue and delivery infrastructure:

- **SQS** for async queues.
- **SQS DLQ** for failed queue messages.
- **SES** for email sending.
- **SNS** for SES feedback events.
- **Redis** for rate limits, locks, idempotency cache, counters, and provider quota state.
- **Postgres** as durable system of record.

### 5.2 Queue Design

Transactional and marketing queues must be physically separate.

```txt
Transactional:
  movira-transactional-critical
  movira-transactional-default
  movira-transactional-dlq

Marketing:
  movira-marketing-bulk
  movira-marketing-journey
  movira-marketing-dlq

Webhook/event processing:
  movira-provider-webhooks
  movira-provider-webhooks-dlq
```

Transactional messages must never wait behind campaign volume.

### 5.3 SQS Message Shape

SQS is transport, not truth. Postgres is truth.

Store full state in DB first, then enqueue only a small reference:

```json
{
  "messageId": "uuid",
  "domain": "transactional",
  "channel": "email",
  "priority": "critical"
}
```

Worker flow:

```txt
SQS message received
  -> load message row from Postgres
  -> check idempotency/rate/suppression
  -> render template
  -> send via provider
  -> update durable message status
  -> write delivery event
  -> delete SQS message
```

## 6. Data Model

Use `crm_*` for every table owned by `movira-crm`. The domain comes after the project prefix, for example `crm_transactional_messages` and `crm_marketing_campaigns`. Avoid reusing the current `engage_*` naming for new tables.

### 6.1 Transactional Tables

```txt
crm_transactional_messages
  id
  locationId
  sourceSystem              # aeroSportsAdmin, pos, public-checkout
  sourceEventType           # booking.created, payment.received
  sourceResourceType        # booking, payment, waiver
  sourceResourceId
  channel                   # email, sms, whatsapp, push
  recipientAddress
  templateKey
  templateVersionId
  payload
  priority                  # critical, high, normal
  status                    # pending, queued, sending, sent, delivered, failed, cancelled
  idempotencyKey
  provider
  providerMessageId
  queuedAt
  sentAt
  deliveredAt
  failedAt
  lastError
  createdAt
  updatedAt

crm_transactional_templates
  id
  locationId
  key
  channel
  name
  category                  # booking, payment, waiver, security
  subject
  body
  config
  variables
  isSystem
  isActive
  createdAt
  updatedAt

crm_transactional_delivery_events
  id
  messageId
  provider
  providerMessageId
  eventType                 # sent, delivered, bounced, complained, opened, clicked, failed
  payload
  occurredAt
  createdAt
```

### 6.2 Marketing Tables

```txt
crm_contacts
  id
  locationId
  externalGuestId
  name
  email
  phone
  lifecycle
  tags
  customAttributes
  consentEmailMarketing
  consentSmsMarketing
  consentWhatsappMarketing
  doNotContact
  lastEngagedAt
  createdAt
  updatedAt

crm_marketing_messages
  id
  locationId
  campaignId
  journeyRunId
  contactId
  channel
  recipientAddress
  templateKey
  payload
  status
  provider
  providerMessageId
  queuedAt
  sentAt
  deliveredAt
  failedAt
  createdAt
  updatedAt

crm_marketing_templates
  id
  locationId
  key
  channel
  name
  subject
  body
  variables
  isActive
  createdAt
  updatedAt

crm_marketing_campaigns
  id
  locationId
  name
  segmentId
  channel
  templateId
  status
  scheduledAt
  audienceCount
  queuedCount
  sentCount
  deliveredCount
  failedCount
  bouncedCount
  unsubscribedCount
  createdAt
  updatedAt

crm_marketing_segments
crm_marketing_journeys
crm_marketing_journey_runs
crm_marketing_delivery_events
crm_marketing_suppressions
```

### 6.3 Shared Tables

```txt
crm_provider_configs
  id
  locationId
  domain                    # transactional, marketing
  channel
  provider                  # ses, twilio, whatsapp-cloud, fcm
  displayName
  priority
  encryptedConfig
  isActive
  verifiedAt
  createdAt
  updatedAt

crm_webhook_events
  id
  provider
  channel
  rawPayload
  normalizedEventType
  processingStatus
  processedAt
  createdAt
```

Email service settings:

```txt
crm_email_domains
  id
  locationId
  domain
  domainType                 # subdomain/root
  useCase                    # transactional/marketing
  provider                   # movira_ses
  status                     # pending_dns/verification_requested/verified/failed
  dnsRecords
  verifiedAt
```

Provider configs include `domain` so transactional and marketing can use different SES config sets, domains, rate limits, and sender identities.

Default provider strategy:

```txt
Default:
  Movira SES

Optional customer-owned providers:
  Customer SMTP
  Customer Amazon SES
  Customer SendGrid
```

## 7. Transactional Flow

Example: booking confirmation.

```txt
aeroSportsAdmin creates booking
  -> transaction commits
  -> aeroSportsAdmin calls:
     POST /api/transactional/messages
       type=booking.confirmation
       sourceResourceId=bookingId
       locationId
       recipient
       payload
       idempotencyKey=booking.confirmation:{bookingId}

movira-crm
  -> validates command
  -> creates crm_transactional_messages row
  -> sends SQS message to transactional-critical/default
  -> returns 202 Accepted

worker
  -> sends via SES/SMS/WhatsApp
  -> updates crm_transactional_messages
```

Booking/payment flows must not fail if CRM sending fails. Use best-effort API plus retry, or an outbox table inside `aeroSportsAdmin`.

## 8. Marketing Flow

Example: campaign.

```txt
Admin creates campaign
  -> crm_marketing_campaigns row
  -> campaign runner evaluates segment
  -> one crm_marketing_messages row per contact
  -> pushes references to marketing-bulk SQS
  -> workers send under marketing compliance rules
  -> analytics update from provider events
```

Campaigns must obey marketing consent, unsubscribe, quiet hours, rate limits, provider quotas, and channel-specific rules.

## 9. Compliance Rules

### 9.1 Transactional

Allowed for operational purposes:

- Booking confirmations
- Receipts
- Payment links
- Waiver links
- Security messages

Rules:

- Requires idempotency key.
- Uses critical/high/default transactional queue.
- Ignores marketing unsubscribe.
- Does not ignore hard bounce, complaint, admin block, or invalid recipient.
- Must be auditable by source resource.

### 9.2 Marketing

Allowed for promotional/CRM purposes:

- Broadcasts
- Campaigns
- Journeys
- Winback
- Birthday offers
- Newsletters

Rules:

- Requires consent per channel.
- Must obey unsubscribe/suppression.
- Must include unsubscribe mechanism where required.
- Uses marketing queues only.
- Must not use transactional sender identity to bypass reputation controls.

### 9.3 Channel Rules

Email:

- SES configuration sets split by domain.
- Bounce/complaint creates suppression.
- Marketing email requires unsubscribe.

SMS:

- STOP/START handling.
- Marketing SMS requires opt-in.
- Rate limits per recipient and location.

WhatsApp:

- Approved templates for business-initiated messages.
- 24-hour customer service window tracking.
- Separate conversation/inbox tracking.

Push:

- Device token lifecycle.
- Silent invalid-token cleanup.

## 10. APIs

### 10.1 Transactional APIs

```txt
POST /api/transactional/messages
GET  /api/transactional/overview
GET  /api/transactional/messages
GET  /api/transactional/messages/:id
GET  /api/transactional/templates
PUT  /api/transactional/templates/:id
GET  /api/transactional/delivery-events
GET  /api/transactional/dlq
POST /api/transactional/dlq/:id/replay
```

### 10.2 Marketing APIs

```txt
GET  /api/marketing/overview
GET  /api/marketing/contacts
GET  /api/marketing/contacts/:id
GET  /api/marketing/segments
POST /api/marketing/segments
GET  /api/marketing/campaigns
POST /api/marketing/campaigns
POST /api/marketing/campaigns/:id/run
GET  /api/marketing/journeys
POST /api/marketing/journeys
GET  /api/marketing/templates
POST /api/marketing/templates
GET  /api/marketing/suppressions
POST /api/marketing/suppressions
```

### 10.3 Webhook APIs

```txt
POST /api/webhooks/ses
POST /api/webhooks/sms
POST /api/webhooks/whatsapp
POST /api/webhooks/push
```

Provider webhooks should enqueue raw webhook events to SQS first, then process asynchronously.

## 11. Channel-Based Orchestration

Movira CRM uses channel-based orchestration inside each product domain.

The top-level separation is still:

```txt
transactional
marketing
```

Inside each domain, orchestration is split by channel:

```txt
transactional/email
transactional/sms
transactional/whatsapp
transactional/push

marketing/email
marketing/sms
marketing/whatsapp
marketing/push
```

This avoids mixing channel-specific rules.

### 11.1 Why Channel-Based

Each channel has different rules:

Email:

- SES configuration sets.
- Bounce/complaint handling.
- Open/click events.
- Attachments.
- Unsubscribe headers for marketing.

SMS:

- E.164 phone validation.
- STOP/START compliance.
- Segment count and cost.
- Strict opt-in for marketing.

WhatsApp:

- Approved templates.
- 24-hour service window.
- Conversation state.
- Media/template parameter rules.

Push:

- Device token lifecycle.
- Invalid token cleanup.
- App/platform-specific payloads.

### 11.2 Orchestration Layers

```txt
Domain orchestrator
  -> transactional or marketing rules

Channel orchestrator
  -> email/sms/whatsapp/push rules

Provider adapter
  -> SES/Twilio/SNS/WhatsApp Cloud/FCM/APNs

SQS worker
  -> executes queued message references
```

### 11.3 Transactional Channel Flow

```txt
aeroSportsAdmin command
  -> transactional domain validation
  -> channel validation
  -> crm_transactional_messages row
  -> transactional channel SQS
  -> channel worker
  -> provider adapter
  -> crm_transactional_delivery_events
```

Transactional channel orchestration requires:

- Idempotency key.
- Source resource reference.
- Operational template.
- High/normal priority queue selection.
- Delivery event audit.

### 11.4 Marketing Channel Flow

```txt
campaign or journey trigger
  -> marketing domain validation
  -> audience/segment resolution
  -> consent and suppression check
  -> channel validation
  -> crm_marketing_messages row
  -> marketing channel SQS
  -> channel worker
  -> provider adapter
  -> campaign/journey analytics update
```

Marketing channel orchestration requires:

- Channel consent.
- Suppression/unsubscribe enforcement.
- Quiet hours.
- Provider quota checks.
- Campaign/journey counters.

### 11.5 Queue Naming

Queues should stay domain and channel aware:

```txt
movira-transactional-email-critical
movira-transactional-email-default
movira-transactional-sms-critical
movira-transactional-whatsapp-default
movira-transactional-push-default

movira-marketing-email-bulk
movira-marketing-sms-bulk
movira-marketing-whatsapp-journey
movira-marketing-push-bulk
```

Start with fewer queues if needed, but the naming and code should be ready for channel split.

## 12. Auth and Service Security

Frontend calls use the same admin JWT/session model as `my-admin-app`.

Internal calls from `aeroSportsAdmin` to `movira-crm` use:

- Internal API secret initially.
- Later, service-to-service JWT or AWS IAM signed requests.

Every request must carry:

- `locationId`
- actor user id where available
- source system
- idempotency key for transactional sends

## 13. Migration From Current Engage

Current state:

- `aeroSportsAdmin/services/engage`
- `engage_queue`
- `EngageTemplates`
- campaigns/segments/journeys mixed with email queue
- frontend routes under `/engage`

Target state:

- Retire DB polling queue.
- Use SQS for work transport.
- Keep DB only for durable state/audit.
- Move marketing concepts to `movira-crm`.
- Keep transactional UI in `my-admin-app`.
- Split current `/engage` UI into `/transactional` and `/crm`.

Migration phases:

1. Create `movira-crm` scaffold and schemas.
2. Implement transactional enqueue API and SQS worker.
3. Redirect booking/payment/waiver sends from `aeroSportsAdmin` to `movira-crm`.
4. Build transactional UI in `my-admin-app`.
5. Implement marketing contacts/templates/campaigns in `movira-crm`.
6. Move existing Engage campaign/segment/journey data.
7. Disable old `engage_queue` workers.
8. Drop or archive old `engage_*` tables after production confidence.

## 14. Implementation Principles

- Transactional and marketing must never share dashboards.
- Transactional and marketing must never share SQS queues.
- Transactional and marketing should not share template tables.
- Channel orchestration must keep email, SMS, WhatsApp, and push rules separate.
- Shared provider/client code is allowed only inside `messaging-core`.
- Postgres stores truth; SQS carries references.
- Redis is acceleration, never source of truth.
- Booking/payment/waiver flows must not fail because messaging is unavailable.
- Every transactional message must be idempotent.
- Every marketing message must be consent-checked.
- Provider webhooks must be ingested asynchronously.

## 15. First Build Milestones

### Milestone 1: Foundation

- Express service boot.
- Health check.
- Env config.
- Domain routes.
- Database migration skeleton.
- AWS SQS client wrapper.
- Redis client wrapper.

### Milestone 2: Transactional MVP

- `POST /api/transactional/messages`
- `crm_transactional_messages` table.
- `crm_transactional_templates` seeded with system templates.
- SQS enqueue.
- Transactional worker.
- SES email provider.
- SES/SNS webhook ingestion.
- Transactional dashboard API.

### Milestone 3: my-admin-app Transactional UI

- `/transactional` overview.
- Message list.
- Delivery detail.
- Template list/editor.
- DLQ/replay view.

### Milestone 4: Marketing CRM MVP

- CRM contacts.
- Marketing templates.
- Segments.
- Campaigns.
- Marketing worker.
- Consent/suppression.
- Campaign analytics.

### Milestone 5: CRM Frontend Readiness

- Move CRM pages into portable folder.
- Remove admin-only assumptions.
- Prepare dedicated CRM frontend shell.
