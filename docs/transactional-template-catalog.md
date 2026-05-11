# Transactional Template Catalog

System templates are seeded into `crm_transactional_templates`.

Template interpolation uses double-curly tokens:

```txt
{{guestName}}
{{bookingNumber}}
{{venueName}}
```

## bookingConfirmation

Used when a booking is confirmed.

Variables:

- `guestName`
- `bookingNumber`
- `venueName`
- `bookingDate`
- `totalAmount`
- `paymentLink`

## payment-receipt

Used when a payment has been received.

Variables:

- `guestName`
- `bookingNumber`
- `venueName`
- `amountPaid`
- `gateway`

## paymentLink

Used when a guest needs to complete payment.

Variables:

- `guestName`
- `bookingNumber`
- `venueName`
- `paymentLink`
- `amountDue`

## waiverLink

Used when a guest needs to sign a waiver.

Variables:

- `guestName`
- `venueName`
- `waiverShareUrl`

## waiverExpiryReminder

Used when a completed waiver is close to expiry.

Variables:

- `guestName`
- `venueName`
- `expiryDate`
- `waiverShareUrl`
