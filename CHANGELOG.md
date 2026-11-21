# Changelog

Format based on Keep a Changelog. Versions follow `0.MINOR.PATCH` until 1.0.

## [Unreleased]

### Added

- Report tracking: `{{reportUrl}}` placeholder with a `/t/r` thank-you page, and manual entry of reports from pasted e-mail addresses.
- Person data rights: edit, delete, anonymise and export one person's data, and retention of targets never used in a campaign.

### Fixed

- Permanently failed sends are marked failed with a redacted reason, excluded from rates and can be retried while the campaign is sending.
- Tracking routes share one per-IP rate limit and keep at most one event per recipient, type and automation class.

## [0.1.0] - 2026-11-21

First complete version.

### Added

- Multi-organisation platform on SvelteKit 3 and SQLite: organisations, sending profiles with SMTP secrets encrypted at rest, CSV target import, campaigns with scheduled launch.
- Job worker with a database-backed queue, SMTP sending of MJML e-mails, graceful shutdown on SIGTERM.
- Tracking of opens, clicks and reports through unique links, with detection of mail scanners and bots. No credential is captured.
- Bring-your-own scenarios: the platform ships no scenario; a superadmin creates one in-app (editor pre-filled with neutral, valid skeletons) or imports a JSON bundle, each stored in the database and rendered like a built-in one.
- Lists and sending profiles in the main navigation; list creation chains into CSV import, and campaign creation warns when the chosen list is empty.
- Per-campaign funnel report with print and PDF output.
- Hardening: rate limiting, strict CSP, host isolation between dashboard and tracking, strong secret key validation.
- Daily anonymisation of expired targets and optional Litestream backup.
- Docker: dev and production images, `HEALTHCHECK` on `/health`, `restart: unless-stopped`.
- Repository files: README, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT, CODEOWNERS, Dependabot, CI (Prettier, svelte-check, Vitest, build, licences, CodeQL).
- Export and import of scenarios as self-contained JSON bundles, with zero-capture validation on import; imported scenarios live in the database and render like built-in ones.
- Account security: account page to change the password (other sessions are closed) and revoke active sessions; optional TOTP two-factor authentication with a server-rendered QR code, an encrypted secret and eight single-use recovery codes; rate-limited second login step.
- Audit log of sensitive actions (logins, account security, clients, scenarios, sending profiles, campaigns, targets), with a filterable, paginated read-only page for superadmins and its own retention period.
- Permanent deletion of a campaign (with its recipients, events, authorizations and queued jobs) and of a client and everything it owns, each guarded by typing the entity name and run in a single transaction.

- Editable client contact details (contact name, e-mail and phone).
- Live preview of scenarios in the editor, with inline errors and a placeholder toolbar.
- SMTP connection test and test e-mail for sending profiles.
- Worker heartbeat and a queue health warning when the worker is not running.
- Automatic database snapshot before pending migrations are applied.
- Pre-launch checks for campaigns, enforced again at launch.
- Per-target CSV export of results and a client progression (trends) chart.
- Signed multi-arch (amd64, arm64) image published to GHCR on each release, with SBOM and provenance, and a production Docker Compose file; verification steps in `docs/verify-image.md`.
- ESLint and Playwright end-to-end tests in CI.
- Documentation in English, with configuration, first-scenario and reverse proxy (client IP) guides.

### Changed

- The whole repository is formatted with Prettier (tabs, single quotes).
- Upgraded to SvelteKit 3 (`@sveltejs/kit` 3.4.0, `@sveltejs/adapter-node` 6.0.5): configuration moved from `svelte.config.js` into the `sveltekit()` Vite plugin and the `$lib` alias is declared explicitly.

### Fixed

- Migrations that recreate a table now run with foreign keys disabled, so upgrading a populated database no longer fails on a foreign-key constraint (e.g. 0003 dropping `scenarios`).

### Security

- The full user record is no longer exposed to the client; only the fields the interface needs are sent.
- Upgraded dependencies to patch advisories: `@sveltejs/kit` to 3.4.0 (open redirect, cache-control XSS, form-data DoS, and the bundled `cookie` out-of-bounds characters) and `csv-parse` to 7.0.3 (prototype pollution via the `columns` path).
