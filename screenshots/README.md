# Screenshots

This folder holds screenshots used in the project documentation.

Add captures here with fictitious data only: no real names, email addresses,
hostnames or IP addresses. Use `example.com` and the documentation IP ranges.
Blur or replace anything that could identify a real person or organization.

Suggested shots: the operator dashboard, the campaign report, and the awareness
page a target sees after a click.

## Regenerating

`npm run screenshots` builds the app, starts it on a throwaway database seeded
with fictional data (`scripts/seed-screenshots.ts`) and writes WebP captures to
`screenshots/out/` (not committed): dashboard, funnel and progression, scenario
editor with live preview, client page, account security (TOTP) and the awareness
page a target sees. Without a local Chromium, run `sh scripts/screenshots-docker.sh`,
which uses the official Playwright image. `SHOTS_SCHEMES=light,dark` captures both
colour schemes; the interface currently has a single dark theme.
