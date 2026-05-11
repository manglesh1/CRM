// Resolves the DNS records that a sending domain needs (SPF / DKIM /
// DMARC / return-path CNAME / MX) against live nameservers, and reports
// per-record + aggregate status. Used by:
//   - POST /api/settings/email/domains/:id/verify (manual button)
//   - the future cron worker that auto-promotes pending domains to verified
//
// Pure utility — no Express coupling, no DB writes; callers persist the
// returned records / status as they see fit.

const dns = require("dns").promises;

function stripQuotes(s) {
  return String(s || "").replace(/^"+|"+$/g, "");
}

// Resolve a single expected DNS record against live nameservers.
// Returns "ok" if published with the expected value, "pending" otherwise.
// Network/DNS errors (NXDOMAIN, NODATA, timeout) → "pending".
async function checkDnsRecord(record, parentDomain) {
  try {
    const host = record.host === "@" ? parentDomain : record.host;
    if (!host) return "pending";

    if (record.type === "TXT") {
      const groups = await dns.resolveTxt(host);
      const flat = groups.map((parts) => parts.join("")).map(stripQuotes);
      const expected = stripQuotes(String(record.value || "")).trim();
      return flat.some((line) => {
        const got = line.trim();
        // DKIM keys may be split / wrapped — accept algorithm + presence of p=
        if (expected.startsWith("k=rsa")) {
          return got.startsWith("k=rsa") && got.includes("p=");
        }
        return got === expected;
      })
        ? "ok"
        : "pending";
    }

    if (record.type === "CNAME") {
      const targets = await dns.resolveCname(host);
      const expected = String(record.value || "").trim().toLowerCase().replace(/\.$/, "");
      return targets.some(
        (t) => t.toLowerCase().replace(/\.$/, "") === expected
      )
        ? "ok"
        : "pending";
    }

    if (record.type === "MX") {
      const rows = await dns.resolveMx(host);
      const [expPriority, expExchange] = String(record.value || "").trim().split(/\s+/);
      const expPriorityNum = Number(expPriority);
      const expExchangeNorm = String(expExchange || "")
        .toLowerCase()
        .replace(/\.$/, "");
      return rows.some(
        (r) =>
          Number(r.priority) === expPriorityNum &&
          String(r.exchange || "").toLowerCase().replace(/\.$/, "") === expExchangeNorm
      )
        ? "ok"
        : "pending";
    }
  } catch (_e) {
    return "pending";
  }
  return "pending";
}

// Run checkDnsRecord across an array of records in parallel and report
// the aggregate status. Returns { records, allOk } so the caller can
// persist and decide whether to flip the domain to "verified".
async function verifyDomainRecords(records, parentDomain) {
  const list = Array.isArray(records) ? records : [];
  const checked = await Promise.all(
    list.map(async (r) => ({ ...r, status: await checkDnsRecord(r, parentDomain) }))
  );
  const allOk = checked.length > 0 && checked.every((r) => r.status === "ok");
  return { records: checked, allOk };
}

module.exports = { checkDnsRecord, verifyDomainRecords };
