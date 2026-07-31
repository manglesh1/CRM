const { getModels } = require('./src/db/models');

const planData = {
  plan: {
    name: '2026 Yearly Marketing Plan - Brampton Trampoline Park',
    description: 'A comprehensive marketing plan for the Brampton Trampoline Park for the calendar year 2026, focusing on seasonal campaigns, holiday events, and student-focused promotions to maximize attendance and engagement throughout the year.',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    rules: [
      {
        title: 'Year-Round Fun & Engagement',
        type: 'planning_campaign',
        description: 'Maintain consistent brand presence and encourage repeat visits throughout the year with loyalty programs, regular social media engagement, and community partnerships, ensuring the trampoline park is a top-of-mind family entertainment destination.'
      }
    ],
    overrides: [
      {
        title: "New Year's Day",
        type: 'planning_holiday',
        startDate: '2026-01-01',
        endDate: '2026-01-01',
        description: 'Public holiday, increased family traffic expected.'
      }
    ]
  }
};

async function testInsert() {
  const db = getModels();
  const locationId = 1;
  const { plan } = planData;

  try {
    const savedPlan = await db.sequelize.transaction(async (t) => {
      const newPlan = await db.CrmMarketingCalendarPlan.create({
        locationId,
        name: plan.name,
        description: plan.description,
        planType: "season",
        status: "draft",
        startDate: plan.startDate,
        endDate: plan.endDate,
        color: "#facc15",
      }, { transaction: t });

      if (plan.rules && plan.rules.length > 0) {
        const rules = plan.rules.map(r => ({
          planId: newPlan.id,
          ...r
        }));
        await db.CrmMarketingCalendarRule.bulkCreate(rules, { transaction: t });
      }

      if (plan.overrides && plan.overrides.length > 0) {
        const overrides = plan.overrides.map(o => ({
          planId: newPlan.id,
          ...o
        }));
        await db.CrmMarketingCalendarOverride.bulkCreate(overrides, { transaction: t });
      }
      return newPlan;
    });
    console.log("SUCCESS:", savedPlan.id);
    process.exit(0);
  } catch (err) {
    console.error("DB INSERT ERROR:", err);
    process.exit(1);
  }
}

testInsert();
