# Marketing Orchestrators

Marketing orchestrators are channel-aware and consent-aware.

Examples:

- `email`: newsletters, campaigns, reactivation flows.
- `sms`: opt-in SMS campaigns.
- `whatsapp`: approved business templates plus 24-hour service window logic.
- `push`: promotional or lifecycle push notifications.

Rules:

- Marketing orchestration never uses transactional queues.
- Every send must pass channel consent checks.
- Unsubscribe/suppression must be enforced.
- Campaign and journey fanout must run in chunks.
- Provider quotas and quiet hours apply before enqueue.
