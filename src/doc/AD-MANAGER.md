# Ad Manager

Operator section at `/ad-manager`, sitting directly below Operations in the sidebar. It answers one question the ad platforms cannot: what did this spend actually earn once the leads were sold.

## Pages

| Route | Page | What it shows |
| --- | --- | --- |
| `/ad-manager` | Performance Dashboard | Every ad account with synced spend, portfolio KPIs, spend vs verified revenue chart, accounts table, sync roster |
| `/ad-manager/reports` | Ad Reports | One account at a time. Campaigns table with ad set and ad drilldown, plus state, placement, hour and ad breakouts |
| `/ad-manager/creative-analyzer` | Creative Analyzer | Creative leaderboard keyed on Meta ad id, plus hook, creator and concept rollups |
| `/ad-manager/builder` | Ad Builder | Draft only. Publishing to Meta is not wired. Nothing on this screen writes to an ad account |

Gated by the `ad_manager` permission key. That key is in `RESTRICTED_FOR_PARTNERS`, so supplier and buyer roles can never hold it, the same hard rule that protects Lead Distribution and Finances.

## Where the numbers come from

Nothing here is seeded or estimated except one clearly labelled case.

**Reported side.** `AdSpend` rows written by `syncMetaSpend`, which writes three levels per day: `account`, `campaign` and `ad`. Spend, impressions, clicks and Meta reported leads are read straight off those rows. CPM, CTR, CPC and reported CPL are recomputed from the summed base rather than averaged, so a small account cannot skew a blended rate.

**Verified side.** The `Lead` entity plus the LeadByte sold result.

- Account level joins on supplier. `AdSpendMapping.supplier_name` names the supplier that account's traffic arrives under, and `Lead.supplier_name` carries the same label from the gateway. The join is case insensitive because suppliers post inconsistently.
- Campaign level joins on `utm_campaign`, which the funnels pass through verbatim as the Meta campaign name.
- Ad and creative level joins on `utm_content`, but only where an operator has tagged that ad's `utm_content` in `AdCreativeMeta`. Untagged creatives show reported metrics and blank verified columns rather than a guess.

**Qualified** means `final_status` is Sold, Unsold or Returned, that is, the lead cleared the gates and was offered to buyers. Queued, Duplicate, Error and Disqualified leads are cost without qualification, which is exactly why the verified CPL runs above the platform reported CPL.

**The one allocation.** Meta does not report spend by state, placement or hour unless the insights call requests those breakdowns, which `syncMetaSpend` does not do today. On those three breakouts, leads, sold and revenue are real, and spend is allocated across rows in proportion to qualified lead share. Every such column is labelled `Spend (allocated)` and carries an inline note. The By Ad breakout uses real ad level spend and needs no allocation.

**Opportunity score** (the ring in the AI column) is deterministic, not a model output. It is a weighted blend of verified ROAS, verified CPL and qualified volume, computed in `opportunityScore()`. Same inputs, same score, every time. It returns null when there is nothing verified to score.

**Decision** chips come from verified ROAS alone: Scale at 4 and above, Watch at 2.5 and above, Kill below.

## AI analyst

`adManagerInsights` (Deno, OpenAI, `OPENAI_API_KEY`). The frontend posts a pre-aggregated summary built by `insightSummary()`. No lead PII, no lead ids, no raw records leave the browser. The function is read-only and touches no entity. When no spend has synced it returns a deterministic empty state instead of asking the model to invent figures.

## Creative tagging

Meta exposes no hook, concept or creator. `AdCreativeMeta` stores those per Meta ad id, tagged by an operator from the leaderboard. Tagging an ad's `utm_content` is what lets sold revenue join back to the creative. Rollups state how many creatives are untagged and excluded, so a partial rollup never reads as a complete one.

Thumbstop is 3 second views divided by impressions. Hold is thruplays divided by impressions. Both come from `video_3s_views` and `video_thruplays` on ad level `AdSpend` rows. Image ads report neither, so those cells stay empty rather than showing a measured zero.

## Files

```
src/lib/adManagerMetrics.js          pure derivation, no fetching
src/hooks/useAdManagerData.js        one query set for all pages
src/components/admanager/
  adAtoms.jsx                        Panel, KpiTile, HeatCell, Decision, AiScore
  adPanels.jsx                       TopControls, AccountTabs, KPI rows, AI card, StatusBar
  adTables.jsx                       chart, accounts, campaigns, breakouts, sync roster
  adCreatives.jsx                    leaderboard, rollups, tagging dialog
  AdManagerNav.jsx                   sub-menu, clone of OperationsNav
  AdManagerLayout.jsx                SectionShell wrapper
src/pages/admanager/                 the four pages
base44/functions/adManagerInsights/  AI analyst
```

## Boundaries

- The Ad Manager is read-only against leads. It never writes a `Lead`, never touches `processLead`, and never sits on the live lead path.
- The only writes it performs are `AdCreativeMeta` records when tagging a creative, and `AdSpendMapping.ad_account_name` when renaming an account from the tabs.
- Spend totals agree with the Finances Ad Spend tab by construction: both read `AdSpend`, and both count only account level rows for totals so campaign and ad rows never double count.
- Never use em dashes in this section's code or UI text.

## Verifying after a change

1. Run Sync now on the Performance Dashboard. Confirm account, campaign and ad row counts come back non-zero.
2. Confirm portfolio spend on `/ad-manager` matches Total Ad Spend on `/finances?tab=adspend` for the same window.
3. Open Ad Reports, expand a campaign, confirm ad sets and ads appear.
4. Confirm an unmapped ad account shows empty verified columns rather than zeros.
5. Confirm a supplier user and a buyer user cannot reach `/ad-manager` and never see it in the sidebar.
