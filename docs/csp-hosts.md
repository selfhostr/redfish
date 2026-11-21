# CSP and host isolation

- `DASHBOARD_HOST` / `TRACKING_HOST`: when both are set, `/t/*` is served only on the tracking host and the operator app only on the dashboard host. Any cross-host request, or a request for an unknown host, gets a 404. `/_app/`, `/health` and `/favicon.ico` are served on both. If either variable is empty (development), everything is allowed.
- CSP: `default-src 'self'`, no external origin, `script-src 'self'` plus a per-response nonce (set on inline `<script>` tags, including the landing page beacon). Never `'unsafe-inline'` for scripts. Inline styles stay allowed (templates).
- Reverse proxy: do not log request bodies (zero capture), nor the `Cookie` and `Authorization` headers. It must forward the original `Host` header (or set adapter-node's `HOST_HEADER`).
