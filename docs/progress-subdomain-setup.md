# progress.dashboard.legenex.com setup

Status: **Configuration required**. The application side is done; the DNS and Base44 domain registration are not.

## What is already done

`src/App.jsx` contains `isProgressHost()`, which matches any hostname beginning `progress.`. When it matches, the app renders only the authenticated Progress Control Center: login, forgot password, reset password, and the progress routes behind `ProtectedRoute` and `PermissionRoute`. Every other path redirects to `/progress`. The operator dashboard is not reachable on that host.

This needs no further code. It activates the moment the hostname resolves to the app.

## What Morne or Nick must do

This is a **nested** subdomain (`progress.dashboard.legenex.com`, three labels). Nested subdomain support is not something this workspace can verify, so confirm it in the Base44 dashboard before buying into this route.

1. **Confirm nested custom domain support.** Base44 dashboard, app `6a4957e7b03e9b10c170d29e`, Settings, Domains. If a three label subdomain is rejected, fall back to `progress-legenex.com` or keep using `/progress`, both of which work identically.
2. **Add the domain in Base44** and copy the target hostname it gives you.
3. **Create the DNS record** at the registrar holding `legenex.com`:

   | Type | Name | Value | TTL |
   |---|---|---|---|
   | CNAME | `progress.dashboard` | the target Base44 gives you | 300 |

   Do not point this at an IP address. Do not create an A record.
4. **Wait for propagation**, then confirm TLS is issued in the Base44 dashboard.
5. **Verify**: open `https://progress.dashboard.legenex.com` while signed out. You should land on login, not on the operator dashboard. Signed in as an account without any progress permission you should see the no access notice, not the operator sidebar.

## Fallback, available now

`/progress` on the main dashboard serves the identical experience to any user holding `progress_access`. There is no functional difference. The subdomain is a convenience, not a requirement, and no part of the system is blocked on it.
