# Screenshot automation

Status: **Not implemented**, by decision. Deferred on 30 July 2026.

Nothing in the system claims screenshots work. There is no `PageSnapshot` entity, no upload path and no capture status panel, because a data model with no data behind it invites the false impression that capture is running and merely empty.

## What was asked for

Daily desktop, tablet and mobile captures, previous versus latest comparison, and the ability to draw a region on a screenshot and anchor a comment to it.

## What exists instead

The commenting system in Application Review already captures subject type, subject reference, the visible label, the value on screen, route, section, role, viewport and timestamp. A comment on a metric therefore carries enough context to become a good implementation prompt without a screenshot. What is missing is the visual anchor, not the context.

## What building it would need

1. **A runner.** Playwright from a browser capable environment. GitHub Actions is the obvious host, though note that nothing deploys from the repo, so the runner would target the live app rather than a build artefact.
2. **A review account.** A dedicated login with read-only operator permissions. Never a real operator account.
3. **Storage.** Secure object storage. Do not commit screenshot collections to the repo.
4. **Masking, and this is the hard part.** Names, email addresses, phone numbers, addresses, TrustedForm URLs, Jornaya tokens, API keys, buyer and supplier credentials, authentication tokens and payload secrets must never appear in a retained image. Either a sanitised fixture environment or reliable DOM-level masking before capture. Capturing production pages with real lead data and masking afterwards is not acceptable.
5. **Viewports.** Desktop 1440 by 1000, tablet 768 by 1024, mobile 390 by 844.
6. **A `PageSnapshot` entity** linking each capture to its commit, viewport, role and capture status, with failures shown clearly.

## Recommendation

Do not build this before cutover. The masking requirement is the largest single piece of work in the original brief and it protects against a risk (leaking lead personal data into a screenshot store) that does not exist today because the store does not exist. Visual review by opening the live page is adequate for now.
