const PROVIDER_OPTIONS = [
  {
    provider: "movira_ses",
    label: "Movira SES",
    mode: "default",
    description: "Built-in Movira email infrastructure backed by Amazon SES.",
    supports: ["transactional", "marketing"],
    requiresCustomerCredentials: false,
    fields: [],
  },
  {
    provider: "customer_smtp",
    label: "Customer SMTP",
    mode: "bring_your_own",
    description: "Use a customer-owned SMTP provider for email sending.",
    supports: ["transactional", "marketing"],
    requiresCustomerCredentials: true,
    fields: ["host", "port", "username", "password", "fromEmail"],
  },
  {
    provider: "customer_ses",
    label: "Customer Amazon SES",
    mode: "bring_your_own",
    description: "Use the customer's own Amazon SES account and identity.",
    supports: ["transactional", "marketing"],
    requiresCustomerCredentials: true,
    fields: ["region", "accessKeyId", "secretAccessKey", "fromEmail", "configurationSet"],
  },
  {
    provider: "customer_sendgrid",
    label: "Customer SendGrid",
    mode: "bring_your_own",
    description: "Use the customer's own SendGrid API key.",
    supports: ["transactional", "marketing"],
    requiresCustomerCredentials: true,
    fields: ["apiKey", "fromEmail"],
  },
];

module.exports = { PROVIDER_OPTIONS };
