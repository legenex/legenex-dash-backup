// Canonical campaign resolution. Decides which Campaign a lead belongs to, in a
// fixed, explainable order. This is the ONE place that answers that question, so
// the live pipeline, the simulator and any report all agree.
//
// Order (first match wins):
//   1. Posted campaign_id matched against Campaign.campaign_id (the public code)
//   2. Posted campaign_id matched against the internal Campaign record id
//   3. Posted campaign_id matched against Campaign.name
//   4. Fallback: the lead's vertical matched against Campaign.vertical (then name)
//
// Never throws and never guesses: an unmatched lead resolves to null with a
// reason, and the caller decides what that means. A posted campaign_id that
// matches nothing does NOT silently fall through to the vertical, because that
// would quietly sell a lead into a campaign the supplier did not ask for.
// Pure: the caller supplies the campaigns.

export const CAMPAIGN_MATCH = {
  BY_CODE: 'campaign_code',
  BY_RECORD_ID: 'campaign_record_id',
  BY_NAME: 'campaign_name',
  BY_VERTICAL: 'vertical',
  NONE: 'no_match',
  UNKNOWN_CODE: 'unknown_campaign_id',
};

function norm(v) {
  return String(v ?? '').trim().toLowerCase();
}

// Only campaigns that are switched on may receive leads. Mirrors the Campaign
// contract: status active derives active true.
function isLive(c) {
  if (!c) return false;
  if (c.active === false) return false;
  const status = norm(c.status);
  return status === '' || status === 'active';
}

// lead: the enriched lead data. campaigns: Campaign records.
// Returns { campaign, campaignId, matchedBy, reason }.
export function resolveCampaign(lead, campaigns) {
  const list = (campaigns || []).filter(isLive);
  const posted = norm(lead && (lead.campaign_id ?? lead._campaign));

  if (posted) {
    const byCode = list.find((c) => norm(c.campaign_id) === posted);
    if (byCode) return hit(byCode, CAMPAIGN_MATCH.BY_CODE);

    const byRecordId = list.find((c) => norm(c.id) === posted);
    if (byRecordId) return hit(byRecordId, CAMPAIGN_MATCH.BY_RECORD_ID);

    const byName = list.find((c) => norm(c.name) === posted);
    if (byName) return hit(byName, CAMPAIGN_MATCH.BY_NAME);

    // Posted an explicit campaign that does not exist or is switched off. Fail
    // closed rather than routing the lead somewhere it was not addressed to.
    return {
      campaign: null, campaignId: null, matchedBy: CAMPAIGN_MATCH.UNKNOWN_CODE,
      reason: `Posted campaign_id "${String((lead && (lead.campaign_id ?? lead._campaign)) || '').slice(0, 40)}" did not match an active campaign`,
    };
  }

  // No campaign posted: a campaign IS a vertical, so match on the vertical.
  const vertical = norm(lead && (lead.vertical ?? lead.lead_vertical));
  if (vertical) {
    const byVertical = list.find((c) => norm(c.vertical) === vertical)
      || list.find((c) => norm(c.name) === vertical);
    if (byVertical) return hit(byVertical, CAMPAIGN_MATCH.BY_VERTICAL);
  }

  return {
    campaign: null, campaignId: null, matchedBy: CAMPAIGN_MATCH.NONE,
    reason: vertical
      ? `No active campaign for vertical "${vertical}"`
      : 'Lead carries no campaign_id and no vertical',
  };
}

function hit(campaign, matchedBy) {
  return { campaign, campaignId: campaign.id, matchedBy, reason: null };
}
