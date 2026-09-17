const { Op } = require("sequelize");
const { getModels } = require("../../../db/models");

const ROUTE_PRIORITY = {
  marketing: ["campaign", "bulk_email", "workflow", "default_dedicated"],
  transactional: ["client_portal_notification", "client_portal_otp", "default_dedicated"],
};

async function resolveSender({ locationId, useCase, requestedFrom }) {
  if (!locationId) return null;
  const { CrmEmailDomain, CrmEmailDomainRoute } = getModels();
  const normalizedUseCase = useCase === "transactional" ? "transactional" : "marketing";
  const routeKeys = ROUTE_PRIORITY[normalizedUseCase] || ROUTE_PRIORITY.marketing;

  if (requestedFrom) {
    const requestedEmail = extractEmail(requestedFrom);
    const verifiedDomains = await CrmEmailDomain.findAll({
      where: {
        locationId: Number(locationId),
        status: "verified",
        isActive: true,
        useCase: { [Op.in]: [normalizedUseCase, "both"] },
      },
    });
    const requestedDomain = verifiedDomains.find((domain) => (
      selectableSenderEmail(domain).toLowerCase() === requestedEmail.toLowerCase()
    ));
    if (!requestedDomain) {
      const err = new Error("Choose a verified sender email that is enabled for this email type.");
      err.statusCode = 400;
      err.code = "UNVERIFIED_SENDER_EMAIL";
      err.errors = [{ field: "from", message: err.message }];
      throw err;
    }
    return serializeSender(requestedDomain, requestedEmail);
  }

  const routes = await CrmEmailDomainRoute.findAll({
    where: {
      locationId: Number(locationId),
      routeKey: { [Op.in]: routeKeys },
      domainId: { [Op.ne]: null },
    },
    include: [
      {
        model: CrmEmailDomain,
        as: "domain",
        required: true,
        where: {
          status: "verified",
          isActive: true,
          useCase: { [Op.in]: [normalizedUseCase, "both"] },
        },
      },
    ],
  });
  const route = routes.sort(
    (a, b) => routeKeys.indexOf(a.routeKey) - routeKeys.indexOf(b.routeKey)
  )[0];
  if (route?.domain) return serializeSender(route.domain);

  const fallback = await CrmEmailDomain.findOne({
    where: {
      locationId: Number(locationId),
      status: "verified",
      isActive: true,
      useCase: { [Op.in]: [normalizedUseCase, "both"] },
      ...(normalizedUseCase === "marketing" ? { isDefault: true, senderEmail: { [Op.ne]: null } } : {}),
    },
    order: [["isDefault", "DESC"], ["verifiedAt", "DESC"], ["createdAt", "DESC"]],
  });
  return fallback ? serializeSender(fallback) : null;
}

function serializeSender(domain, emailOverride) {
  const email = emailOverride || senderEmail(domain);
  return {
    domainId: domain.id,
    domain: domain.domain,
    provider: domain.provider,
    providerConfigId: domain.providerConfigId,
    from: domain.senderName ? `${quoteDisplayName(domain.senderName)} <${email}>` : email,
  };
}

function senderEmail(domain) {
  return domain.senderEmail || `no-reply@${domain.domain}`;
}

function selectableSenderEmail(domain) {
  const localPart = String(domain.domain || "").split(".")[0] || "events";
  return domain.senderEmail || `${localPart}@${domain.domain}`;
}

function extractEmail(value) {
  const text = String(value || "").trim();
  const bracketed = text.match(/<([^<>]+)>\s*$/);
  return (bracketed?.[1] || text).trim();
}

function quoteDisplayName(value) {
  const name = String(value || "").replace(/"/g, '\\"').trim();
  return `"${name}"`;
}

async function requireMarketingSender({ locationId, from } = {}) {
  const sender = await resolveSender({ locationId, useCase: "marketing", requestedFrom: from });
  if (!sender) {
    const error = new Error("No active verified marketing sender is configured for this location. Verify a sender in CRM Email Settings before sending.");
    error.statusCode = 409;
    error.code = "VERIFIED_MARKETING_SENDER_REQUIRED";
    error.errors = [{ field: "from", message: error.message }];
    throw error;
  }
  return sender;
}

module.exports = { resolveSender, requireMarketingSender };
