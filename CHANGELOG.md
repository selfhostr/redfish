# Changelog

Format based on Keep a Changelog. Versions follow `0.MINOR.PATCH` until 1.0.

## [Unreleased]

First complete version (target `0.1.0`).

### Added

- Multi-organisation platform on SvelteKit 3 and SQLite: organisations, sending profiles with SMTP secrets encrypted at rest, CSV target import, campaigns with scheduled launch.
- Job worker with a database-backed queue, SMTP sending of MJML e-mails, graceful shutdown on SIGTERM.
- Tracking of opens, clicks and reports through unique links, with detection of mail scanners and bots. No credential is captured.
- Five scenarios: `microsoft365` and four Swiss-themed scenarios, plus the awareness landing page.
- Per-campaign funnel report with print and PDF output.
- Hardening: rate limiting, strict CSP, host isolation between dashboard and tracking, strong secret key validation.
- Daily anonymisation of expired targets and optional Litestream backup.
- Docker: dev and production images, `HEALTHCHECK` on `/health`, `restart: unless-stopped`.
- Repository files: README, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT, CODEOWNERS, Dependabot, CI (Prettier, svelte-check, Vitest, build, licences, CodeQL).
- Export and import of scenarios as self-contained JSON bundles, with zero-capture validation on import; imported scenarios live in the database and render like built-in ones.
- Permanent deletion of a campaign (with its recipients, events, authorizations and queued jobs) and of a client and everything it owns, each guarded by typing the entity name and run in a single transaction.

### Changed

- The whole repository is formatted with Prettier (tabs, single quotes).
- Upgraded to SvelteKit 3 (`@sveltejs/kit` 3.4.0, `@sveltejs/adapter-node` 6.0.5): configuration moved from `svelte.config.js` into the `sveltekit()` Vite plugin and the `$lib` alias is declared explicitly.

### Security

- Upgraded dependencies to patch advisories: `@sveltejs/kit` to 3.4.0 (open redirect, cache-control XSS, form-data DoS, and the bundled `cookie` out-of-bounds characters) and `csv-parse` to 7.0.3 (prototype pollution via the `columns` path).
