const EVENTS = {
  "booking.confirmed": {
    description: "Customer booking confirmed; send confirmation with details",
    sourceSystem: "aeroSportsAdmin",
    sourceResourceType: "booking",
    requiredPayloadFields: ["guestName", "bookingNumber", "venueName"],
    samplePayload: {
      guestName: "Yogesh",
      bookingNumber: "BK-2026-001",
      venueName: "Mumbai Sports Park",
      bookingDate: "2026-05-15",
      totalAmount: "$120.00",
      paymentLink: "",
    },
  },
  "payment.received": {
    description: "Payment captured for a booking; send receipt",
    sourceSystem: "aeroSportsAdmin",
    sourceResourceType: "payment",
    requiredPayloadFields: ["guestName", "bookingNumber", "venueName", "amountPaid"],
    samplePayload: {
      guestName: "Yogesh",
      bookingNumber: "BK-2026-001",
      venueName: "Mumbai Sports Park",
      amountPaid: "$120.00",
      gateway: "Stripe",
    },
  },
  "payment.link.requested": {
    description: "Send a payment link to the customer to complete checkout",
    sourceSystem: "aeroSportsAdmin",
    sourceResourceType: "payment",
    requiredPayloadFields: ["guestName", "bookingNumber", "venueName", "paymentLink", "amountDue"],
    samplePayload: {
      guestName: "Yogesh",
      bookingNumber: "BK-2026-001",
      venueName: "Mumbai Sports Park",
      paymentLink: "https://example.com/pay/xxx",
      amountDue: "$120.00",
    },
  },
  "waiver.link.requested": {
    description: "Send a waiver signature link to a guest",
    sourceSystem: "aeroSportsAdmin",
    sourceResourceType: "waiver",
    requiredPayloadFields: ["guestName", "venueName", "waiverLink"],
    samplePayload: {
      guestName: "Yogesh",
      venueName: "Mumbai Sports Park",
      waiverLink: "https://example.com/waiver/xxx",
    },
  },
  "waiver.completed": {
    description: "Guest has signed a waiver; send confirmation with expiry info",
    sourceSystem: "aeroSportsAdmin",
    sourceResourceType: "waiver",
    requiredPayloadFields: ["guestName", "venueName"],
    samplePayload: {
      guestName: "Yogesh",
      venueName: "Mumbai Sports Park",
      expiryDate: "2026-12-31",
      expiryDays: 365,
    },
  },
  "waiver.expiring": {
    description: "Waiver expiring soon; reminder to guest",
    sourceSystem: "aeroSportsAdmin",
    sourceResourceType: "waiver",
    requiredPayloadFields: ["guestName", "venueName", "expiryDate"],
    samplePayload: {
      guestName: "Yogesh",
      venueName: "Mumbai Sports Park",
      expiryDate: "2026-06-15",
    },
  },
};

function isRegistered(eventType) {
  return Object.prototype.hasOwnProperty.call(EVENTS, eventType);
}

function listEvents() {
  return Object.entries(EVENTS).map(([eventType, meta]) => ({ eventType, ...meta }));
}

function getEvent(eventType) {
  return EVENTS[eventType] || null;
}

module.exports = {
  EVENTS,
  isRegistered,
  listEvents,
  getEvent,
};
