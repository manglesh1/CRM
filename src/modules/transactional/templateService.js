const repository = require("./repository");

async function listTemplates(query = {}) {
  const rows = await repository.listTemplates({
    locationId: query.locationId ? Number(query.locationId) : null,
    channel: query.channel || null,
  });
  return rows.map(serializeTemplate);
}

async function getTemplate(id) {
  const row = await repository.findTemplateById(id);
  if (!row) {
    const err = new Error("Template not found");
    err.statusCode = 404;
    throw err;
  }
  return serializeTemplate(row);
}

function serializeTemplate(row) {
  return {
    id: row.id,
    locationId: row.locationId,
    key: row.key,
    channel: row.channel,
    name: row.name,
    category: row.category,
    subject: row.subject,
    body: row.body,
    config: row.config || {},
    variables: row.variables || [],
    isSystem: row.isSystem,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

module.exports = {
  listTemplates,
  getTemplate,
};
