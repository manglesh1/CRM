const express = require("express");
const auth = require("../shared/auth");
const authorizeLocation = require("../shared/authorizeLocation");
const { getModels } = require("../db/models");
const db = getModels();

const router = express.Router();

router.post(
  "/generate-yearly-plan",
  auth,
  authorizeLocation({ action: "crm:marketing" }),
  async (req, res) => {
    try {
      let { year, locationId } = req.body;
      if (!locationId) {
        locationId = 3; // Default to 3
      }
      if (!year) {
        return res.status(400).json({ error: "Year is required." });
      }
      console.log(`[CRM] Request to generate AI plan: year=${year}, location=${locationId}`);

      // 1. Get park details from Database using raw query (CRM model doesn't map Location directly)
      const [locations] = await db.sequelize.query(
        `SELECT * FROM parks WHERE "locationId" = :locationId LIMIT 1`,
        { replacements: { locationId } }
      );
      const location = locations && locations.length > 0 ? locations[0] : null;
      if (!location) {
        return res.status(404).json({ error: "Location not found." });
      }

      const crypto = require("crypto");
      const requestId = crypto.randomUUID();
      
      const payload = {
        requestId,
        organizationId: location.organizationId,
        locationId: location.locationId,
        parkDetails: {
          name: location.legalBusinessName,
          city: location.townOrCity,
          state: location.stateOrProvince,
          country: location.country,
          timezone: location.timezone,
          currency: location.currency,
          website: location.website,
        },
        schoolDistrictCalendarUrls: [
          ...(location.schoolDistrictCalendarUrls ? location.schoolDistrictCalendarUrls.split('\n').map(u => u.trim()) : []),
          location.schoolDistrictCalendarPdfUrl
        ].filter(Boolean),
        year,
        agentVersion: "1.1",
        schemaVersion: "1.1"
      };

      // 2. Call calendarAgent microservice on port 5005
      const agentRes = await fetch("http://localhost:5005/generate-yearly-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!agentRes.ok) {
        let errorMsg = `calendarAgent returned status ${agentRes.status}`;
        try {
          const errorData = await agentRes.json();
          if (errorData && errorData.error) {
            errorMsg += `: ${errorData.error}`;
          }
        } catch (e) {}
        throw new Error(errorMsg);
      }
      
      const planData = await agentRes.json();
      
      if (!planData || !planData.plan) {
        throw new Error("Invalid plan data received from calendarAgent.");
      }

      // 2.5 Strict validation of Response Contract
      if (planData.requestId !== requestId || planData.locationId !== locationId) {
        throw new Error("Response contract violation: mismatching requestId or locationId.");
      }

      const { plan } = planData;

      // 3. Save to CRM database
      const savedPlan = await db.sequelize.transaction(async (t) => {
        const newPlan = await db.CrmMarketingCalendarPlan.create({
          locationId,
          name: plan.name,
          description: plan.description,
          planType: "season",
          status: "draft",
          startDate: plan.startDate,
          endDate: plan.endDate,
          color: "#facc15", // AI Plan color
        }, { transaction: t });

        if (plan.rules && plan.rules.length > 0) {
          const rules = plan.rules.map(r => ({
            planId: newPlan.id,
            ruleType: r.type,
            title: r.title,
            startDate: r.startDate,
            endDate: r.endDate || r.startDate,
            status: "active",
          }));
          await db.CrmMarketingCalendarRule.bulkCreate(rules, { transaction: t });
        }

        if (plan.overrides && plan.overrides.length > 0) {
          const overrides = plan.overrides.map(o => ({
            planId: newPlan.id,
            overrideType: o.type,
            title: o.title,
            startDate: o.startDate,
            endDate: o.endDate || o.startDate,
            status: "active",
          }));
          await db.CrmMarketingCalendarOverride.bulkCreate(overrides, { transaction: t });
        }

        return newPlan;
      });

      res.json({
        success: true,
        data: savedPlan,
        message: "AI marketing plan generated successfully.",
      });

    } catch (err) {
      console.error("[CRM proxy /calendar-agent/generate-yearly-plan] Error:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
