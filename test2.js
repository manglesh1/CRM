const { getSequelize } = require('./src/db/sequelize');
const { getModels } = require('./src/db/models');

async function test() {
  try {
    const { CrmMarketingCalendarPlan, sequelize } = getModels();
    
    // First find it to be sure
    const plan = await CrmMarketingCalendarPlan.findOne({ where: { id: '7f4c611e-affd-49e7-a68f-fba7bcc5a787' } });
    console.log("FOUND PLAN:", plan ? plan.toJSON() : "NOT FOUND");

    if (plan) {
      console.log("Attempting to delete with locationId: 1");
      const deleted = await CrmMarketingCalendarPlan.destroy({ where: { id: plan.id, locationId: 1 } });
      console.log("DELETED COUNT:", deleted);
    }
    
    process.exit(0);
  } catch (error) {
    console.error("ERROR:", error);
    process.exit(1);
  }
}

test();
