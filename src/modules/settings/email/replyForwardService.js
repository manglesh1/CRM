// Reply / forward / BCC settings — per-location row that drives how
// outbound mail is BCC'd and how inbound replies are routed.

const { getModels } = require("../../../db/models");

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function normalize(arr) {
  if (!Array.isArray(arr)) return [];
  return Array.from(
    new Set(
      arr
        .map((v) => String(v || "").trim().toLowerCase())
        .filter((v) => v && isEmail(v))
    )
  );
}

function serialize(row) {
  if (!row) {
    return {
      forwardingAddresses: [],
      bccEmails: [],
      replyAddresses: [],
      forwardToAssignedUser: false,
    };
  }
  return {
    id: row.id,
    locationId: row.locationId,
    forwardingAddresses: row.forwardingAddresses || [],
    bccEmails: row.bccEmails || [],
    replyAddresses: row.replyAddresses || [],
    forwardToAssignedUser: !!row.forwardToAssignedUser,
    updatedAt: row.updatedAt,
  };
}

async function getReplyForward({ locationId } = {}) {
  if (!locationId) {
    const err = new Error("locationId is required");
    err.statusCode = 400;
    throw err;
  }
  const { CrmEmailReplyForwardSettings } = getModels();
  const row = await CrmEmailReplyForwardSettings.findOne({
    where: { locationId: Number(locationId) },
  });
  return serialize(row);
}

async function updateReplyForward({ locationId, ...body } = {}) {
  if (!locationId) {
    const err = new Error("locationId is required");
    err.statusCode = 400;
    throw err;
  }
  const { CrmEmailReplyForwardSettings, CrmEmailDomain } = getModels();

  const forwardingAddresses = normalize(body.forwardingAddresses);
  const bccEmails = normalize(body.bccEmails);
  const replyAddresses = normalize(body.replyAddresses);
  const forwardToAssignedUser = !!body.forwardToAssignedUser;

  // Reject forwarding addresses that share the sending domain — would loop.
  const domains = await CrmEmailDomain.findAll({
    where: { locationId: Number(locationId) },
    attributes: ["domain"],
  });
  const sendingDomains = new Set(domains.map((d) => String(d.domain || "").toLowerCase()));
  const looped = forwardingAddresses.filter((addr) => {
    const dom = addr.split("@")[1];
    return dom && sendingDomains.has(dom);
  });
  if (looped.length) {
    const err = new Error(
      `Forwarding address cannot use the sending domain (${looped.join(", ")}).`
    );
    err.statusCode = 400;
    err.errors = [{ field: "forwardingAddresses", message: err.message }];
    throw err;
  }

  const [row] = await CrmEmailReplyForwardSettings.findOrCreate({
    where: { locationId: Number(locationId) },
    defaults: { locationId: Number(locationId) },
  });
  await row.update({
    forwardingAddresses,
    bccEmails,
    replyAddresses,
    forwardToAssignedUser,
  });
  return serialize(row);
}

module.exports = { getReplyForward, updateReplyForward };
