// Google Picker: Google's own file browser, opened against the operator's live
// Google session in this browser.
//
// Why this exists rather than a Drive listing call: listing files server side
// needs a restricted Drive scope, and the shared Base44 OAuth client is not
// verified for it, so Google blocks the consent screen outright. The Picker
// needs only `drive.file`, which is not restricted and needs no verification.
//
// We use it purely to obtain a spreadsheet ID. Reading the sheet still happens
// server side through the existing Google Sheets connector, so the Picker adds
// no new read path and no new stored credential.
//
// `google` and `gapi` are read off `window` deliberately: the ESLint config
// replaces the recommended rule set wholesale, so a bare global identifier can
// slip through lint and then blank the page at runtime.

const GAPI_SRC = 'https://apis.google.com/js/api.js';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') { resolve(); return; }
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error(`Could not load ${src}`)));
      return;
    }
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.defer = true;
    el.addEventListener('load', () => { el.dataset.loaded = 'true'; resolve(); });
    el.addEventListener('error', () => reject(new Error(`Could not load ${src}`)));
    document.head.appendChild(el);
  });
}

function loadPickerModule() {
  return new Promise((resolve, reject) => {
    const gapi = window.gapi;
    if (!gapi) { reject(new Error('Google API script did not load')); return; }
    if (window.google?.picker) { resolve(); return; }
    gapi.load('picker', { callback: () => resolve(), onerror: () => reject(new Error('Could not load the Google Picker')) });
  });
}

// Ask Google for a short-lived token scoped to drive.file. This opens Google's
// own account chooser, so the operator picks which of their accounts to browse.
function requestToken(clientId) {
  return new Promise((resolve, reject) => {
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) { reject(new Error('Google Identity script did not load')); return; }
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (resp) => {
        if (resp?.error) { reject(new Error(resp.error_description || resp.error)); return; }
        if (!resp?.access_token) { reject(new Error('Google returned no access token')); return; }
        resolve(resp.access_token);
      },
      error_callback: (err) => reject(new Error(err?.message || 'Google sign in was dismissed')),
    });
    client.requestAccessToken({ prompt: '' });
  });
}

/**
 * Open the Google Picker filtered to spreadsheets.
 * Resolves with { id, name, url } for the chosen file, or null if cancelled.
 */
export async function pickSpreadsheet({ clientId, apiKey, appId }) {
  if (!clientId || !apiKey) throw new Error('Google Picker is not configured');

  await Promise.all([loadScript(GAPI_SRC), loadScript(GIS_SRC)]);
  await loadPickerModule();
  const token = await requestToken(clientId);

  const picker = window.google.picker;

  return new Promise((resolve, reject) => {
    try {
      const view = new picker.DocsView(picker.ViewId.SPREADSHEETS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false)
        .setMode(picker.DocsViewMode.LIST);

      const sharedView = new picker.DocsView(picker.ViewId.SPREADSHEETS)
        .setIncludeFolders(true)
        .setOwnedByMe(false)
        .setLabel('Shared with me');

      let builder = new picker.PickerBuilder()
        .addView(view)
        .addView(sharedView)
        .setOAuthToken(token)
        .setDeveloperKey(apiKey)
        .setTitle('Select a spreadsheet')
        .setCallback((data) => {
          if (data.action === picker.Action.PICKED) {
            const doc = (data.docs || [])[0];
            resolve(doc ? { id: doc.id, name: doc.name, url: doc.url } : null);
          } else if (data.action === picker.Action.CANCEL) {
            resolve(null);
          }
        });

      // appId is the Cloud project number. Passing it lets drive.file grant
      // access to the picked file, which keeps the scope non-restricted.
      if (appId) builder = builder.setAppId(String(appId));

      builder.build().setVisible(true);
    } catch (err) {
      reject(err);
    }
  });
}

export const PICKER_SCOPE = SCOPE;
