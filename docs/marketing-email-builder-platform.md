# Marketing Email Builder Platform

This document is the implementation contract for the advanced email builder inside `movira-crm`.

## Ownership

`movira-crm` owns all communication concerns:

- template authoring
- transactional and marketing rendering
- message queueing
- provider sends
- open, click, delivered, bounce, complaint, unsubscribe events
- suppression and campaign analytics

`aeroSportsAdmin` should only trigger communication commands. It should not own delivery, campaign, or template infrastructure.

## Builder Contract

Marketing templates use a vendor-neutral JSON design document:

```json
{
  "schemaVersion": 1,
  "settings": {
    "contentWidth": 600,
    "backgroundColor": "#EAF0F6",
    "bodyColor": "#ffffff",
    "fontFamily": "Arial, Helvetica, sans-serif"
  },
  "sections": [
    {
      "id": "sec_1",
      "type": "section",
      "layout": "1",
      "settings": {
        "padding": { "top": 20, "right": 24, "bottom": 20, "left": 24 },
        "mobileStack": true
      },
      "columns": [
        {
          "id": "col_1",
          "width": "100%",
          "blocks": [
            {
              "id": "blk_1",
              "type": "heading",
              "content": "Start from scratch",
              "settings": { "align": "center", "fontSize": 32 }
            }
          ]
        }
      ]
    }
  ]
}
```

The UI must save this JSON into `crm_marketing_templates.designJson`. The backend renders it into email-safe table HTML and stores the snapshot in `htmlBody`.

## APIs

Builder catalog:

```txt
GET /api/marketing/email/templates/builder/catalog
```

Draft render:

```txt
POST /api/marketing/email/templates/render
{
  "name": "Spring promo",
  "designJson": {},
  "data": {}
}
```

Saved template render:

```txt
POST /api/marketing/email/templates/:id/render
{
  "data": {}
}
```

Tracking:

```txt
GET /m/open/:messageId.gif
GET /m/click/:messageId?u=https%3A%2F%2Fexample.com
```

## Rendering Rules

- Render final email as table-based HTML.
- Inline critical styles directly on elements.
- Keep content width at 600px by default.
- Use `{{path.to.value}}` merge tags.
- Block unsafe URL protocols.
- Untrusted code blocks are not rendered.
- Tracking injection can add:
  - open pixel
  - tracked redirect links

## Data Flow

```txt
Builder UI
  -> save designJson
  -> backend validates schema
  -> backend renders htmlBody
  -> campaign selects template
  -> audience expansion creates crm_marketing_messages
  -> SQS receives { messageId, domain, channel }
  -> worker loads message and template
  -> SES sends
  -> provider and tracking events write crm_marketing_delivery_events
  -> campaign counters update
```

## Queue Boundaries

Transactional and marketing messages must stay separate:

```txt
transactional-critical
transactional-default
marketing-bulk
marketing-journey
webhook-events
```

SQS messages should contain references only:

```json
{
  "messageId": "uuid",
  "campaignId": "uuid",
  "domain": "marketing",
  "channel": "email",
  "queueType": "bulk"
}
```

Postgres remains the durable source of truth.

## Next Implementation Steps

1. Build the React editor surface:
   - top bar
   - left element/layout palette
   - center 600px canvas
   - selected block inspector
   - autosave
   - undo/redo
2. Add campaign run expansion:
   - segment lookup
   - consent/suppression check
   - create `crm_marketing_messages`
   - enqueue marketing SQS references
3. Add worker:
   - receive SQS
   - render with recipient data
   - inject tracking URLs
   - send via SES
   - record events
4. Add SES/SNS webhook ingestion:
   - delivered
   - bounce
   - complaint
   - delivery delay
5. Add suppression:
   - hard bounce
   - complaint
   - unsubscribe
