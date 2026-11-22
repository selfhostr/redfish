# Production deployment

The `runtime` image listens on plain HTTP on port 3000, so HTTPS must be
provided by a reverse proxy in front of it (Cloudflare Tunnel, Caddy, Traefik,
nginx...). This is mandatory: the session cookie is `Secure` outside development
and is not sent over HTTP.

## Variables to set

- `ORIGIN`: the exact public URL of the dashboard, for example
  `https://redfish.example.org` (an adapter-node option; without it, POST forms
  are rejected).
- `DASHBOARD_HOST` / `TRACKING_HOST`: two distinct host names, for example
  `redfish.example.org` and `go.example.org`. The proxy routes both to the same
  app and must forward the original `Host` header. See
  [csp-hosts.md](csp-hosts.md).
- `ADDRESS_HEADER` (and `XFF_DEPTH`; both are adapter-node options): see below.

## Client IP: required

Rate limiting on login and tracking relies on the client IP
(`getClientAddress()`). Behind a proxy, adapter-node returns the proxy IP unless
`ADDRESS_HEADER` is set: all clients then share one counter, and a single client
can lock everyone out of the login. In production, the app logs a warning at
startup if the variable is missing.

The limiter is in memory: counters are per process and reset on restart, so
running several instances multiplies the budget. Every `/t/*` route shares one
per-IP budget (60 requests/minute). The open pixel still returns its image when
limited, but records nothing. Tracking also stores at most one event per
recipient, event type and automated/human class, so a leaked token cannot grow
the database.

Only use a header that the proxy overwrites or sets itself, and never expose the
app directly: otherwise a client could forge its IP.

### Cloudflare Tunnel (main example)

`cloudflared` adds `CF-Connecting-IP`, which the client cannot forge.

```sh
# .env
ORIGIN=https://redfish.example.org
ADDRESS_HEADER=CF-Connecting-IP
```

```yaml
# cloudflared config.yml (cloudflared runs on the same Docker network as `web`)
ingress:
  - hostname: redfish.example.org
    service: http://web:3000
  - hostname: go.example.org
    service: http://web:3000
  - service: http_status:404
```

### Other proxies

Caddy and Traefik set `X-Forwarded-For`. With a single proxy in front of the app:

```sh
ADDRESS_HEADER=X-Forwarded-For
XFF_DEPTH=1   # number of trusted proxies; 2 if a CDN sits in front of the proxy
```

```
# Caddyfile
redfish.example.org, go.example.org {
	reverse_proxy web:3000
}
```

Traefik: `X-Forwarded-For` is added by default; do not enable
`forwardedHeaders.insecure` on the public entrypoint. Nginx: `proxy_set_header Host
$host;` and `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`.

Do not log request bodies or `Cookie`/`Authorization` headers.

## Sending mail

To send without a third-party relay, see [self-hosted-sending.md](self-hosted-sending.md): an optional send-only mail container, started with `docker compose --profile mail up -d`.
