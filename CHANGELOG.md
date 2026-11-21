# Changelog

Format based on Keep a Changelog. Versions follow `0.MINOR.PATCH` until 1.0.

## [Unreleased]

First complete version (target `0.1.0`).

### Added

- Multi-organisation platform on SvelteKit 2 and SQLite: organisations, sending profiles with SMTP secrets encrypted at rest, CSV target import, campaigns with scheduled launch.
- Job worker with a database-backed queue, SMTP sending of MJML e-mails, graceful shutdown on SIGTERM.
- Tracking of opens, clicks and reports through unique links, with detection of mail scanners and bots. No credential is captured.
- Five scenarios: `microsoft365` and four Swiss-themed scenarios, plus the awareness landing page.
- Per-campaign funnel report with print and PDF output.
- Hardening: rate limiting, strict CSP, host isolation between dashboard and tracking, strong secret key validation.
- Daily anonymisation of expired targets and optional Litestream backup.
- Docker: dev and production images, `HEALTHCHECK` on `/health`, `restart: unless-stopped`.
- Repository files: README, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT, CODEOWNERS, Dependabot, CI (Prettier, svelte-check, Vitest, build, licences, CodeQL).
- Export and import of scenarios as self-contained JSON bundles, with zero-capture validation on import; imported scenarios live in the database and render like built-in ones.

### Changed

- The whole repository is formatted with Prettier (tabs, single quotes).
