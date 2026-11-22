# Design system (application UI)

One dark theme. Definitions live in `src/app.css`, components in `src/lib/components/ui/` (import from `$lib/components/ui`).

## Tokens and utilities

`--c-*` variables: `canvas`, `surface-1`, `surface-2`, `line`, `line-strong`, `ink`, `ink-dim`, `signal`, `advisory`, `warning`, `info`, their `*-bg` tints (signal, advisory, warning, info), `on-ink`, `ink-hover`. Radii `--r-flat|btn|card|box`. Fonts `--font-ui`, `--font-mono`. Base size 13px, tabular numbers across the body.

Tailwind utilities: `bg-`, `text-`, `border-` + `canvas`, `surface-1`, `surface-2`, `line`, `line-strong`, `ink`, `ink-dim`, `signal`, `advisory`, `warning`, `info` (and `*-bg`, `on-ink`); `font-ui`, `font-mono`. No hard-coded hex outside the token definitions.

## Primitives

- `Button`: `variant` primary|secondary|ghost|danger, `size` sm|md, `href`, `type`, `disabled`.
- `Panel`, `Field`, `Tabs`, `Skeleton` (`width`, `height`, `radius`).
- `Plate`: `variant` signal|advisory|warning|info|neutral; dot + word + colour.
- `StatusPill`: a campaign `status` (draft, scheduled, sending, paused, completed; neutral fallback).
- `EmptyState`, `ErrorNotice`: empty and error states.
- `Toast` (mounted once in the layout) and `toast(message, kind?, durationMs?)`; kind signal|advisory|warning|info. Call it on the client only (handlers, onMount, $effect), never during SSR or in a load function: the state is shared between requests.
- `LocalTime`: `value` (Date|string|number, UTC), `mode` datetime|date. UTC on server render, local fr-CH time with a short zone (for example "20.11.26 17:07 UTC+1") after mount (title = UTC), "n/a" when empty.
- `CopyButton`: `value`, `what`, `label`, `size`; copies and shows a toast.
- `withParams(url, patch)` (`$lib/url-params`): returns pathname + search; an empty, null or undefined value removes the parameter. Example: `<a href={withParams(page.url, { status: 'draft', page: null })}>`.

## Rules

- Colour carries meaning, never decoration. One status = dot + word + colour.
- One primary button per view, neutral (light on dark).
- One introductory sentence before each block of data.
- Headings (Panel section titles, KPI and field labels, `<th>`): `rf-eyebrow` or `rf-label`, never an ad hoc `uppercase`/`tracking-wide` combination. Funnel labels: `$lib/funnel-labels`.
- Empty value: "n/a".
- Every time goes through `LocalTime`. Every identifier or URL to copy goes through `CopyButton`.
- Filters are reflected in the URL through `withParams` (GET forms or links).
- Empty list: `EmptyState`. Error: `ErrorNotice`.

## Forbidden

Gradients, emoji, em dashes in displayed text, hard-coded hex, a `name` attribute on landing pages.

## Out of theme

Public `/t/*` pages, MJML emails, the printable report: their own styles, not covered by this system.
