const { Op } = require("sequelize");
const { getModels } = require("../../../db/models");

const ROUTE_PRIORITY = {
  marketing: ["campaign", "bulk_email", "workflow", "default_dedicated"],
  transactional: ["client_portal_notification", "client_portal_otp", "default_dedicated"],
};

async function resolveSender({ locationId, useCase }) {
  if (!locationId) return null;
  const { CrmEmailDomain, CrmEmailDomainRoute } = getModels();
  const normalizedUseCase = useCase === "transactional" ? "transactional" : "marketing";
  const routeKeys = ROUTE_PRIORITY[normalizedUseCase] || ROUTE_PRIORITY.marketing;

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
    },
    order: [["isDefault", "DESC"], ["verifiedAt", "DESC"], ["createdAt", "DESC"]],
  });
  return fallback ? serializeSender(fallback) : null;
}

function serializeSender(domain) {
  const email = domain.senderEmail || `no-reply@${domain.domain}`;
  return {
    domainId: domain.id,
    domain: domain.domain,
    provider: domain.provider,
    providerConfigId: domain.providerConfigId,
    from: domain.senderName ? `${quoteDisplayName(domain.senderName)} <${email}>` : email,
  };
}

function quoteDisplayName(value) {
  const name = String(value || "").replace(/"/g, '\\"').trim();
  return `"${name}"`;
}

module.exports = { resolveSender };
