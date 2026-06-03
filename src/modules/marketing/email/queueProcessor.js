const marketingEmailService = require("./service");
const queueJobs = require("../../queueJobs/service");

function plain(row) {
  return row?.get ? row.get({ plain: true }) : row;
}

async function processMarketingQueueJob(job) {
  const data = plain(job);
  const payload = data.payload || {};

  if (data.jobType !== queueJobs.JOB_TYPES.MARKETING_CAMPAIGN_AUDIENCE) {
    throw new Error(`Unsupported marketing queue job type: ${data.jobType}`);
  }
  if (!payload.campaignAudienceJobId) {
    throw new Error("marketing.campaign_audience requires payload.campaignAudienceJobId");
  }

  return marketingEmailService.processCampaignAudienceJob(payload.campaignAudienceJobId);
}

module.exports = { processMarketingQueueJob };
