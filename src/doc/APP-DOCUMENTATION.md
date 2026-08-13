# Legenex Lead Gateway - Full Application Documentation

A lead processing and distribution gateway that ingests leads from suppliers via API, enriches them (HLR lookup, email validation, custom calculations), gates them (TrustedForm cert, required fields), delivers them to buyer endpoints (LeadByte / generic HTTP), fires conversion events (Facebook CAPI, TikTok, Google, etc.), and returns a mapped response to the supplier - all in real time.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Lead Processing Pipeline](#2-lead-processing-pipeline)
3. [Data Model (Entities)](#3-data-model-entities)
4. [Backend Functions](#4-backend-functions)
5. [Frontend Pages](#5-frontend-pages)
6. [Sidebar Navigation](#6-sidebar-navigation)
7. [Settings & Tabs](#7-settings--tabs)
8. [Lead Routes](#8-lead-routes)
9. [Trigger System](#9-trigger-system)
10. [Filter System](#10-filter-system)
11. [Template Engine](#11-template-engine)
12. [Response Mapping](#12-response-mapping)
13. [Design System](#13-design-system)

---

## 1. Architecture Overview

```
Supplier POST
     |
     v
 /functions/leads  (CORS wrapper, extracts API key from headers)
     |
     v
 /functions/processLead  (single source of truth - entire pipeline)
     |
     +--> Auth (API key lookup)
     +--> Create Lead record + assign sequential lead_id
     +--> Load all config (HLR, Email, Destinations, Calculations, Custom Fields, Connectors, Response Mappings)
     +--> Normalize field aliases
     +--> Adaptive field auto-cataloging
     +--> Route detection (standard, direct, data, event, queue, test)
     +--> Pre-classified bypass (Disqualified / custom lead_status)
     +--> Fire on_received triggers (CAPI + Deliveries)
     +--> HLR lookup (phone verification)
     +--> Email validation (format + DNS MX)
     +--> Custom calculations (date buckets, value maps, clones)
     +--> TrustedForm cert gate
     +--> Required fields gate
     +--> Fire custom lead_status triggers
     +--> Direct/Event route bypass
     +--> Forward to LeadByte (standard route)
     +--> Parse LeadByte response -> Sold / Unsold / Queued / Duplicate / Error
     +--> Fire lifecycle triggers (on_sold, on_unsold, on_dq, on_queued, on_rejected, on_duplicates)
     +--> Capture revenue
     +--> Resolve supplier response via ResponseMapping
     +--> Fire outbound webhooks
     +--> Return response to supplier
```

**Tech Stack:** React + Tailwind CSS + shadcn/ui on Vite. Base44 BaaS (auth, database, serverless functions). Deno Deploy for backend functions. Real-time subscriptions for live updates.

---

## 2. Lead Processing Pipeline

The entire pipeline lives in `base44/functions/processLead/entry.ts` (~1685 lines). The `/functions/leads` endpoint is a thin CORS wrapper that extracts the supplier API key from headers and delegates to `processLead`.

### Stage A: Authentication
- API key extracted from `X-API-KEY`, `X_KEY`, `Authorization: Basic`, or payload `_supplier_key`
- Looked up in `ApiKey` entity; must be `active`
- Key type: `master` (no linked supplier) or `supplier` (linked to one Supplier)
- Updates `last_used_at` and increments `request_count`
- 401 if invalid/missing

### Stage B: Lead Creation
- Lead record created with `final_status: 'Processing'`
- Sequential `lead_id` assigned via `Counter` entity (optimistic locking with retries)
- All configuration loaded in parallel: HLR settings, email settings, destinations, calculations, custom fields, API connectors, response mappings

### Stage C: Field Normalization
- Aliases resolved: `phone1` -> `mobile`, `firstname` -> `first_name`, `ipaddress` -> `ip_address`, `trustedform_cert` -> `trustedform_url`, etc.
- Adaptive fields: new inbound keys auto-created as `CustomField` records (if `adaptive_fields_enabled` is true and key not in ignore list). New fields are also appended to the LeadByte payload template if in template mode.

### Stage D: Route Detection
The `lead_route` field (case-insensitive `includes` match) determines processing:

| Route       | Behavior                                                        |
|-------------|-----------------------------------------------------------------|
| `standard`  | Full pipeline: HLR -> Email -> Calculations -> Gates -> LeadByte|
| `direct`    | Bypasses LeadByte; fires `on_sold`; returns "Sold" immediately  |
| `data`      | Same as direct - bypasses LeadByte, fires `on_sold`             |
| `event`     | Fires CAPI only (no deliveries); bypasses LeadByte; returns "Sold" |
| `queue`     | Held for manual processing; fires `on_queued`; returns "Queued" |
| `test`      | Saved only; no processing, no triggers; returns "Queued"        |

### Stage E: Pre-Classified Bypass
If `lead_status` is `Disqualified` or any non-builtin custom status (e.g. "24m Lead"), the lead bypasses HLR, email validation, TrustedForm, and LeadByte entirely. It fires its matching trigger (`on_dq` / `on_<custom>`), awaits all CAPI + delivery sends so logs populate, and returns the actual destination endpoint response.

### Stage F: On Received Triggers
- Fire all matching `ApiConnector` records with trigger `on_received` (fire-and-forget)
- Fire all matching `LeadByteConnector` (non-default) deliveries with trigger `on_received`
- Event route: deliveries are skipped (CAPI only)

### Stage G: HLR Lookup
- Runs if HLR settings `enabled`, route matches filter, supplier matches filter, and `phone_verified` not already present in payload
- Configurable field map: `{mobile, first_name, last_name}` -> inbound field names
- Fail modes:
  - `fail_open` (default): continue without HLR data
  - `fail_closed`: stop processing, return Error
  - `forward_blank`: continue, send empty HLR passthrough fields
- Timeout configurable (default 8000ms)
- Result stored: `hlr_request`, `hlr_response`, `hlr_status`, `hlr_summary_score`

### Stage H: Email Validation
- Runs if `enabled`, route matches, supplier matches, and email is present
- Checks format (regex) + DNS MX records (via `dns.google/resolve`)
- Writes `Yes` / `No` to the `email_valid` system field

### Stage I: Custom Calculations
Runs `CustomCalculation` records sorted by `sort_order`. Each transforms an input field into an output token:

| Transform         | Description                                                    |
|-------------------|----------------------------------------------------------------|
| `date_age_bucket` | Parse a date, compute age in days, match against buckets      |
| `value_map`       | Map an input value to an output value (case-insensitive match)|
| `clone`           | Copy input value to output token                               |
| `script`          | Custom JavaScript (placeholder - currently passes through)    |

Also sets `phone_verified` (from HLR result based on configured source) and `email_valid`.

### Stage J: TrustedForm Gate
- If `require_trustedform_cert` is true (default), leads without a valid TrustedForm cert URL are queued
- Cert URL validated against regex: `^https?://cert.trustedform.com/[0-9a-fA-F]{40}(\?.*)?$`
- Queued leads fire `on_queued` triggers and return "Queued"

### Stage K: Required Fields Gate
- Checks all `CustomField` records with `required: true` (excluding `system` type fields)
- Missing required fields -> lead queued with reason listing the missing fields
- Fires `on_queued` + evaluates notification rules (`lead_queued`, `missing_fields`)

### Stage L: Custom Lead Status Triggers
- Any `lead_status` value that isn't a builtin lifecycle status fires its own trigger here
- Example: "24m Lead" -> trigger `on_24m_lead`

### Stage M: LeadByte Forwarding (Standard Route)
- Default `LeadByteConnector` (marked `is_default`) receives the enriched payload
- Payload built from template (with `{{token}}` placeholders resolved)
- If no default connector configured -> Error
- If lead's effective trigger doesn't match connector's triggers -> skip LeadByte, fire matching trigger
- If lead doesn't match connector filters -> routed to DQ destinations, marked Disqualified

### Stage N: LeadByte Response Parsing

| Response Shape                              | Final Status  | Triggers Fired                          |
|---------------------------------------------|---------------|-----------------------------------------|
| `status: Success`, `records[0].status: Approved` | Sold     | `on_sold`                               |
| `status: Success`, `records[0].status: Rejected`, queueable reason | Queued | `on_queued`                   |
| `status: Success`, `records[0].status: Rejected`, non-queueable    | Unsold | `on_unsold`, `on_dq`, `on_rejected`   |
| Top-level error with "duplicate"            | Duplicate     | `on_duplicates`                         |
| Top-level error with queueable reason       | Queued        | `on_queued`                             |
| Other error                                 | Error         | (error log created)                     |

**Revenue capture:** Sums `revenue` across all buyers with `status: "sold"` in the LeadByte response. Falls back to top-level `lbResult.revenue`. Revenue included in supplier response if: key is `master`, OR supplier type is `Internal`, OR key has `expose_revenue: true`.

### Stage O: Response Mapping
- `ResponseMapping` records (sorted by `sort_order`) match against the LeadByte response using `field_path` + `operator` + `lb_status`
- First match wins; fallback record (`is_fallback: true`) used if no match
- Maps to a `response_label` (returned to supplier) and `final_status`

### Stage P: Finalization
- Lead updated with `final_status`, `processed_at`, `process_time_ms`, `response_returned`
- Outbound webhooks fired (non-blocking) for matching events
- Supplier response returned as JSON

---

## 3. Data Model (Entities)

### Core Entities

| Entity                  | Purpose                                                        |
|-------------------------|----------------------------------------------------------------|
| **Lead**                | The central record - one per inbound lead. Admin-only RLS.    |
| **ApiKey**              | Supplier/master API keys for authentication                   |
| **Supplier**            | Supplier records (Internal, External, Calls) with payout info |
| **Vertical**            | Lead verticals (MVA, Workers Comp, Debt, etc.)                |
| **Brand**               | Brand records with optin URLs                                 |
| **CustomField**         | Field definitions, mapping, required flags, system roles      |
| **CustomCalculation**   | Transform rules (date buckets, value maps, clones)            |
| **LeadByteConnector**   | Delivery destinations (LeadByte, BigQuery, Data, Generic HTTP)|
| **ApiConnector**        | Conversion event connectors (Facebook CAPI, TikTok, etc.)     |
| **ResponseMapping**     | LeadByte response -> supplier response label + final status   |
| **HlrSettings**         | HLR provider config (endpoint, field map, fail mode, filters) |
| **EmailValidationSettings** | Email validation config (enabled, filters)                |
| **AppSettings**         | Global app config (brand, URL, TrustedForm, adaptive fields)  |
| **ErrorLog**            | Error/warning/critical log entries by stage                   |
| **NotificationRule**    | Alert rules (condition type, channels, recipients)            |
| **NotificationEvent**   | Fired notification events                                     |
| **Webhook**             | Outbound webhook endpoints                                    |
| **Counter**             | Atomic counter for sequential lead_id generation              |
| **CertBackupStore**     | TrustedForm cert backup store for recovery                    |
| **AuditLog**            | Cert recovery audit trail                                     |
| **ReferenceKey**        | Reference data for field values (dropdown options)            |
| **PayloadTest**         | Saved payload test templates                                  |
| **IntegrationConfig**   | Integration credentials/settings (WhatsApp, etc.)             |

### Lead Entity Key Fields

| Field                  | Description                                              |
|------------------------|----------------------------------------------------------|
| `lead_id`              | Sequential numeric ID (from Counter)                    |
| `supplier_name`        | Denormalized supplier name from API key                 |
| `supplier_key_id`      | Reference to ApiKey record                              |
| `raw_payload`          | Original inbound JSON                                   |
| `mapped_fields`        | Normalized field JSON                                   |
| `first_name` / `last_name` / `mobile` / `email` | Extracted core fields                        |
| `email_valid`          | Email validation result (Yes/No)                        |
| `final_status`         | Processing / Sold / Unsold / Queued / Disqualified / Returned / Duplicate / Error |
| `queue_reason`         | Reason lead was queued                                  |
| `hlr_*`                | HLR request, response, status, score, error             |
| `leadbyte_*`           | LeadByte request, response, queue_id, record_status, etc.|
| `revenue`              | Captured revenue                                        |
| `capi_log`             | JSON list of CAPI send results                          |
| `delivery_log`         | JSON list of delivery send results                      |
| `trustedform_valid`    | Whether TrustedForm cert passed validation              |
| `response_returned`    | JSON response sent back to supplier                     |
| `process_time_ms`      | Total processing time                                   |
| `archived`             | Soft-delete flag                                        |

### ApiConnector Entity (Conversion Events)

Supports multiple platforms via `platform` field: `facebook`, `tiktok`, `google`, `snapchat`, `taboola`, `other`.

Connector kinds:
- `facebook_capi` - Facebook Conversions API
- `webhook` - Generic webhook
- `generic_http` - Generic HTTP POST/GET

Per-trigger event names:
- `on_received` -> `received_event_name` (fallback: "Lead")
- `on_sold` -> `sold_event_name` (no fallback - blank = skip)
- `on_unsold` -> `unsold_event_name` (fallback: "Lead")
- `on_queued` -> `queued_event_name` (fallback: "Lead")
- `on_dq` -> `dq_event_name` (no fallback - blank = skip)
- `on_rejected` -> `rejected_event_name` (fallback: "Lead")
- `on_duplicates` -> `duplicates_event_name` (fallback: "Lead")

### LeadByteConnector Entity (Deliveries)

Delivery types via `kind` field: `leadbyte`, `bigquery`, `data`, `generic_http`.

One connector is marked `is_default: true` - this is the primary LeadByte destination that receives all standard-route leads. Non-default connectors are additional delivery destinations that fire alongside CAPI on matching triggers.

---

## 4. Backend Functions

| Function                  | Purpose                                                      |
|---------------------------|--------------------------------------------------------------|
| `leads`                   | Public lead intake endpoint (CORS wrapper -> processLead)    |
| `processLead`             | The entire lead processing pipeline (1685 lines)             |
| `health`                  | Health check endpoint                                        |
| `integrationStatus`       | Integration connectivity status                              |
| `recoverTrustedForm`      | Recover TrustedForm cert from CertBackupStore               |
| `sendGmail`               | Send email via Gmail connector                               |
| `sendWhatsapp`            | Send WhatsApp message                                        |
| `sendPayloadTest`         | Send a test payload to a buyer endpoint                      |
| `testCapiConnector`       | Test a CAPI connector with sample data                       |
| `testEmail`               | Test email validation                                        |
| `testHlr`                 | Test HLR lookup                                              |
| `testLeadByte`            | Test LeadByte connector                                      |
| `testLeadByteConnector`   | Test a delivery destination                                  |
| `testEmail`               | Test email validation service                                |

---

## 5. Frontend Pages

| Page                | Route                  | Purpose                                                  |
|---------------------|------------------------|----------------------------------------------------------|
| **Overview**        | `/`                    | Real-time dashboard: KPIs, charts, supplier breakdown    |
| **Leads (all)**     | `/leads`               | All leads table with filtering, detail modal             |
| **Leads (sold)**    | `/leads/sold`          | Sold leads filtered view                                 |
| **Leads (unsold)**  | `/leads/unsold`        | Unsold leads filtered view                               |
| **Leads (DQ)**      | `/leads/disqualified`  | Disqualified leads filtered view                         |
| **Leads (rejected)**| `/leads/rejected`      | Rejected leads filtered view                             |
| **Leads (queued)**  | `/leads/queued`        | Queued leads filtered view                               |
| **Queue Recovery**  | `/queue-recovery`      | Manual re-run of queued leads with cert recovery         |
| **Campaigns**       | `/campaigns`           | Verticals, Suppliers, Brands management (tabbed)         |
| **Buyers**          | `/buyers`              | Buyer management                                          |
| **Deliveries**      | `/deliveries`          | Lead destination configuration + payload templates       |
| **Conversion Events**| `/conversion-events`  | CAPI connector management (Facebook, TikTok, etc.)       |
| **Notifications**   | `/notifications`       | Notification rules + event log                            |
| **Verification**    | `/verification`        | HLR + email validation settings with live testing        |
| **Calculated Fields**| `/calculated-fields`  | Custom calculation rules (date buckets, value maps)      |
| **Payload Tester**  | `/payload-tester`      | AI-assisted payload builder + test sender                |
| **Settings**        | `/settings`            | Tabbed settings page (see below)                         |

### Overview Page Details
- Real-time lead updates via `base44.entities.Lead.subscribe()`
- Date range selector: Today, 7 days, 30 days, All time
- KPI cards: Revenue, Leads, Sold, Unsold, Avg Process Time (with trend vs prior period)
- Pipeline metrics: Sold Rate, Errors, Queued, Duplicates, CAPI Fires
- 14-day stacked bar chart (Sold / Unsold / Queued / Error / Duplicate)
- Outcome distribution donut chart
- Per-supplier breakdown table
- Top rejection reasons
- Recent activity feed (last 20 leads)
- Supplier endpoint URL display with copy button
- Health strip (HLR provider status, last lead time)

---

## 6. Sidebar Navigation

Fixed 248px sidebar, dark background, rounded right corners. Groups persist open/closed state in localStorage.

### Nav Structure

```
Overview                    -> /
Leads (dropdown)            -> /leads
  - Sold Leads              -> /leads/sold
  - Unsold Leads            -> /leads/unsold
  - Disqualified Leads      -> /leads/disqualified
  - Rejected Leads          -> /leads/rejected
  - Queued Leads            -> /leads/queued
Lead Distribution (dropdown)
  - Campaigns               -> /campaigns
  - Deliveries              -> /deliveries
  - Conversion Events       -> /conversion-events
Tools (dropdown)
  - Notifications           -> /notifications
  - Calculated Fields       -> /calculated-fields
  - Verification            -> /verification
  - Payload Tester          -> /payload-tester
Settings (dropdown)         -> /settings
  - General                 -> /settings?tab=general
  - Users                   -> /settings?tab=users
  - API Keys                -> /settings?tab=apikeys
  - Custom Fields           -> /settings?tab=fields
  - Error Logs              -> /settings?tab=errors
```

Footer: Expand All / Collapse All toggle + version number.

### Active State Styling
- Active item: `bg-primary/10 text-foreground` + 3px left accent bar (`bg-primary`)
- Active icon: `text-primary`
- Inactive: `text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent`
- Dropdown children: indented with left border, `text-[12px]`

---

## 7. Settings & Tabs

Settings page at `/settings` uses URL query params for tab state (`?tab=general`).

### Settings Tabs

| Tab            | Component                 | Purpose                                              |
|----------------|---------------------------|------------------------------------------------------|
| General        | `SettingsGeneral`         | Brand name, tagline, base URL, fail mode, TrustedForm, FB API version, adaptive fields |
| Users          | `SettingsUsers`           | User management, roles (admin/user)                 |
| API Keys       | `SettingsApiKeys`         | Supplier/master API keys, expose_revenue toggle     |
| Integrations   | `SettingsIntegrations`    | HLR, email validation, WhatsApp, Gmail connectors   |
| Notifications  | `SettingsNotifications`   | Notification rules, channels, recipients             |
| Custom Fields  | `SettingsCustomFields`    | Field definitions, mapping, required flags           |
| Error Logs     | `ErrorLogs` (embedded)    | Error log viewer with resolve/unresolve              |
| Adaptive Fields| `SettingsIgnoreList`      | Auto-cataloging toggle + ignore list                 |

### Campaigns Page Tabs (separate page)

| Tab        | Component             | Purpose                           |
|------------|-----------------------|-----------------------------------|
| Verticals  | `SettingsVerticals`   | Lead vertical management          |
| Suppliers  | `SettingsSuppliers`   | Supplier management + payouts     |
| Brands     | `SettingsBrands`      | Brand management + optin URLs     |

---

## 8. Lead Routes

Routes are detected from the inbound `lead_route` field (case-insensitive `includes` match):

| Route      | Match       | HLR | Email | TrustedForm | LeadByte | CAPI | Deliveries | Final Status |
|------------|-------------|-----|-------|-------------|----------|------|------------|--------------|
| standard   | (none/other)| Yes | Yes   | Yes         | Yes      | Yes  | Yes        | From LeadByte|
| direct     | "direct"    | Yes | Yes   | Yes         | No       | Yes  | Yes        | Sold         |
| data       | "data"      | Yes | Yes   | Yes         | No       | Yes  | Yes        | Sold         |
| event      | "event"     | Yes | Yes   | Yes         | No       | Yes  | No         | Sold         |
| queue      | "queue"     | No  | No    | No          | No       | on_queued | on_queued | Queued       |
| test       | "test"      | No  | No    | No          | No       | No   | No         | Queued       |

---

## 9. Trigger System

Triggers are derived from the lead's `lead_status` system field:

| Lead Status    | Trigger Key      | When Fired                              |
|----------------|------------------|-----------------------------------------|
| Qualified      | `on_received`    | At intake (after route check)           |
| Sold           | `on_sold`        | LeadByte Approved / direct route       |
| Unsold         | `on_unsold`      | LeadByte Rejected (non-queueable)      |
| Disqualified   | `on_dq`          | LeadByte Rejected / filter mismatch    |
| Queued         | `on_queued`      | TrustedForm gate / required fields gate|
| Rejected       | `on_rejected`    | Non-queueable rejection                |
| Duplicates     | `on_duplicates`  | Duplicate detected by LeadByte          |
| Custom (e.g. "24m Lead") | `on_24m_lead` | After enrichment + gates        |

**Empty triggers array = fire on every lead** (at intake only, gated only by filters).

---

## 10. Filter System

Both `ApiConnector` and `LeadByteConnector` support the same filter system:

### Quick Filters (pill-based multi-select)
- `filter_verticals` - JSON array of vertical codes
- `filter_brands` - JSON array of brand names
- `filter_suppliers` - JSON array of supplier names or SIDs
- `filter_supplier_types` - JSON array of types (Internal, External, Calls)
- `filter_routes` - JSON array of route keys (standard, direct, data, event, queue)

Empty array = match all.

### Field Conditions (advanced)
`filter_conditions` - JSON array of `{field, operator, value}` objects. All must match.

Operators: `equals`, `not_equals`, `contains`, `not_contains`, `starts_with`, `ends_with`, `is_empty`, `is_not_empty`, `gt`, `lt`

Conditions evaluate against the enriched lead data (including calculated fields).

---

## 11. Template Engine

Both CAPI and delivery destinations use the same `{{token}}` template engine.

### Token Syntax
```
{{token_name}}           - simple token
{{token|transform}}      - token with pipe transform
{{token|transform1|transform2}} - chained transforms
```

### Available Transforms
| Transform   | Description                                    |
|-------------|------------------------------------------------|
| `sha256`    | SHA-256 hash (for PII hashing)                |
| `lowercase` | Convert to lowercase                          |
| `uppercase` | Convert to uppercase                          |
| `trim`      | Trim whitespace                               |
| `phone_us`  | Normalize US phone to `1XXXXXXXXXX`           |

### Built-in Tokens
System tokens with aliases: `event_time`, `optin_url`, `user_agent`, `fbc`, `fbp`, `geoip_city`, `geoip_state`, `geoip_country`, `mobile`, `email`, `first_name`, `last_name`, `zip`, `lead_id`, `ip_address`, `event_id`, `conv_value`, `trustedform_url`, `jornaya_token`, `fault`, `treatment`, `attorney`, `incident_date_2`, `incident_date_3`, `accident_details`, `accident_state`, `lead_event`, `content_name`, `content_category`, `vertical`, `brand`, `funnel_name`, `qualification_status`, `event_category`, `lead_event_type`, `value`, `revenue`

Any other token resolves against the lead data object directly: `{{custom_field_name}}`.

### Auto-Hashing (CAPI)
When `auto_hash_capi` is true (default), Meta-required `user_data` fields (`em`, `ph`, `fn`, `ln`, `ct`, `st`, `zp`, `country`, `external_id`, `db`, `ge`) are automatically SHA-256 hashed after normalization. Manual `|sha256` transforms on individual tokens are respected and not double-hashed.

### Trigger Data Overrides
Per-trigger `custom_data` overrides can be configured as a JSON map: `{ "on_dq": { "qualification_status": "Disqualified Lead" } }`. Values support `{{token}}` placeholders.

---

## 12. Response Mapping

`ResponseMapping` records translate LeadByte responses into supplier-facing response labels and final statuses.

| Field            | Description                                              |
|------------------|----------------------------------------------------------|
| `field_path`     | Dot path into LeadByte response (default: `records[0].status`) |
| `operator`       | equals, not_equals, contains, not_contains, starts_with, ends_with, is_empty, is_not_empty |
| `lb_status`      | Value to compare against, or `*` for fallback            |
| `response_label` | Label returned to supplier in `Response` field           |
| `final_status`   | Sold, Unsold, Queued, Duplicate, Error                   |
| `sort_order`     | Evaluation order (first match wins)                      |
| `is_fallback`    | If true, used when no other mapping matches              |

---

## 13. Design System

See `design-system.css` for the portable CSS file.

### Color Summary

| Role      | Hex       | Token             |
|-----------|-----------|-------------------|
| Background| `#252E39` | `--background`    |
| Primary   | `#EE5656` | `--primary`       |
| Text      | `#F2F2F2` | `--foreground`    |
| Card      | `#323B45` | `--card`          |
| Muted     | `#2E353F` | `--muted`         |
| Border    | `#3D454F` | `--border`        |
| Sidebar BG| `#1C2229` | `--sidebar-background` |

### Status Colors

| Status        | Hex       |
|---------------|-----------|
| Sold          | `#22C55E` |
| Unsold        | `#EAB308` |
| Disqualified  | `#F97316` |
| Rejected      | `#EC4899` |
| Queued        | `#A855F7` |
| Error         | `#EF4444` |
| Duplicate     | `#3B82F6` |
| Processing    | `#3B82F6` |

### Fonts
- Inter (heading, body, display)
- JetBrains Mono (mono/data)

### Layout
- Sidebar: 248px fixed left
- Main: `ml-[248px]`, max-width 1400px, padding 24-32px
- Base radius: 10px
- Scrollbar: 6px, dark

---

## Real-Time Updates

The app uses Base44's entity subscription system for live updates:
```js
base44.entities.Lead.subscribe((event) => { /* update state */ });
```
The Overview page subscribes to Lead changes and invalidates React Query caches, causing KPIs and charts to refresh in real time.

---

## Authentication

- Built-in Base44 auth (email/password, Google OAuth, OTP verification)
- All pages behind `ProtectedRoute`
- Lead entity has admin-only RLS (create, read, update, delete)
- Users invited via `base44.users.inviteUser(email, role)`
- Roles: `admin` (full access) and `user