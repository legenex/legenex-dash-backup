# Legenex — Lead Gateway

**Version:** 1.0  
**Last Updated:** 2026-06-29  
**Platform:** Base44 (React + Vite + Tailwind CSS + Deno backend)

---

## 1. Overview

Legenex is a lead intake, enrichment, and distribution gateway. It accepts inbound lead submissions from external suppliers via a public API endpoint, validates and enriches each lead (HLR lookup, TrustedForm cert validation, custom calculations), forwards it to LeadByte for monetization, fires conversion events (Facebook CAPI, generic webhooks) at each pipeline stage, and returns a standardized response back to the supplier.

The entire system is admin-gated: only admin-role users can read, create, update, or delete lead records. Suppliers interact exclusively through the public API using API keys.

---

## 2. Tech Stack

| Layer        | Technology |
|-------------|-----------|
| Frontend    | React 18, Vite, Tailwind CSS, shadcn/ui, Radix UI |
| State       | React Query (@tanstack/react-query), React Router |
| Charts      | Recharts |
| Backend     | Deno Deploy (backend functions) |
| Database    | Base44 BaaS (entity-based JSON schemas) |
| Auth        | Base44 Auth (email/password, Google OAuth, OTP) |
| Integrations| Core (InvokeLLM, SendEmail, UploadFile, GenerateImage, GenerateSpeech, GenerateVideo, ExtractDataFromUploadedFile, CreateFileSignedUrl, UploadPrivateFile, TranscribeAudio) |

### Installed Packages

```
@base44/sdk, @base44/vite-plugin
@hello-pangea/dnd (drag and drop)
@hookform/resolvers, react-hook-form, zod
@radix-ui/* (dialog, tabs, select, popover, checkbox, switch, etc.)
@tanstack/react-query
canvas-confetti
class-variance-authority, clsx, tailwind-merge
cmdk
date-fns
embla-carousel-react
framer-motion
html2canvas
input-otp
jspdf
lodash
lucide-react (icons)
moment
next-themes
react, react-dom
react-day-picker
react-hot-toast
react-leaflet (maps)
react-markdown
react-quill (rich text)
react-resizable-panels
react-router-dom
recharts
sonner
tailwindcss-animate
three (3D)
vaul
```

---

## 3. Project Structure

```
├── App.jsx                    # Router + auth/providers wrapper
├── index.html                 # HTML entry point (title, meta, favicon)
├── index.css                  # Design tokens, Tailwind base, status colors
├── tailwind.config.js         # Token → Tailwind class mapping
├── main.jsx                   # Vite entry
│
├── src/
│   ├── doc/                   # Project documentation (this folder)
│   │   ├── PROJECT.md
│   │   ├── index.css
│   │   └── index.html
│   │
│   ├── pages/                 # Route-level pages
│   │   ├── Overview.jsx          # Dashboard / KPIs
│   │   ├── LeadsView.jsx         # Leads table (all/sold/unsold/queued/rejected/disqualified)
│   │   ├── QueueRecovery.jsx     # Queued leads + TrustedForm recovery
│   │   ├── Campaigns.jsx         # Lead distribution / campaigns
│   │   ├── Buyers.jsx            # Buyer management
│   │   ├── Suppliers.jsx         # Suppliers + brands tabs
│   │   ├── Deliveries.jsx        # Outbound delivery destinations
│   │   ├── ConversionEvents.jsx # CAPI / webhook connectors
│   │   ├── Notifications.jsx     # Notification rules + events
│   │   ├── Verification.jsx      # HLR settings
│   │   ├── Settings.jsx          # Tabbed settings hub
│   │   ├── CustomCalculations.jsx
│   │   ├── Login.jsx
│   │   ├── Register.jsx
│   │   ├── ForgotPassword.jsx
│   │   └── ResetPassword.jsx
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppLayout.jsx      # Main authenticated layout (sidebar + outlet)
│   │   │   └── Sidebar.jsx        # Navigation sidebar
│   │   ├── leads/
│   │   │   ├── LeadsTable.jsx
│   │   │   ├── LeadsFilterBar.jsx
│   │   │   ├── LeadDetailModal.jsx
│   │   │   ├── ErrorStatusPill.jsx
│   │   │   ├── BulkActionBar.jsx
│   │   │   └── QueueRecoveryRow.jsx
│   │   ├── settings/
│   │   │   ├── SettingsGeneral.jsx
│   │   │   ├── SettingsSuppliers.jsx
│   │   │   ├── SettingsBrands.jsx
│   │   │   ├── SettingsApiKeys.jsx
│   │   │   ├── SettingsKeys.jsx
│   │   │   ├── SettingsLeadByte.jsx
│   │   │   ├── SettingsApiConnectors.jsx
│   │   │   ├── SettingsCustomFields.jsx
│   │   │   ├── SettingsIgnoreList.jsx
│   │   │   ├── SettingsUsers.jsx
│   │   │   ├── SettingsWebhooks.jsx
│   │   │   ├── TestLeadSender.jsx
│   │   │   ├── ConnectorFilterPanel.jsx
│   │   │   ├── ConnectorConditionsEditor.jsx
│   │   │   ├── HighlightedPayloadEditor.jsx
│   │   │   ├── ActualPayloadEditor.jsx
│   │   │   ├── TokenReferencePanel.jsx
│   │   │   └── TransformsReference.jsx
│   │   ├── overview/
│   │   │   ├── HealthStrip.jsx
│   │   │   ├── KpiCard.jsx
│   │   │   └── StatCard.jsx
│   │   ├── calculations/
│   │   │   └── OutputFieldPicker.jsx
│   │   ├── shared/
│   │   │   ├── PageHeader.jsx
│   │   │   ├── RefreshButton.jsx
│   │   │   ├── StatusPill.jsx
│   │   │   ├── JsonViewer.jsx
│   │   │   └── ComingSoon.jsx
│   │   ├── ui/                  # shadcn/ui primitives (button, input, dialog, etc.)
│   │   ├── ProtectedRoute.jsx
│   │   ├── ScrollToTop.jsx
│   │   ├── UserNotRegisteredError.jsx
│   │   ├── AuthLayout.jsx
│   │   └── GoogleIcon.jsx
│   │
│   ├── functions/             # Backend functions (Deno)
│   │   ├── leads.js              # Public API gateway (wraps processLead)
│   │   ├── processLead.js        # Core lead processing pipeline
│   │   ├── health.js             # Health check
│   │   ├── recoverTrustedForm.js# Cert backup recovery
│   │   ├── testHlr.js            # HLR endpoint tester
│   │   ├── testLeadByte.js       # LeadByte endpoint tester
│   │   ├── testLeadByteConnector.js
│   │   └── testCapiConnector.js
│   │
│   ├── entities/              # Entity JSON schemas
│   │   ├── Lead.json
│   │   ├── ApiKey.json
│   │   ├── Supplier.json
│   │   ├── Brand.json
│   │   ├── CustomField.json
│   │   ├── CustomCalculation.json
│   │   ├── HlrSettings.json
│   │   ├── AppSettings.json
│   │   ├── LeadByteConnector.json
│   │   ├── ApiConnector.json
│   │   ├── ResponseMapping.json
│   │   ├── Webhook.json
│   │   ├── NotificationRule.json
│   │   ├── NotificationEvent.json
│   │   ├── ErrorLog.json
│   │   ├── AuditLog.json
│   │   ├── CertBackupStore.json
│   │   └── Counter.json
│   │
│   ├── lib/
│   │   ├── AuthContext.jsx       # Auth provider + loading states
│   │   ├── query-client.js       # React Query client
│   │   ├── app-params.js         # App-level parameters
│   │   ├── PageNotFound.jsx
│   │   └── utils.js              # cn() class merge utility
│   │
│   ├── hooks/
│   │   └── use-mobile.jsx
│   │
│   ├── utils/
│   │   ├── index.ts
│   │   └── leadError.js
│   │
│   └── api/
│       └── base44Client.js       # Pre-initialized SDK client
│
└── agents/                    # AI agent configs (optional)
```

---

## 4. Routing (App.jsx)

| Route              | Page              | Access  |
|--------------------|-------------------|---------|
| `/`                | Overview          | Auth    |
| `/leads`           | LeadsView (all)   | Auth    |
| `/leads/sold`      | LeadsView (sold)  | Auth    |
| `/leads/unsold`    | LeadsView (unsold)| Auth    |
| `/leads/disqualified` | LeadsView (dq) | Auth    |
| `/leads/rejected`  | LeadsView (reject)| Auth    |
| `/leads/queued`    | LeadsView (queued)| Auth    |
| `/queue-recovery`  | QueueRecovery     | Auth    |
| `/campaigns`       | Campaigns         | Auth    |
| `/buyers`          | Buyers            | Auth    |
| `/suppliers`       | Suppliers         | Auth    |
| `/deliveries`      | Deliveries        | Auth    |
| `/conversion-events` | ConversionEvents | Auth  |
| `/notifications`   | Notifications     | Auth    |
| `/verification`    | Verification      | Auth    |
| `/calculations`    | CustomCalculations| Auth    |
| `/settings`        | Settings          | Auth    |
| `/login`           | Login             | Public  |
| `/register`        | Register          | Public  |
| `/forgot-password` | ForgotPassword    | Public  |
| `/reset-password`  | ResetPassword     | Public  |

Auth pages use `ProtectedRoute` and `AuthProvider`. Hard redirects (`window.location.href`) are used after auth actions so the provider re-initializes.

---

## 5. Data Model (Entities)

### Lead
The central record. Stores everything from the raw inbound payload through HLR, LeadByte, CAPI logs, and final status.

| Field | Type | Description |
|-------|------|-------------|
| `supplier_name` | string | Supplier who sent this lead |
| `supplier_key_id` | string | Reference to ApiKey |
| `raw_payload` | string | JSON of original inbound |
| `mapped_fields` | string | JSON of normalized fields |
| `first_name`, `last_name`, `mobile`, `email` | string | Denormalized core fields |
| `lead_id` | number | Unique sequential ID |
| `revenue` | number | Revenue attributed |
| `conv_value` | number | Conversion value |
| `hlr_request` / `hlr_response` | string | HLR JSON |
| `hlr_status` | string | e.g. "Exact Match" |
| `hlr_summary_score` | number | 0–100 |
| `hlr_error` | string | Error if HLR failed |
| `leadbyte_request` / `leadbyte_response` | string | LeadByte JSON |
| `leadbyte_queue_id` | string | |
| `leadbyte_record_status` | string | Approved / Rejected |
| `leadbyte_lead_id` | number | |
| `leadbyte_rejection_id` | string | |
| `leadbyte_process_time` | number | Seconds |
| `final_status` | enum | Processing, Sold, Unsold, Queued, Disqualified, Duplicate, Error |
| `queue_reason` | string | Why the lead was queued |
| `trustedform_valid` | boolean | |
| `cert_source` | string | inbound / backup_store |
| `capi_log` | string | JSON list of CAPI results |
| `error_stage` | string | Stage where error occurred |
| `response_returned` | string | JSON sent back to supplier |
| `processed_at` | date-time | |
| `process_time_ms` | number | |
| `archived` | boolean | |

**RLS:** Admin-only for create, read, update, delete.

### ApiKey
API keys for supplier authentication. Master keys have no linked supplier; supplier keys link to one supplier.

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Friendly label |
| `type` | enum | master / supplier |
| `supplier_name` | string | Denormalized |
| `supplier_id` | string | Reference to Supplier |
| `key` | string | Full key (only at creation) |
| `key_prefix` | string | First 16 chars |
| `active` | boolean | |
| `last_used_at` | date-time | |
| `request_count` | number | |
| `allowed_ips` | string | JSON array |
| `expose_revenue` | boolean | If true, supplier responses include revenue |

### Supplier
| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Display name |
| `sid` | string | Supplier SID (used as `{{sid}}` token) |
| `supplier_type` | enum | Internal / External / Calls |
| `payout_type` | enum | Flat CPL / Revenue % / Profit % / Inbound Call |
| `payout_value` | number | |
| `email` | string | |
| `landing_page_url` | string | |
| `brand` | string | |
| `active` | boolean | |

### Brand
| Field | Type | Description |
|-------|------|-------------|
| `brand_name` | string | |
| `brand_code` | string | e.g. CAC, CMC |
| `website_url` | string | |
| `optin_url` | string | Default landing page |
| `active` | boolean | |

### CustomField
Auto-cataloged inbound fields. Controls which fields are forwarded to LeadByte.

| Field | Type | Description |
|-------|------|-------------|
| `field_name` | string | Token name |
| `label` | string | Human label |
| `field_type` | enum | string / number / boolean / date / Calculated |
| `source` | enum | inbound / hlr / leadbyte |
| `sample_value` | string | |
| `include_in_leadbyte` | boolean | |
| `leadbyte_field_name` | string | |
| `auto_created` | boolean | |
| `sort_order` | number | |
| `required` | boolean | If true, missing → queue |

### CustomCalculation
Transforms inbound fields into calculated outputs.

| Field | Type | Description |
|-------|------|-------------|
| `output_token` | string | e.g. accident_date |
| `output_label` | string | |
| `transform_type` | enum | date_age_bucket / value_map / script |
| `input_field` | string | |
| `config` | string | JSON config |
| `enabled` | boolean | |
| `sort_order` | number | |

### HlrSettings
| Field | Type | Description |
|-------|------|-------------|
| `provider_name` | string | |
| `endpoint_url` | string | |
| `enabled` | boolean | |
| `timeout_ms` | number | Default 8000 |
| `fail_mode` | enum | fail_open / fail_closed / forward_blank |
| `request_field_map` | string | JSON |
| `passthrough_fields` | string | JSON array |
| `min_summary_score` | number | |
| `phone_verified_source` | enum | lh_hlr_response / summary_score / boolean |

### AppSettings
| Field | Type | Description |
|-------|------|-------------|
| `brand_name` | string | Default "Legenex" |
| `brand_tagline` | string | Default "Lead Gateway" |
| `public_base_url` | string | |
| `default_fail_mode` | enum | |
| `adaptive_fields_enabled` | boolean | Auto-catalog new inbound keys |
| `adaptive_fields_ignore_list` | string | JSON array |
| `require_trustedform_cert` | boolean | Default true |
| `fb_api_version` | string | Default v25.0 |
| `fb_api_version_auto` | boolean | |

### LeadByteConnector
Default connector (is_default=true) is the primary LeadByte destination. Non-default records are delivery destinations.

| Field | Type | Description |
|-------|------|-------------|
| `api_name` | string | |
| `kind` | enum | leadbyte / generic_http |
| `target_url` | string | |
| `http_method` | enum | POST / GET |
| `content_type` | enum | application/json / x-www-form-urlencoded |
| `headers` | string | JSON array of {key, value} |
| `payload_template` | string | JSON template with {{token}} |
| `enabled` | boolean | |
| `is_default` | boolean | |
| `forwarding_mode` | enum | pass-through / template |
| `test_payload_last_used` | string | |
| `filter_brands` / `filter_suppliers` / `filter_supplier_types` | string | JSON arrays |
| `filter_conditions` | string | JSON array of {field, operator, value} |
| `triggers` | string | JSON array: on_received, on_sold, on_unsold, on_dq, on_queued |

### ApiConnector
Conversion event connectors (Facebook CAPI, generic webhooks).

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | |
| `kind` | enum | facebook_capi / webhook / generic_http |
| `fb_pixel_id` | string | |
| `fb_access_token` | string | |
| `fb_test_event_code` | string | |
| `fb_api_version` | string | |
| `received_event_name` | string | Default "Lead" |
| `sold_event_name` | string | Default "SubmittedApplication" |
| `unsold_event_name` | string | |
| `queued_event_name` | string | |
| `dq_event_name` | string | |
| `action_source` | string | Default "website" |
| `auto_hash_capi` | boolean | Auto SHA-256 hash user_data |
| `target_url` | string | For webhooks |
| `http_method` / `content_type` / `headers` / `payload_template` | | Same as LeadByteConnector |
| `triggers` | string | JSON array |

### ResponseMapping
Maps LeadByte responses to supplier-facing labels and internal statuses.

| Field | Type | Description |
|-------|------|-------------|
| `field_path` | string | Dot path e.g. records[0].status |
| `operator` | enum | equals / not_equals / contains / etc. |
| `lb_status` | string | Value to compare, or * for fallback |
| `response_label` | string | Label returned to supplier |
| `final_status` | enum | Sold / Unsold / Queued / Duplicate / Error |
| `sort_order` | number | |
| `is_fallback` | boolean | |

### Other Entities
- **Webhook** — Outbound webhook destinations with event filters
- **NotificationRule** — Alert rules (errors_same_stage, hlr_unreachable, leadbyte_non_success, sold_rate_below, api_error, capi_failure, lead_queued, missing_fields)
- **NotificationEvent** — Triggered notification log
- **ErrorLog** — Error log with stage, severity, message, detail
- **AuditLog** — TrustedForm cert recovery audit trail
- **CertBackupStore** — Backup cert store for recovery
- **Counter** — Atomic counter for lead_id sequence

---

## 6. Lead Processing Pipeline

The pipeline lives in `functions/processLead.js`. The public endpoint `functions/leads.js` delegates all logic to it.

### Pipeline Stages

```
[Supplier POST] → /functions/leads
                        │
                        ▼
                 ┌── processLead ──────────────────────────┐
                 │                                          │
                 │  a. AUTH — validate API key               │
                 │  b. CREATE LEAD — DB record + lead_id    │
                 │  c. ADAPTIVE FIELDS — auto-catalog        │
                 │  d. FIRE on_received connectors           │
                 │  e. HLR LOOKUP — enrich phone data        │
                 │  f. RUN CALCULATIONS — custom transforms  │
                 │  g. GATE: TrustedForm cert                │
                 │  h. GATE: Required custom fields          │
                 │  i. FORWARD TO LEADBYTE                   │
                 │  j. PARSE LEADBYTE RESPONSE               │
                 │  k. RESOLVE via ResponseMapping            │
                 │  l. FIRE on_sold / on_unsold / on_queued  │
                 │  m. FIRE outbound webhooks                │
                 │  n. RETURN supplier response               │
                 │                                          │
                 └──────────────────────────────────────────┘
```

### Authentication
- API key from headers (`X-API-KEY`, `X_KEY`, `x-api-key`, `x_key`), Basic Auth, or payload (`_supplier_key`)
- Key looked up in `ApiKey` entity; must be `active`
- `last_used_at` and `request_count` updated each request
- Master keys attribute to "Master"; supplier keys attribute to the linked supplier

### Lead Creation
- Raw payload stored in `raw_payload`
- Normalized fields stored in `mapped_fields`
- Unique `lead_id` assigned via atomic counter (`Counter` entity with optimistic locking)

### Adaptive Fields
When `adaptive_fields_enabled` is true:
- New inbound keys are auto-created as `CustomField` records
- Ignored keys: api_key, x_key, authorization, token, secret, password, sig, signature (plus configurable ignore list)
- In template mode, new fields are appended to the LeadByte connector's `payload_template`

### HLR Lookup
- If `HlrSettings.enabled`, sends a POST to `endpoint_url` with mapped fields
- Timeout configurable (default 8s)
- Fail modes:
  - `fail_open` — continue without HLR data
  - `fail_closed` — return Error to supplier
  - `forward_blank` — continue with blank HLR fields

### Calculations
Custom calculations run in `sort_order` order:
- `date_age_bucket` — bucket a date field by age
- `value_map` — map a value to another
- `script` — passthrough

### TrustedForm Gate
- When `require_trustedform_cert` is true (default), leads without a valid cert are Queued
- Cert URL validated against: `^https?://cert\.trustedform\.com/[0-9a-fA-F]{40}(\?.*)?$`
- Queued leads fire `on_queued` triggers and notification rules

### Required Fields Gate
- Custom fields with `required: true` are checked
- Missing required fields → Queued with reason listing missing field names

### LeadByte Forwarding
- Default connector (is_default=true) is the primary destination
- Connector filters checked: brands, suppliers, supplier_types, conditions
- Non-matching leads are Disqualified and routed to DQ destinations
- Payload built via template (token substitution) or pass-through
- Response parsed for status, revenue, rejection reasons

### Response Parsing
LeadByte responses are parsed in this order:
1. **Success + Approved** → Sold; revenue captured from `buyers[0].revenue` or `lbResult.revenue`; fire `on_sold`
2. **Success + Rejected** → Check rejection reason:
   - Queueable patterns (missing, required, invalid, not provided) → Queued; fire `on_queued`
   - Otherwise → Unsold; fire `on_unsold` + `on_dq`
3. **Top-level non-success** → Check `errors[]`:
   - Duplicate → Duplicate
   - Queueable → Queued
   - Otherwise → Error

### Response Mapping
After parsing, `resolveResponseMapping` runs:
- Evaluates `ResponseMapping` rules in `sort_order` order
- First match wins; fallback rule used if no match
- The incoming `reason` field is preserved and carried through to the mapped response
- If no mappings exist, the fallback response from the parse stage is used

### Revenue Exposure
- Revenue is only included in the supplier response when the API key has `expose_revenue: true`
- Revenue is formatted as a 2-decimal string
- Non-exposed keys never see revenue

### Supplier Response Format
Every response includes a `Response` field and, where applicable, a `reason` field:

| Status | Response | Reason |
|--------|----------|--------|
| Sold | `{ "Response": "Sold" }` | — |
| Unsold | `{ "Response": "Unsold", "reason": "<rejection>" }` | LeadByte rejection reason |
| Queued | `{ "Response": "Queued", "reason": "<queue reason>" }` | Queue reason |
| Disqualified | `{ "Response": "Unsold", "reason": "Did not match..." }` | Filter message |
| Duplicate | `{ "Response": "Duplicate", "reason": "<error>" }` | Duplicate error |
| Error | `{ "Response": "Error", "reason": "<message>" }` | Error message |

When `expose_revenue` is true and revenue was captured, Sold responses also include `"revenue": "1.00"`.

### Connectors & Deliveries (Fire-and-Forget)
- `fireConnectors()` — fires Conversion Event connectors (CAPI / webhooks) matching the trigger
- `fireDeliveries()` — fires non-default LeadByteConnector destinations
- Both use the same filter logic: brands, suppliers, supplier_types, conditions, triggers
- CAPI results appended to lead's `capi_log`
- Failures logged to ErrorLog and trigger notification rules

### CAPI (Facebook Conversions API)
- Uses connector's `payload_template` with `{{token}}` placeholders
- Auto-hashes Meta-required user_data fields (em, ph, fn, ln, ct, st, zp, country, external_id, db, ge) when `auto_hash_capi` is true
- Manual `|sha256` transforms on individual tokens are respected and not double-hashed
- Token transforms: `sha256`, `lowercase`, `uppercase`, `trim`, `phone_us`

### Outbound Webhooks
After finalization, outbound `Webhook` records matching the `lead.<status>` event are fired asynchronously.

---

## 7. Backend Functions

| Function | Purpose |
|----------|---------|
| `leads` | Public API gateway; normalizes auth headers, handles CORS, delegates to `processLead` |
| `processLead` | Core pipeline (auth → create → enrich → gate → LeadByte → map → respond) |
| `health` | System health check |
| `recoverTrustedForm` | Recovers cert URLs from CertBackupStore |
| `testHlr` | Tests HLR endpoint connectivity |
| `testLeadByte` | Tests LeadByte endpoint connectivity |
| `testLeadByteConnector` | Tests a specific LeadByte connector with a sample payload |
| `testCapiConnector` | Tests a CAPI connector with a sample payload |

### Frontend Usage
```js
import { someFunction } from "@/functions/someFunction";
const response = await someFunction({ someParam: "someValue" });
```

---

## 8. Design System

### Brand Colors
- **Background:** `#252E39` (dark slate)
- **Primary:** `#EE5656` (coral red)
- **Text:** `#FFFFFF` / `#F2F2F2`

### Tokens (index.css)
All colors are defined as HSL triplets in `:root` and `.dark`. Tailwind classes map to tokens via `tailwind.config.js`.

| Token | HSL | Hex (approx) |
|-------|-----|---------------|
| `--background` | 212 20% 17% | #252E39 |
| `--foreground` | 0 0% 95% | #F2F2F2 |
| `--card` | 213 19% 20% | #2A343F |
| `--primary` | 0 82% 63% | #EE5656 |
| `--secondary` | 212 18% 25% | #353F4B |
| `--muted` | 212 18% 22% | #2E3742 |
| `--border` | 212 15% 28% | #3D4651 |
| `--sidebar-background` | 213 20% 14% | #1E2630 |

### Fonts
- **Heading/Body/Display:** Inter (300–800 weights)
- **Mono:** JetBrains Mono (400–600 weights)

### Status Colors
```css
.status-sold       { color: #22C55E; }  /* Green */
.status-unsold     { color: #F59E0B; }  /* Amber */
.status-error      { color: #EF4444; }  /* Red */
.status-processing { color: #3B82F6; }  /* Blue */
.status-queued     { color: #A855F7; }  /* Purple */
.status-duplicate  { color: #06B6D4; }  /* Cyan */
```

### Radius
`--radius: 0.625rem` (10px) — applied to cards, buttons, inputs.

---

## 9. Authentication

The platform owns the auth backend (tokens, sessions, email verification). Auth pages ship pre-built:

- `Login.jsx` — email/password + Google OAuth + forgot link
- `Register.jsx` — email/password/confirm + Google + register → OTP → verifyOtp flow
- `ForgotPassword.jsx` — email → resetPasswordRequest
- `ResetPassword.jsx` — `?token=` + new password → resetPassword

### SDK Methods
```js
base44.auth.me()                    // current user
base44.auth.isAuthenticated()       // Promise<boolean>
base44.auth.updateMe(data)          // persist extra data
base44.auth.logout(redirectUrl?)    // redirect
base44.auth.redirectToLogin(nextUrl?)
```

### Route Protection
Authenticated pages are nested under `ProtectedRoute`:
```jsx
<Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
  <Route element={<AppLayout />}>
    <Route path="/" element={<Overview />} />
    ...
  </Route>
</Route>
```

---

## 10. Entity SDK

```js
import { base44 } from '@/api/base44Client';

// User-scoped (app-user token)
base44.entities.Lead.list('-updated_date', 20);
base44.entities.Lead.filter({ final_status: 'Sold' }, '-created_date', 10);
base44.entities.Lead.create({ supplier_name: 'Test', final_status: 'Processing' });
base44.entities.Lead.update(id, { final_status: 'Sold' });
base44.entities.Lead.delete(id);

// Service-scoped (admin) — only in backend functions
base44.asServiceRole.entities.Lead.list();

// Bulk operations
base44.entities.Lead.bulkCreate([{...}, {...}]);
base44.entities.Lead.bulkUpdate([{id, ...}, ...]);
base44.entities.Lead.updateMany({status: 'active'}, {$set: {status: 'done'}});
base44.entities.Lead.deleteMany({status: 'archived'});

// Realtime subscriptions
const unsubscribe = base44.entities.Lead.subscribe((event) => { ... });
```

---

## 11. Integrations (Core package)

| Endpoint | Description |
|----------|-------------|
| `InvokeLLM` | LLM call with optional JSON schema, web search, file attachments |
| `SendEmail` | Send email (optional from_name) |
| `UploadFile` | Upload to public files directory → `{file_url}` |
| `UploadPrivateFile` | Upload to private storage → `{file_uri}` |
| `CreateFileSignedUrl` | Signed download URL for private file |
| `GenerateImage` | AI image generation |
| `GenerateSpeech` | TTS → MP3 URL |
| `GenerateVideo` | AI video (Veo 3.x) → video URL |
| `TranscribeAudio` | Audio → text (Whisper) |
| `ExtractDataFromUploadedFile` | Extract structured data from CSV/XLSX/JSON/HTML/PNG/JPG/PDF |

### Usage
```js
const { file_url } = await base44.integrations.Core.UploadFile({ file });
const res = await base44.integrations.Core.InvokeLLM({
  prompt: "...",
  response_json_schema: { type: "object", properties: { ... } },
  add_context_from_internet: true,  // only with gemini models
});
```

---

## 12. Token System

The unified token resolver (`resolveTokenValue`) supports `{{token}}` and `{{token|transform}}` syntax in both LeadByte and CAPI payload templates.

### Built-in Tokens
| Token | Aliases | Description |
|-------|---------|-------------|
| `_c_eventtime` | `event_time` | Unix timestamp (seconds) |
| `_c_eventurl` | `optin_url` | Opt-in page URL |
| `_device_userAgent` | `user_agent` | Browser UA |
| `_tracking__fbc` | `fbc` | Facebook click ID |
| `_tracking__fbp` | `fbp` | Facebook browser ID |
| `_geoip_city` | `geoip_city`, `city` | City |
| `_geoip_regionName` | `geoip_state`, `state` | State |
| `_geoip_countryName` | `geoip_country`, `country` | Country |
| `mobile_raw` | `mobile` | Phone number |
| `conv_value` | | Conversion value |
| `event_id` | | Event ID (falls back to lead_id) |
| `ip_address` | | Client IP |
| `lead_id` | | Sequential lead ID |
| `email` | | Email |
| `first_name` | `firstname` | First name |
| `last_name` | `lastname` | Last name |
| `zip` | `zipcode` | ZIP code |
| `lead_event` | | Event name |
| *(any field)* | | Falls back to `data[token]` |

### Transforms
| Transform | Description |
|-----------|-------------|
| `sha256` | SHA-256 hash |
| `lowercase` | Lowercase |
| `uppercase` | Uppercase |
| `trim` | Trim whitespace |
| `phone_us` | Normalize to 1XXXXXXXXXX |

---

## 13. Notification System

### Notification Rules
Rules are evaluated after pipeline events:

| Condition Type | Trigger |
|----------------|---------|
| `errors_same_stage` | Multiple errors at the same stage in a window |
| `hlr_unreachable` | HLR endpoint unreachable |
| `leadbyte_non_success` | LeadByte returned non-success |
| `sold_rate_below` | Sold rate below threshold |
| `api_error` | API connector failure |
| `capi_failure` | CAPI event failure |
| `lead_queued` | Lead was queued |
| `missing_fields` | Required fields missing |

### Channels
- Email (via `SendEmail` integration)
- Slack (configurable)

---

## 14. Key Configuration Areas

### Settings Page (tabbed)
- **General** — Brand name, tagline, base URL, fail mode, adaptive fields, TrustedForm requirement, FB API version
- **Suppliers** — Supplier CRUD + API key generation
- **Brands** — Brand CRUD
- **API Keys** — Key management (master/supplier, expose_revenue, allowed_ips)
- **LeadByte** — Default connector config + response mapping rules
- **API Connectors** — CAPI + webhook connectors
- **Custom Fields** — Field mapping and LeadByte inclusion
- **Ignore List** — Adaptive fields ignore list
- **Users** — User invite/management
- **Webhooks** — Outbound webhook management
- **Errors** — Error log viewer

### Verification Page
- HLR settings (provider, endpoint, timeout, fail mode, field mapping, passthrough fields, min score, phone_verified source)

### Custom Calculations Page
- Calculation CRUD (date_age_bucket, value_map, script)

---

## 15. File Reference: index.css

See `src/doc/index.css` for the full stylesheet with all design tokens, Tailwind base layers, status colors, and scrollbar styling.

## 16. File Reference: index.html

See `src/doc/index.html` for the full HTML entry point.