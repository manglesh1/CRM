// Customer "record" depth: notes, a per-contact activity timeline (built from
// marketing + transactional messages matched by email), and duplicate
// detection + merge. Kept separate from the high-traffic list/search service.

const { Op } = require("sequelize");
const { getModels } = require("../../db/models");

function badRequest(message, errors = []) {
  const err = new Error(message);
  err.statusCode = 400;
  err.errors = errors;
  return err;
}
function notFound(label) {
  const err = new Error(`${label} not found`);
  err.statusCode = 404;
  return err;
}
function requireLocation(locationId) {
  if (!locationId) throw badRequest("locationId is required");
  const value = Number(locationId);
  if (!Number.isInteger(value) || value <= 0) throw badRequest("locationId must be a positive integer");
  return value;
}
function cleanString(value, max = 2000) {
  const text = String(value || "").trim();
  return text ? text.slice(0, max) : null;
}
function plain(row) {
  return row?.get ? row.get({ plain: true }) : row;
}

async function loadContact(models, id, locationId) {
  const contact = await models.CrmContact.findOne({ where: { id, locationId } });
  if (!contact) throw notFound("Contact");
  return contact;
}

// ---- Notes ----------------------------------------------------------------

async function listNotes(contactId, query = {}) {
  const models = getModels();
  const locationId = requireLocation(query.locationId);
  await loadContact(models, contactId, locationId);
  const notes = await models.CrmContactNote.findAll({
    where: { contactId, locationId },
    order: [["createdAt", "DESC"]],
    limit: Math.min(200, Math.max(1, Number(query.limit || 100))),
  });
  return notes.map(plain);
}

async function createNote(contactId, input = {}) {
  const models = getModels();
  const locationId = requireLocation(input.locationId);
  await loadContact(models, contactId, locationId);
  const body = cleanString(input.body, 4000);
  if (!body) throw badRequest("Note body is required");
  const note = await models.CrmContactNote.create({
    contactId,
    locationId,
    body,
    authorName: cleanString(input.authorName, 160),
    authorId: cleanString(input.authorId, 120),
  });
  return plain(note);
}

async function deleteNote(noteId, query = {}) {
  const models = getModels();
  const locationId = requireLocation(query.locationId);
  const note = await models.CrmContactNote.findOne({ where: { id: noteId, locationId } });
  if (!note) throw notFound("Note");
  const data = plain(note);
  await note.destroy();
  return data;
}

// ---- Activity timeline ----------------------------------------------------

function marketingItem(message) {
  return {
    id: `mk_${message.id}`,
    channel: message.channel || "email",
    category: "marketing",
    title: message.subject || "Marketing email",
    status: message.status,
    occurredAt: message.sentAt || message.queuedAt || message.createdAt,
    opened: Boolean(message.openedAt),
    clicked: Boolean(message.clickedAt),
    bounced: Boolean(message.bouncedAt),
    openedAt: message.openedAt || null,
    clickedAt: message.clickedAt || null,
  };
}

function transactionalItem(message) {
  return {
    id: `tx_${message.id}`,
    channel: message.channel || "email",
    category: "transactional",
    title: message.templateKey || message.sourceEventType || "Transactional email",
    status: message.status,
    occurredAt: message.sentAt || message.queuedAt || message.createdAt,
    failed: Boolean(message.failedAt),
    error: message.lastError || null,
  };
}

async function getActivity(contactId, query = {}) {
  const models = getModels();
  const locationId = requireLocation(query.locationId);
  const contact = await loadContact(models, contactId, locationId);
  const email = contact.email || contact.normalizedEmail;
  if (!email) return { items: [], email: null };

  const limit = Math.min(100, Math.max(1, Number(query.limit || 60)));
  const [marketing, transactional] = await Promise.all([
    models.CrmMarketingMessage.findAll({
      where: { locationId, recipient: { [Op.iLike]: email } },
      order: [["createdAt", "DESC"]],
      limit,
    }),
    models.TransactionalMessage.findAll({
      where: { locationId, recipientAddress: { [Op.iLike]: email } },
      order: [["createdAt", "DESC"]],
      limit,
    }),
  ]);

  const items = [
    ...marketing.map((m) => marketingItem(plain(m))),
    ...transactional.map((m) => transactionalItem(plain(m))),
  ]
    .filter((item) => item.occurredAt)
    .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))
    .slice(0, limit);

  return { items, email };
}

// ---- Duplicate detection + merge ------------------------------------------

async function findDuplicates(query = {}) {
  const models = getModels();
  const locationId = requireLocation(query.locationId);
  const sequelize = models.sequelize;

  const run = (column) =>
    sequelize.query(
      `SELECT "${column}" AS key, COUNT(*) AS count
       FROM crm_contacts
       WHERE "locationId" = :locationId AND "${column}" IS NOT NULL AND "${column}" <> ''
       GROUP BY "${column}" HAVING COUNT(*) > 1
       ORDER BY COUNT(*) DESC LIMIT 100`,
      { replacements: { locationId }, type: sequelize.QueryTypes.SELECT }
    );

  const [emailGroups, phoneGroups] = await Promise.all([run("normalizedEmail"), run("normalizedPhone")]);

  const groups = [];
  const seen = new Set();

  const addGroups = async (rows, type, column) => {
    for (const row of rows) {
      const contacts = await models.CrmContact.findAll({
        where: { locationId, [column]: row.key },
        order: [["createdAt", "ASC"]],
        attributes: ["id", "fullName", "email", "phone", "sourceType", "tags", "lifecycle", "createdAt"],
      });
      if (contacts.length < 2) continue;
      const signature = contacts.map((c) => c.id).sort().join("|");
      if (seen.has(signature)) continue;
      seen.add(signature);
      groups.push({ type, key: row.key, count: contacts.length, contacts: contacts.map(plain) });
    }
  };

  await addGroups(emailGroups, "email", "normalizedEmail");
  await addGroups(phoneGroups, "phone", "normalizedPhone");

  return { groups, total: groups.length };
}

async function mergeContacts(input = {}) {
  const models = getModels();
  const locationId = requireLocation(input.locationId);
  const primaryId = input.primaryId;
  const mergeIds = Array.from(new Set((Array.isArray(input.mergeIds) ? input.mergeIds : []).filter((id) => id && id !== primaryId))).slice(0, 20);
  if (!primaryId) throw badRequest("primaryId is required");
  if (!mergeIds.length) throw badRequest("mergeIds is required");

  return models.sequelize.transaction(async (transaction) => {
    const primary = await models.CrmContact.findOne({ where: { id: primaryId, locationId }, transaction });
    if (!primary) throw notFound("Primary contact");
    const losers = await models.CrmContact.findAll({ where: { id: { [Op.in]: mergeIds }, locationId }, transaction });
    if (!losers.length) throw badRequest("No contacts to merge");

    const merged = {
      fullName: primary.fullName,
      firstName: primary.firstName,
      lastName: primary.lastName,
      email: primary.email,
      normalizedEmail: primary.normalizedEmail,
      phone: primary.phone,
      normalizedPhone: primary.normalizedPhone,
      tags: Array.isArray(primary.tags) ? [...primary.tags] : [],
      customFields: { ...(primary.customFields || {}) },
      sourceSnapshot: { ...(primary.sourceSnapshot || {}) },
      doNotContact: Boolean(primary.doNotContact),
    };

    for (const loser of losers) {
      merged.fullName = merged.fullName || loser.fullName;
      merged.firstName = merged.firstName || loser.firstName;
      merged.lastName = merged.lastName || loser.lastName;
      merged.email = merged.email || loser.email;
      merged.normalizedEmail = merged.normalizedEmail || loser.normalizedEmail;
      merged.phone = merged.phone || loser.phone;
      merged.normalizedPhone = merged.normalizedPhone || loser.normalizedPhone;
      merged.tags = Array.from(new Set([...merged.tags, ...(Array.isArray(loser.tags) ? loser.tags : [])]));
      merged.customFields = { ...(loser.customFields || {}), ...merged.customFields };
      merged.sourceSnapshot = { ...(loser.sourceSnapshot || {}), ...merged.sourceSnapshot };
      merged.doNotContact = merged.doNotContact || Boolean(loser.doNotContact);

      // Reassign identities (respecting the per-location unique constraint).
      const identities = await models.CrmContactIdentity.findAll({ where: { contactId: loser.id }, transaction });
      for (const identity of identities) {
        const exists = await models.CrmContactIdentity.findOne({
          where: { locationId, provider: identity.provider, externalType: identity.externalType, externalId: identity.externalId, contactId: primaryId },
          transaction,
        });
        if (exists) await identity.destroy({ transaction });
        else await identity.update({ contactId: primaryId }, { transaction });
      }

      // Reassign segment memberships (unique segmentId+contactId).
      const memberships = await models.CrmSegmentMember.findAll({ where: { contactId: loser.id }, transaction });
      for (const membership of memberships) {
        const exists = await models.CrmSegmentMember.findOne({ where: { segmentId: membership.segmentId, contactId: primaryId }, transaction });
        if (exists) await membership.destroy({ transaction });
        else await membership.update({ contactId: primaryId }, { transaction });
      }

      await models.CrmContactNote.update({ contactId: primaryId }, { where: { contactId: loser.id }, transaction });
      await models.CrmAutomationRun.update({ contactId: primaryId }, { where: { contactId: loser.id }, transaction });
    }

    await models.CrmContact.destroy({ where: { id: { [Op.in]: losers.map((l) => l.id) }, locationId }, transaction });
    const updated = await primary.update(merged, { transaction });
    return { contact: plain(updated), mergedCount: losers.length };
  });
}

module.exports = {
  listNotes,
  createNote,
  deleteNote,
  getActivity,
  findDuplicates,
  mergeContacts,
};
