# DataBot query architecture

Verified 30 July 2026 against live records. Applies to `base44/functions/dataBot/entry.ts`.

## Why it was rewritten

The previous version pre-computed every dimension against every period (six windows, five dimensions each, thirteen econ fields per entry, plus a thirty day series, directories, ad spend arrays and a sample of rows), stringified the lot, and put it in one prompt. That payload ran past 100k characters. The model was doing needle-in-a-haystack retrieval over it and hedged with "the data does not specify" even when the number was present.

Successive attempts to fix this with prompt wording all failed, because it was never a wording problem. One of those attempts added a filter that dropped past conversations containing the phrase "data does not specify", which suppressed the evidence of the failure rather than the failure. That filter is gone.

## The pipeline

1. **Plan.** A `gpt-4o-mini` call at temperature 0 sees only the entity directory and the list of valid options. It returns a structured spec: `intent`, `entity_refs`, `group_by`, `period`, `start_date`, `end_date`, `top_n`, `needs_finance`. No lead data is in this prompt.
2. **Execute.** The spec runs deterministically in TypeScript. The model never counts anything. Output is a small result object, typically well under 4k characters.
3. **Narrate.** A second call sees the question and the result object and writes the answer.

If the planner fails or returns nonsense, it falls back to `intent=aggregate, period=all_time, group_by=none`, which still produces a usable answer.

## Entity resolution

Every supplier and buyer is registered in an alias index under all of its identifiers: supplier `name` and `sid`, buyer `company_name`, `name`, `buyer_code` and record `id`. Lookup normalizes case and strips non-alphanumerics.

Two paths feed resolution, and results are deduplicated:

- whatever the planner extracted into `entity_refs`
- a direct scan of the question text

The direct scan matches on word boundaries. This matters: the supplier "Inbounds" must not resolve from the phrase "inbound leads". Verified in both directions.

When an entity resolves, its figures are returned for all seven standard windows at once (today, yesterday, last 7 days, last 30 days, this month, last month, all time), so a follow-up about a different period needs no second round trip.

When a named entity does not resolve, the result carries `unresolved_refs` plus the directory, and the model is instructed to say so and offer the closest names rather than guess.

## Field shape facts (learned the hard way)

These were wrong in the first draft of the rewrite and would have failed silently in production.

**`Lead.buyer_id` holds the buyer CODE, not a Base44 record id.** Live values are `AG1`, `NW2`, `LF3`, `LFWC5`. The join key is `Buyer.buyer_code`. Any code joining `Lead.buyer_id` to `Buyer.id` will match nothing and degrade quietly.

**`Lead.buyer_name` is a real populated column** and is a valid fallback. The mapped_fields bag also carries `buyer_name` and `buyer_id`. The retired version read `bag.buyer` as both the name and the id, which is why buyer questions were unreliable.

**Sids carry suffixes.** `INBNDS-SURVEY` belongs to supplier `INBNDS` (Inbounds). Supplier resolution therefore does a longest-prefix match on sid, sorted longest first so a short code cannot steal a longer one.

**`Lead.supplier_name` is not always a supplier.** Two live rows carry `supplier_name: "Master"` with `sid: "INBNDS-SURVEY"`. Resolution checks the name against known suppliers first and falls through to the sid when it does not match.

**`ssid` is not a Supplier column.** It appears only in the mapped_fields bag, for example `MVA-AR`.

## Day bucketing

`eventDayKey` mirrors `leadEventInstant` in `src/lib/reportMetrics.js` exactly. DataBot and the Leads page must never disagree about which day a lead lands on.

- Only ISO-shaped timestamps are honoured, matching `^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}`.
- US-format strings like `07/30/2026 05:26:44` are ignored on purpose and fall through to `created_date`. Most live leads are in this shape, so in practice most bucketing runs off `created_date`. This is the dashboard's behavior, not a defect introduced here.
- A naive ISO timestamp is a wall clock in `America/Regina`, not UTC. The dashboard uses `fromZonedTime`; the Deno function cannot import date-fns-tz, so it pins the literal `-06:00` offset. Regina is UTC-6 year round with no DST, so this is exact.
- `created_date` is stored without a zone suffix and is a UTC value, so `Z` is appended when missing.

Consequence worth remembering: a lead created at 02:50 UTC on the 30th buckets to the 29th in Regina.

## Periods

Available windows: `today`, `yesterday`, `this_week`, `last_week`, `last_7_days`, `last_30_days`, `this_month`, `last_month`, `all_time`, `custom`.

`this_week` is the calendar week running Sunday through today, the US convention. `last_week` is the previous full Sunday to Saturday. `last_7_days` is a rolling seven day window ending today. These are deliberately different and must not be aliased to each other. An earlier patch aliased "this week" onto `last_7_days`, which returned a number that was correct for a window the user had not asked about.

Every resolved entity also carries a `requested_period` block echoing the exact window that was asked about, with `resolved_to` naming it. This closes the gap between the user's wording and the key names in the result object, which is what caused the model to hedge even when it held the number.

## Deterministic inference beats the planner

The planner is an LLM and it drifts. Two failures were observed in live testing on 30 July 2026:

- It returned `group_by: none` for questions that plainly sliced by a dimension, so the answer degraded to a bare period total.
- It returned `all_time` for a question that said "this month", after which the narrator reported a June date as this month's best day. The date was real; the window was not.

Both are now backstopped by regex inference read straight off the question text. Group inference only fills a gap and an explicit planner choice wins. Period inference OVERRIDES the planner, because plain wording like "this month" is not ambiguous and the planner has been caught getting it wrong.

`period_bounds` reports the earliest and latest day actually inside the window, and the narrator is instructed never to cite a date outside them. That is the second line of defence against the same class of error.

## Conversation history is not a data source

Past conversations contribute the user's QUESTIONS only, never past assistant answers. Feeding old answers back caused the model to reuse figures computed for a different question: asked which BUYER had the worst conversion rate, it answered "LeadFlow" (a supplier) at 45.7%, lifted verbatim from an earlier supplier answer.

An earlier patch tried to fix this by filtering out past messages containing the phrase "data does not specify". That suppressed the evidence rather than the cause and has been removed.

## Cost basis is a correctness constraint

`econ()` derives `lead_cost`, `profit`, `margin_pct` and `cpl` from per-lead cost fields only. Internal suppliers never carry a per-lead price: LeadFlow settles on a 30 percent profit share of window revenue minus window cost, and Legenex has no mapped ad accounts so its cost reads as zero. Every margin figure covering internal supply therefore excludes the real cost base.

Left alone, the bot reported a 99.6 percent margin for LeadFlow and, when challenged with the profit-share rule, used the rule to JUSTIFY the number. The `cost_basis` field in the result is now a hard instruction: state what the figure excludes, and when asked whether such a margin is real, say no and point at Finances.

The durable fix is to fold period ad spend into the cost base for internal suppliers. That depends on the AdSpend level filter being confirmed correct first.

## The 19 July bulk import

Roughly 605 of 1,335 non-archived leads were written in a single batch on 19 July 2026, many within the same second. They carry ISO-format `timestamp` values in the bag pointing at their original event dates, which predate July.

This is why `all_time` is far larger than the sum of the dated windows, and why `last_month` legitimately reads zero. It is correct behaviour, not a bug, but any all-time figure should not be read as current trading. A comparison against an empty window is not evidence of improvement.

## Screenshots

Both bots accept attached images. Paste anywhere while the panel is open, or use the attach button. Up to four per message, 5MB each.

The widget sends `images: [{ media_type, data }]` with `data` base64 encoded, and the function passes them to the model as `image_url` parts using a data URL. Nothing is uploaded or stored anywhere: the bytes travel with the request and the preview data URL stays in the browser.

Two details that matter:

- Previews are stripped out of `history` before sending. They are large data URLs and only the current message's images are needed, so leaving them in would grow every subsequent request.
- Vision needs a multimodal model. If `BotConfig.model` is set to something that does not look multimodal, the call falls back to `gpt-4o-mini` for that request rather than silently dropping the screenshot.

A message with an image and no text is valid. For BuildBot it is treated as "scope the change this screenshot implies".

## BuildBot

BuildBot drafts change requests and never executes them. Two failures were found in live testing on 30 July 2026 and both are fixed:

- **It refused to draft RED work.** Asked to disable a LeadByte connector, it set `is_build: false` and fell through to the analytics path, replying that it only handles analytics. The old system prompt said RED surfaces "must not be edited casually" and the model read that as a refusal instruction. It now must draft RED requests, mark them `risk: red`, and put an approval gate as the first line of `ready_prompt`. Refusing to draft is defined as a failure: drafting is not doing, and the operator needs the scoped request in order to decide.
- **It invented filenames and returned empty exclusion lists.** A schema change came back green with `Do Not Touch: None` and a target of `BuyerEntitySchema.json`, which does not exist. BuildBot now receives a real inventory of pages, component folders, backend functions and shared libs, and is told to prefix anything it is unsure about with `confirm: ` rather than guess. Schema changes are amber and `do_not_touch` is never empty unless the change is genuinely one isolated file.

The inventory is a static string in `entry.ts` and will drift as the app grows. The build channel confirms paths regardless.

## Counting rules

Unchanged and matching the dashboard. Archived leads are excluded, they are retired duplicates. CPL is cost per SOLD lead. Conversion is sold over total received. Ad spend is deduplicated to account level so campaign and ad rows are not double counted.

`lead_type` prefers an explicit `lead_type` in the bag and otherwise applies the sid rule: `LEADFLOW` and `LGNX` are Quiz, everything else is Affiliate.

## Scope

Operator scope gets the query pipeline. The supplier-scoped and buyer-scoped branches are deliberately untouched, because portal scoping is a protected surface. Partner accounts continue to receive only their own projection with the same deny-by-default scope note.

## Known limitation

Every message still pages the full non-archived Lead table, because the event day is derived from the mapped_fields bag and cannot be filtered server side. This is a table scan per question and it will eventually hit the function timeout.

The fix is an additive `event_day` column on Lead, written by `processLead` and backfilled. That touches a protected surface and needs explicit approval before anyone attempts it.
