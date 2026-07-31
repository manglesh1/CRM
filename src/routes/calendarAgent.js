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

      // 1. Get city from aeroSportsAdmin API (simulate for prototype)
      let city = "Brampton";
      let state = "ON";
      if (locationId === 2) city = "Scarborough";
      if (locationId === 3) city = "St. Catharines";

      // 2. Call calendarAgent microservice on port 5005
      const agentRes = await fetch("http://localhost:5005/generate-yearly-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, city, state }),
      });

      if (!agentRes.ok) {
        throw new Error(`calendarAgent returned status ${agentRes.status}`);
      }
      
      const planData = await agentRes.json();
      
      if (!planData || !planData.plan) {
        throw new Error("Invalid plan data received from calendarAgent.");
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
