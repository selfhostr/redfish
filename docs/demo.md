# Static demo

`npm run build:demo` builds a clickable demo of the interface that runs without a server, served under `/demo/` (for example `https://redfish.selfhostr.io/demo/`). Output: `build-demo/`, or the directory given with `npm run build:demo -- --out <dir>`.

## How it works

1. A throwaway SQLite database receives the fictional data of `scripts/seed-screenshots.ts` (organisations named « Démo », `.example` addresses).
2. The app runs on it locally, and `scripts/build-demo.ts` records what each page reachable from the menu sends to the browser (`__data.json`), for every client, plus the CSV exports, the printable reports, the editor preview of the neutral skeletons and the 2FA enrolment.
3. `vite build --mode demo` builds the same pages as a static, client-only app (`@sveltejs/adapter-static`, base path `/demo`). In this mode only, `src/hooks.client.ts` loads `src/lib/demo/install.ts`, which answers SvelteKit's data requests from the recordings and adds the base path to the root-relative links.

There is no separate demo UI: a new page appears in the demo once it is reachable by a link.

## What the visitor can do

- Browse every page, open campaigns, reports, lists, scenarios, the audit log and the account page, and switch between clients.
- Type in the scenario editor: the subject and sender update the preview; the templates show the recorded preview with a note.
- Start the 2FA enrolment (QR code shown). Every other form shows « Désactivé dans la démo » and sends nothing. Searches and filters show the unfiltered data.

A banner marks every page as a demo with fictional data. The page makes no request outside its own static files and never sends e-mail. State is kept in memory and reset on reload.

## Content Security Policy

The bootstrap script is moved to a file at build time, so the demo runs under `script-src 'self'` with no inline script. Inline styles are needed (`style-src 'self' 'unsafe-inline'`), as in the app.
