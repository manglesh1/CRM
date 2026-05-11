// Sweeps unverified sending domains older than UNVERIFIED_TTL_DAYS and
// deletes them. Customers add a domain → publish DNS records → click
// Verify; if they walk away without finishing, the row would otherwise
// linger forever and block re-adding the same domain. Default: 30 days.
//
// Self-scheduling: kicks off once on import, then runs every
// SWEEP_INTERVAL_HOURS. No external cron dependency.

const { Op } = require("sequelize");
const { getModels } = require("../db/models");
const logger = require("../shared/logger");

const UNVERIFIED_TTL_DAYS = Number(process.env.UNVERIFIED_DOMAIN_TTL_DAYS || 30);
const SWEEP_INTERVAL_HOURS = Number(process.env.UNVERIFIED_DOMAIN_SWEEP_HOURS || 6);

async function sweepOnce() {
  try {
    const { CrmEmailDomain, CrmEmailDomainRoute } = getModels();
    const cutoff = new Date(Date.now() - UNVERIFIED_TTL_DAYS * 86400000);

    const stale = await CrmEmailDomain.findAll({
      where: {
        status: { [Op.ne]: "verified" },
        createdAt: { [Op.lt]: cutoff },
      },
    });

    if (stale.length === 0) {
      logger.info({ ttlDays: UNVERIFIED_TTL_DAYS }, "unverified domain sweep — nothing to delete");
      return { deleted: 0 };
    }

    const ids = stale.map((d) => d.id);
    await CrmEmailDomainRoute.update(
      { domainId: null },
      { where: { domainId: { [Op.in]: ids } } }
    );
    await CrmEmailDomain.destroy({ where: { id: { [Op.in]: ids } } });

    logger.info(
      {
        count: stale.length,
        domains: stale.map((d) => d.domain),
        ttlDays: UNVERIFIED_TTL_DAYS,
      },
      "unverified domain sweep — deleted stale domains"
    );
    return { deleted: stale.length };
  } catch (err) {
    logger.error({ err }, "unverified domain sweep failed");
    return { deleted: 0, error: err.message };
  }
}

function startUnverifiedDomainCleaner() {
  // Don't block startup — fire and forget the first sweep, then schedule.
  sweepOnce();
  const intervalMs = SWEEP_INTERVAL_HOURS * 60 * 60 * 1000;
  const handle = setInterval(sweepOnce, intervalMs);
  // Allow process to exit even if interval is still pending (test runs etc.)
  if (handle.unref) handle.unref();
  logger.info(
    { intervalHours: SWEEP_INTERVAL_HOURS, ttlDays: UNVERIFIED_TTL_DAYS },
    "unverified domain cleaner started"
  );
  return handle;
}

module.exports = { sweepOnce, startUnverifiedDomainCleaner, UNVERIFIED_TTL_DAYS };
