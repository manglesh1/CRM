const CHANNEL_STRATEGY = {
  email: {
    transport: "ses",
    queueModel: "sqs",
    supportsAttachments: true,
    requiresTemplateApproval: false,
    recipientPolicy: "email",
  },
  sms: {
    transport: "twilio-or-sns",
    queueModel: "sqs",
    supportsAttachments: false,
    requiresTemplateApproval: false,
    recipientPolicy: "e164",
  },
  whatsapp: {
    transport: "whatsapp-cloud-or-twilio",
    queueModel: "sqs",
    supportsAttachments: true,
    requiresTemplateApproval: true,
    recipientPolicy: "e164",
  },
  push: {
    transport: "fcm-or-apns",
    queueModel: "sqs",
    supportsAttachments: false,
    requiresTemplateApproval: false,
    recipientPolicy: "device-token",
  },
};

function getChannelStrategy(channel) {
  const strategy = CHANNEL_STRATEGY[channel];
  if (!strategy) {
    throw new Error(`Unsupported channel orchestration strategy: ${channel}`);
  }
  return strategy;
}

module.exports = {
  CHANNEL_STRATEGY,
  getChannelStrategy,
};
