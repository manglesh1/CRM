// Single source of truth for the customer (contact) field catalog used by the
// advanced filter builder, the segment engine, the "Manage fields" UI and the
// column renderer. Built-in fields map to real columns on crm_contacts; custom
// fields live inside the customFields JSONB and are described by crm_contact_fields.

const CONTACT_ENUMS = {
  sourceType: ["movira", "csv", "manual", "form", "api", "webhook", "imported"],
  marketingStatus: ["subscribed", "unsubscribed", "bounced", "complained", "unknown"],
  smsStatus: ["subscribed", "unsubscribed", "unknown"],
  lifecycle: ["lead", "customer", "member", "guest", "prospect", "inactive", "vip"],
};

// Operators available per logical field type. The frontend renders one input per
// operator (value / range / none) and the filter engine compiles each to SQL.
const OPERATORS_BY_TYPE = {
  string: ["contains", "not_contains", "is", "is_not", "starts_with", "ends_with", "is_empty", "is_not_empty"],
  enum: ["is", "is_not", "is_one_of", "is_empty", "is_not_empty"],
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "between", "is_empty", "is_not_empty"],
  currency: ["eq", "neq", "gt", "gte", "lt", "lte", "between", "is_empty", "is_not_empty"],
  date: ["on", "before", "after", "between", "is_empty", "is_not_empty"],
  boolean: ["is_true", "is_false"],
  tags: ["has_any", "has_all", "has_none", "is_empty", "is_not_empty"],
};

// Operators that take no value, and operators that take a two-part range.
const NO_VALUE_OPERATORS = new Set(["is_empty", "is_not_empty", "is_true", "is_false"]);
const RANGE_OPERATORS = new Set(["between"]);

// Custom field types (crm_contact_fields.fieldType) → logical filter type.
const CUSTOM_TYPE_TO_FILTER_TYPE = {
  text: "string",
  textarea: "string",
  email: "string",
  phone: "string",
  url: "string",
  number: "number",
  currency: "currency",
  date: "date",
  dropdown: "enum",
  checkbox: "boolean",
};

const CUSTOM_FIELD_TYPES = Object.keys(CUSTOM_TYPE_TO_FILTER_TYPE);

const CUSTOM_FIELD_PREFIX = "cf:";

const SYSTEM_MOVIRA_FIELDS = [
  { key: "address", label: "Address", fieldType: "textarea", showInTable: false, sortOrder: 10 },
  { key: "postcode", label: "Postcode", fieldType: "text", showInTable: false, sortOrder: 20 },
  { key: "gender", label: "Gender", fieldType: "dropdown", options: ["male", "female", "other"], showInTable: false, sortOrder: 30 },
  { key: "locationId", label: "Location ID", fieldType: "number", showInTable: false, sortOrder: 40 },
  { key: "locationName", label: "Location", fieldType: "text", showInTable: true, sortOrder: 50 },
  { key: "source", label: "Movira source", fieldType: "text", showInTable: false, sortOrder: 60 },
  { key: "dateOfBirth", label: "Date of birth", fieldType: "date", showInTable: false, sortOrder: 70 },
  { key: "bookingCount", label: "Booking count", fieldType: "number", showInTable: true, sortOrder: 80 },
  { key: "totalSpend", label: "Total spend", fieldType: "currency", showInTable: true, sortOrder: 90 },
  { key: "totalDiscount", label: "Total discount", fieldType: "currency", showInTable: false, sortOrder: 100 },
  { key: "visitCount", label: "Visit count", fieldType: "number", showInTable: true, sortOrder: 110 },
  { key: "lastVisit", label: "Last visit", fieldType: "date", showInTable: true, sortOrder: 120 },
  { key: "lastBookingDate", label: "Last booking date", fieldType: "date", showInTable: false, sortOrder: 130 },
  { key: "waiverStatus", label: "Waiver status", fieldType: "dropdown", options: ["none", "active", "expired", "valid"], showInTable: true, sortOrder: 140 },
  { key: "engagementScore", label: "Engagement score", fieldType: "number", showInTable: false, sortOrder: 150 },
];

// Built-in fields. `column` is the crm_contacts column. `defaultColumn` marks the
// ones shown in the grid out of the box (the default grid layout).
const BUILTIN_FIELDS = [
  { key: "fullName", label: "Customer name", type: "string", column: "fullName", locked: true, defaultColumn: true, sortable: true },
  { key: "firstName", label: "First name", type: "string", column: "firstName", sortable: true },
  { key: "lastName", label: "Last name", type: "string", column: "lastName", sortable: true },
  { key: "phone", label: "Phone", type: "string", column: "phone", defaultColumn: true },
  { key: "email", label: "Email", type: "string", column: "email", defaultColumn: true, sortable: true },
  { key: "sourceType", label: "Source", type: "enum", column: "sourceType", options: CONTACT_ENUMS.sourceType, defaultColumn: true, sortable: true },
  { key: "lifecycle", label: "Lifecycle", type: "enum", column: "lifecycle", options: CONTACT_ENUMS.lifecycle, sortable: true },
  { key: "marketingStatus", label: "Marketing status", type: "enum", column: "marketingStatus", options: CONTACT_ENUMS.marketingStatus, sortable: true },
  { key: "smsStatus", label: "SMS status", type: "enum", column: "smsStatus", options: CONTACT_ENUMS.smsStatus },
  { key: "doNotContact", label: "Do not contact", type: "boolean", column: "doNotContact" },
  { key: "tags", label: "Tags", type: "tags", column: "tags", defaultColumn: true },
  { key: "createdAt", label: "Created", type: "date", column: "createdAt", defaultColumn: true, sortable: true },
  { key: "updatedAt", label: "Last activity", type: "date", column: "updatedAt", defaultColumn: true, sortable: true },
  { key: "lastEngagedAt", label: "Last engaged", type: "date", column: "lastEngagedAt", sortable: true },
];

const BUILTIN_BY_KEY = new Map(BUILTIN_FIELDS.map((field) => [field.key, field]));

// Columns the grid is allowed to sort by (whitelist guards the SQL ORDER BY).
const SORTABLE_COLUMNS = new Set(BUILTIN_FIELDS.filter((f) => f.sortable).map((f) => f.column));

function isCustomFieldKey(key) {
  return typeof key === "string" && key.startsWith(CUSTOM_FIELD_PREFIX);
}

function customFieldStorageKey(key) {
  return isCustomFieldKey(key) ? key.slice(CUSTOM_FIELD_PREFIX.length) : key;
}

// Describe a persisted custom field (crm_contact_fields row) the same way the
// built-in fields are described, so the filter engine and UI treat them alike.
function describeCustomField(field = {}) {
  const filterType = CUSTOM_TYPE_TO_FILTER_TYPE[field.fieldType] || "string";
  return {
    id: field.id,
    key: `${CUSTOM_FIELD_PREFIX}${field.key}`,
    storageKey: field.key,
    label: field.label,
    type: filterType,
    fieldType: field.fieldType,
    options: Array.isArray(field.options) ? field.options : [],
    custom: true,
    isSystem: Boolean(field.isSystem),
    defaultColumn: Boolean(field.showInTable),
    sortable: false,
  };
}

function operatorsForType(type) {
  return OPERATORS_BY_TYPE[type] || OPERATORS_BY_TYPE.string;
}

// Build the catalog payload the frontend consumes (builtin + custom + operator map).
function buildCatalog(customFields = []) {
  const builtin = BUILTIN_FIELDS.map((field) => ({
    key: field.key,
    label: field.label,
    type: field.type,
    options: field.options || undefined,
    locked: Boolean(field.locked),
    defaultColumn: Boolean(field.defaultColumn),
    sortable: Boolean(field.sortable),
    operators: operatorsForType(field.type),
  }));
  const custom = customFields.map((field) => {
    const described = describeCustomField(field);
    return {
      key: described.key,
      id: described.id,
      label: described.label,
      type: described.type,
      fieldType: described.fieldType,
      options: described.options,
      custom: true,
      isSystem: described.isSystem,
      defaultColumn: described.defaultColumn,
      sortable: false,
      operators: operatorsForType(described.type),
    };
  });
  return {
    builtin,
    custom,
    operatorsByType: OPERATORS_BY_TYPE,
    noValueOperators: Array.from(NO_VALUE_OPERATORS),
    rangeOperators: Array.from(RANGE_OPERATORS),
  };
}

module.exports = {
  CONTACT_ENUMS,
  OPERATORS_BY_TYPE,
  NO_VALUE_OPERATORS,
  RANGE_OPERATORS,
  CUSTOM_TYPE_TO_FILTER_TYPE,
  CUSTOM_FIELD_TYPES,
  CUSTOM_FIELD_PREFIX,
  SYSTEM_MOVIRA_FIELDS,
  BUILTIN_FIELDS,
  BUILTIN_BY_KEY,
  SORTABLE_COLUMNS,
  isCustomFieldKey,
  customFieldStorageKey,
  describeCustomField,
  operatorsForType,
  buildCatalog,
};
