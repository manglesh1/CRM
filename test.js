const { getSequelize } = require('./src/db/sequelize'); 
getSequelize().query('SELECT id, "locationId" FROM crm_marketing_calendar_plans ORDER BY id DESC LIMIT 1')
  .then(res => { console.log(res[0][0]); process.exit(0); })
  .catch(e => { console.error(e); process.exit(1); });
