# Changelog

Format based on Keep a Changelog. Versions follow `0.MINOR.PATCH` until 1.0.

## [Unreleased]

### Added

- Users can change their login e-mail address from `/account` (current password required, no confirmation e-mail). Other sessions are closed; the audit log records `account.email_change` without the addresses. This lets the default `admin@redfish.local` account receive sending-profile test e-mails.
- Scenario deletion (superadmin): a scenario used by no campaign is deleted; one used by campaigns is archived instead, hidden from the scenario list and the campaign picker but kept in existing campaigns and reports. Archived scenarios can be shown and restored from the scenario list.
- Recipient lists can be deleted from « Destinataires » and from the list page, after an inline confirmation. A list used by no campaign is deleted with its recipients; one used by campaigns is archived instead (hidden from the page and the campaign picker, kept in existing campaigns and reports; new campaigns cannot use it). Archived lists can be shown and restored. Lists can also be renamed. The creation form is clearer (« Nom de la liste », recipients are added afterwards) and gently warns when the name looks like an e-mail address. Audit: `list.delete`, `list.archive`, `list.restore`, `list.rename`.

### Changed

- Authorization errors on campaign creation and on « Ajouter l'autorisation » are now reported per field (« Date de fin invalide. », « Nom de l'approbateur requis. », end before start, …) instead of one generic message. The date fields are limited to years 2000-9999.

- Switching client from the top bar always lands on the new client's dashboard. The dashboard is titled with the client's name and shows its contact, timezone and language with a « Paramètres » button. « Premiers pas » starts with « Compléter les paramètres du client » (done once a contact is set), before the recipient list, the sending profile and the first campaign. Creating a client lands on its settings page, with a « Continuer vers le tableau de bord » button.
- The clients page (`/tenants`) is now a pure overview: a table comparing clients (language, campaigns, recipients, click rate, last campaign) with a link to each client's settings. It no longer offers switching client, which is done from the top-bar switcher only; « Clients » leaves the Administration menu and « Gérer les clients » in the switcher leads there.
- Navigation: the client switcher comes first in the bar (active client, other clients, « Paramètres de ce client », « Gérer les clients »), followed only by the active client's screens (Tableau de bord, Campagnes, Destinataires, Profils d'envoi). Global screens move to an « Administration » menu (Clients, Scénarios, and for superadmins Utilisateurs and Journal d'audit), next to the account menu. The mobile menu has the same structure.
- The client page tabs are gone. `/tenants/[id]` is now « Paramètres du client » (identity, contact, timezone, deletion) and no longer requires switching to that client; switching is done with the switcher or « Travailler sur ce client ». The dashboard shows the « Premiers pas » checklist until the client has a list, a sending profile and a campaign, and invites to create a first client when there is none.
- « Listes » is renamed « Destinataires » in the interface; « Données personnelles (RGPD) » is reached from that page.

## [0.2.0] - 2026-11-22

### Added

- Report tracking: `{{reportUrl}}` placeholder with a `/t/r` thank-you page, and manual entry of reports from pasted e-mail addresses.
- Person data rights: edit, delete, anonymise and export one person's data, and retention of targets never used in a campaign.
- Per-client timezone for scheduling, date display and CSV exports.
- Static demo (`npm run build:demo`): the real interface with recorded fictional data, served under `/demo/` without a server.
- Staggered sending: a campaign can spread its e-mails over 1 hour to 30 days in random recipient order, optionally only during working hours (weekdays, client timezone). The campaign page shows sent / planned, the next send and the end of the window; the observation period starts after the last planned send, and closing a campaign cancels the remaining sends.

### Fixed

- A mistyped five-figure year in an authorization date no longer produces a misleading « Autorisation requise » error: the invalid date is named precisely.

- Campaigns are completed automatically after the observation window (or manually); tracking, manual reports and send retries stop once completed.
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
