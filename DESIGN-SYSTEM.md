# Legenex Design System (authoritative)

Verified 19 July 2026 against src/index.css and the known-good pages (Overview, Leads, Operations, Finances, Ad Manager, Tools, Distribution Dashboard).

This file is the single source of truth for visual design. It is the canonical location; the former copy under `src/doc/DESIGN-SYSTEM.md` is superseded by this root file. Every page, panel, list, table, dialog, and control in the Legenex Dashboard MUST match it. Claude Code, Claude chat, and any Base44 builder edit follow it without deviation. A page that does not match this spec is a defect, the same as a failing test, regardless of whether it functions.

Reconciliation note: the hex values below are the reference rendering of the semantic tokens; the source of truth for the actual values is the dark-theme HSL triplets in `src/index.css` (dark theme is the product). They were verified to agree on 19 July 2026 (for example `--card: 217 30% 11%` renders `#131924`, `--primary: 358 74% 59%` renders `#E5484D`, `--border: 218 30% 21%` renders `#243044`). Where any doc and the codebase ever disagree, `src/index.css` wins and the stricter rule is kept. The companion `src/doc/design-system.css` holds the status and tag utility classes referenced below.

## The one rule that prevents regression

NEVER use raw hex colors, raw Tailwind color utilities (bg-gray-800, text-white, bg-slate-900, border-gray-700, etc.), or unstyled default elements. ALWAYS use the semantic tokens below. Every color comes from a token. If a needed token does not exist, stop and ask, do not invent a raw color.

## Tokens (defined in src/index.css, dark theme is the product)

Use them as Tailwind classes: bg-background, bg-card, text-foreground, text-muted-foreground, border-border, bg-primary, text-primary, bg-secondary, bg-popover, ring-ring.

| Role | Token | Hex (reference only, never hardcode) |
|---|---|---|
| Canvas / page background | background | #0A0E15 |
| Sidebar | sidebar-background | deeper than canvas |
| Card / panel | card | #131924 |
| Raised panel / popover / dialog | popover | #182030 |
| Secondary / hover surface | secondary, accent | #182030 |
| Primary accent (red) | primary | #E5484D |
| Foreground text | foreground | #EEF2F8 |
| Muted / secondary text | muted-foreground | #8B95A8 |
| Border | border | #243044 |
| Focus ring | ring | #E5484D |
| Data-viz series | chart-1..5 | teal, blue, purple, cyan, green |

Note: the older brand hexes (#252E39 / #1C2229 / #323B45 / #EE5656) are superseded by the tokens above. Match the tokens, not the old hexes.

Lead-lifecycle status colors are the `.status-*` and `.tag-*` classes in `src/doc/design-system.css` (for example `status-sold bg-status-sold`, `status-queued bg-status-queued`). Use those classes for status, never a raw colored utility.

## Required patterns (copy from the known-good pages, do not reinvent)

**Page shell.** Page title (text-2xl or text-xl font semibold, text-foreground) plus a one-line muted-foreground description, then content. No bare h1 on canvas with no treatment.

**Card / panel.** rounded-lg border border-border bg-card, internal padding p-4 to p-6. Content lives in cards. A flat list of rows directly on the canvas with no card and no borders is the regression signature and is not allowed.

**List row / table row.** Rows sit inside a card. Row: border-b border-border, px-4 py-3, hover:bg-accent. Never an unstyled ul/li or a plain div stack.

**Status badge.** inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium. Active uses text-primary or a green chart token; paused/terminated/draft use muted-foreground. Never raw colored text.

**Tabs.** Underline style: a border-b border-border strip, each tab px-3.5 py-2 text-[13px] font-medium border-b-2 -mb-px, active tab border-primary text-foreground, inactive border-transparent text-muted-foreground. Count pills: rounded-full px-1.5 text-[10px], active bg-primary/15 text-primary else bg-muted text-muted-foreground.

**Primary button.** bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm font-medium hover:opacity-90. Secondary: border border-border bg-transparent hover:bg-accent.

**Kebab / row actions (RowActions).** 3-dot trigger is a ghost icon button (text-muted-foreground hover:text-foreground hover:bg-accent rounded-md); dropdown is bg-popover border border-border rounded-md; destructive items text-destructive.

**Dialog / modal.** bg-popover border border-border rounded-lg, title text-foreground, body text-muted-foreground.

**Empty state.** Centered, muted-foreground text, an icon at text-muted-foreground, inside a card. Never a bare sentence on raw canvas.

**Spacing and radius.** Radius: rounded-md for controls, rounded-lg for cards and dialogs, rounded-full for badges and pills. Gaps: gap-1.5 tight, gap-3 to gap-4 normal, section spacing space-y-4 to space-y-6.

**Icons.** lucide-react, size 16 (h-4 w-4) inline, stroke inherits currentColor so it picks up the token color. Nav and section icons required.

## Reference pages (the look to match)

Overview, Leads, Operations (dashboard + buyers + suppliers), Finances, Ad Manager, Tools, and the Lead Distribution Dashboard are correct. When building or editing any Distribution page (Campaigns, Buyers detail, Deliveries), open a known-good page first and mirror its card, row, tab, badge, and button treatment exactly. Operations Buyers is the canonical reference for card, row, tab, badge, and button treatment.

## Enforcement (this is what stops it reaching Nick)

1. A CI check (scripts/check-design-tokens.mjs) greps changed .jsx and .tsx files for banned patterns: raw hex color literals in className, bg-gray-/text-gray-/bg-slate-/text-slate-/border-gray-/border-slate-/bg-zinc- and similar raw palette utilities, and bare text-white/text-black. It fails on any NEW violation over the committed `design-baseline.json`, exactly like the lint zero-new rule. This is a blocking gate alongside tests, lint, and engine:check. Run it with `npm run design:check`.
2. Any new or restructured page must be visually diffed against a named reference page in the PR body: "mirrors Operations Buyers card/row/tab treatment." A PR that restructures a page without this note is not ready.
3. Claude chat, when auditing an AMBER or RED merge or any PR that adds or restructures a page, checks the rendered result against this spec, not only that it renders. A page that renders with flat gray defaults is a defect to flag, not pass.
