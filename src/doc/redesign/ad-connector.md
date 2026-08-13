# Ad Connector (Meta) - performance tracking

Goal: connect Meta via OAuth, list ad accounts, enable per-account spend and
performance sync, capture conversions and ROAS. Meta only for now, extensible
later via AdSpendMapping.platform.

## Decisions
- OAuth click-to-connect handles login and account discovery (long-lived user
  token, ~60 days).
- Durable background sync uses a Business Manager system-user token (non-expiring).
- No new AdAccount entity. AdSpendMapping is the persisted per-account sync list
  (already has enabled, ad_account_id, ad_account_name, and supplier/brand/vertical
  attribution).

## Token storage
IntegrationConfig(name="meta").config is a JSON string:
{ access_token, token_expires_at, connected_account, connected_at, system_user_token }
- access_token: OAuth long-lived user token. Used by metaAssets (discovery) and as
  fallback for sync.
- system_user_token: durable token for syncMetaSpend. Preferred by sync when present.

## Functions
- metaOauthStart (new): admin only. Builds the Facebook Login dialog URL and
  redirects. Reads META_APP_ID. redirect_uri fixed to
  https://api.legenex.com/functions/metaOauthCallback. scope=ads_read,business_management.
  Sends a random state for CSRF.
- metaOauthCallback (new): admin only. Exchanges code for short-lived then
  long-lived token (fb_exchange_token). Reads connected account from /me. Merges
  into IntegrationConfig(name="meta").config, preserving system_user_token. Then
  redirects back to the Settings Integrations page.
- metaAssets (existing, do not change logic): already returns ad_accounts. UI calls
  it after connect.
- syncMetaSpend (extend): prefer system_user_token then access_token. Add
  actions,action_values to the insights fields, parse conversions and
  conversion_value, write to AdSpend. Keep upsert-by-delete and the mapping loop.

## Schema
- AdSpend: add conversions (number, default 0) and conversion_value (number,
  default 0). ROAS, CTR, CPC are computed at read time
  (roas = conversion_value / spend, ctr = clicks / impressions, cpc = spend / clicks).

## Secrets (Base44 function secrets)
- META_APP_ID
- META_APP_SECRET

## Meta app config (manual, in Meta App dashboard / Business Manager)
- Enable Facebook Login product.
- Whitelist redirect URI: https://api.legenex.com/functions/metaOauthCallback
- ads_read (plus business_management) access. Connecting user must have a role on
  the app for Standard access without full App Review.
- Create a Business Manager system user, assign the ad accounts, generate a
  non-expiring token with ads_read, paste into the Ad Platforms card
  (stored as system_user_token).

## UI
- Settings > Integrations: "Ad Platforms" card. Connect Meta button hits
  metaOauthStart. After connect, call metaAssets and render the ad_accounts list
  (name, account_id, currency) with a Sync spend toggle per row. Toggle on creates
  or enables an AdSpendMapping (platform=meta, match_level=ad_account, ad_account_id,
  ad_account_name, enabled=true) with inline supplier/brand/vertical selects. Include
  a field to paste the system-user token.
- Finances > Ad Spend: add performance columns conversions, ROAS, CTR, CPC alongside
  spend and true CPL.

## Do not touch
- processLead and the live lead path: LeadByte forwarding, Conversion Events,
  Deliveries, revenue capture.
- portalData, supplierPortalData, portalAction, portal UI, permission matrix.
- metaAssets fetch logic (UI consumes it as-is).
- No em dashes in any code string or UI text.

## Build order (one concern per build)
1. metaOauthStart + metaOauthCallback (backend).
2. Ad Platforms card + account list + sync toggle + system-user token field (UI).
3. Extend syncMetaSpend + add AdSpend conversion fields (backend + schema).
4. Ad Spend performance columns (UI).
