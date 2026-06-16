"use strict";

const CRM_TABLES = [
  "crm_provider_configs",
  "crm_email_domains",
  "crm_email_domain_routes",
  "crm_email_reply_forward_settings",
  "crm_sender_warmup_profiles",
  "crm_sender_warmup_events",
  "crm_transactional_messages",
  "crm_transactional_templates",
  "crm_transactional_delivery_events",
  "crm_event_template_bindings",
  "crm_marketing_folders",
  "crm_marketing_templates",
  "crm_marketing_template_revisions",
  "crm_marketing_campaigns",
  "crm_marketing_campaign_audience_jobs",
  "crm_marketing_messages",
  "crm_marketing_delivery_events",
  "crm_marketing_assets",
  "crm_marketing_snippets",
  "crm_marketing_suppressions",
  "crm_marketing_worker_heartbeats",
  "crm_marketing_calendar_plans",
  "crm_marketing_calendar_rules",
  "crm_marketing_calendar_overrides",
  "crm_trigger_links",
  "crm_audit_logs",
  "crm_contacts",
  "crm_contact_identities",
  "crm_contact_import_jobs",
  "crm_contact_bulk_action_jobs",
  "crm_contact_export_jobs",
  "crm_contact_tags",
  "crm_contact_fields",
  "crm_contact_notes",
  "crm_contact_filter_counts",
  "crm_segments",
  "crm_segment_members",
  "crm_automation_workflows",
  "crm_automation_runs",
  "crm_automation_enrollment_jobs",
  "crm_queue_jobs",
];

function crmSchema() {
  const schema = process.env.CRM_DB_SCHEMA || "crm";
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
    throw new Error("CRM_DB_SCHEMA must be a valid PostgreSQL identifier");
  }
  return schema;
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

async function tableExists(queryInterface, schema, tableName) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = :schema
       AND table_name = :tableName
       AND table_type = 'BASE TABLE'
     LIMIT 1`,
    { replacements: { schema, tableName } }
  );
  return rows.length > 0;
}

async function moveTable(queryInterface, fromSchema, toSchema, tableName) {
  const sourceExists = await tableExists(queryInterface, fromSchema, tableName);
  if (!sourceExists) return;

  const targetExists = await tableExists(queryInterface, toSchema, tableName);
  if (targetExists) {
    throw new Error(
      `Cannot move ${fromSchema}.${tableName} to ${toSchema}.${tableName}: target table already exists. Resolve duplicate CRM tables before migrating.`
    );
  }

  await queryInterface.sequelize.query(
    `ALTER TABLE ${quoteIdentifier(fromSchema)}.${quoteIdentifier(tableName)}
     SET SCHEMA ${quoteIdentifier(toSchema)};`
  );
}

module.exports = {
  up: async (queryInterface) => {
    const schema = crmSchema();
    await queryInterface.sequelize.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schema)};`);
    for (const tableName of CRM_TABLES) {
      await moveTable(queryInterface, "public", schema, tableName);
    }
  },

  down: async (queryInterface) => {
    const schema = crmSchema();
    for (const tableName of [...CRM_TABLES].reverse()) {
      await moveTable(queryInterface, schema, "public", tableName);
    }
  },
};
