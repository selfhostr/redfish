# Self-hosted sending (optional mail module)

redfish can send through any SMTP server (sending profiles). If your mail provider
filters outbound phishing look-alikes, or you want to control the whole path, you can
run the optional **mail module**: a hardened, send-only OpenSMTPD container shipped
with redfish.

What it is:

- authenticated submission only (port 587, STARTTLS required), reachable **only on the
  internal Docker network** (no `ports:` mapping);
- no inbound listener and no mailboxes: unauthenticated mail is rejected, it cannot
  be used as an open relay;
- DKIM signing for one domain; the key is generated on first start.

It does **not** solve deliverability by itself: see [Client allowlisting](#client-allowlisting).

## Requirements

- A host that allows **outbound TCP port 25** (see [Outbound port 25](#outbound-port-25)).
- A domain you control, and a host name for the server (default `mail.<domain>`) whose
  A record points to the host's public IPv4 address and whose reverse DNS (PTR) matches.
- The stack running with Docker Compose.

## Enable it

Add to `.env`:

```sh
MAIL_DOMAIN=verify-mail.example
# MAIL_HOSTNAME=mail.verify-mail.example   # HELO name, must match the PTR (default)
# MAIL_DKIM_SELECTOR=redfish               # default
# MAIL_SMTP_USER=redfish                   # default
MAIL_SMTP_PASSWORD=<at least 20 characters, e.g. openssl rand -base64 24>
```

Then start it:

```sh
docker compose --profile mail up -d
```

The container refuses to start if `MAIL_DOMAIN` is missing or `MAIL_SMTP_PASSWORD` is
shorter than 20 characters. On first start it creates, in `data/mail/`:

- a DKIM key (RSA 2048), a private CA and a server certificate for the name `mail`
  (kept in `data/mail/private/`, mode 0600);
- two public files in `data/mail/public/`: `ca.crt` (the module CA) and `dkim.txt`
  (line 1 = selector, line 2 = the DKIM TXT value).

Queued mail is kept in `data/mail/spool/`, so it survives restarts.

Create a sending profile with host `mail`, port `587`, the `MAIL_SMTP_USER` /
`MAIL_SMTP_PASSWORD` credentials, and a sender address **at `MAIL_DOMAIN`** (the
domain that is DKIM-signed; another domain makes DMARC fail).

### TLS trust

redfish keeps verifying TLS certificates. When `data/mail/public/ca.crt` exists, it is
**added** to Node's default root certificates for every transport; nothing is
disabled and there is no "accept self-signed" option. The file is read each time a
transport is built, so a regenerated CA is picked up without restarting redfish.

## DNS records

For `MAIL_DOMAIN` (replace the values):

| Name                             | Type | Value                                                                                 |
| -------------------------------- | ---- | ------------------------------------------------------------------------------------- |
| `mail.<domain>`                  | A    | the host's public IPv4 address                                                        |
| `<domain>`                       | TXT  | `v=spf1 ip4:<ip> -all`                                                                |
| `<selector>._domainkey.<domain>` | TXT  | the second line of `data/mail/public/dkim.txt`                                        |
| `_dmarc.<domain>`                | TXT  | `v=DMARC1; p=none; rua=mailto:<you>` (move to `quarantine` once everything validates) |

Publish **exactly one** SPF record and **one** DMARC record: two of either make the
check fail silently. If you already have an SPF record, merge the mechanisms into it.

The PTR (reverse DNS) of the host's IP must be `MAIL_HOSTNAME`, and that name must
resolve back to the same IP. PTR is set at your hosting provider, not in your DNS zone.

## Outbound port 25

The module delivers directly to the recipients' mail servers on port 25.

- **VPS / cloud**: many providers block outbound 25 by default (some unblock it on
  request or after a billing history). Check, or ask your provider.
- **Residential or small-business lines**: the address usually has a provider-owned PTR
  and sits on policy blocklists (Spamhaus PBL). Direct delivery from these is rejected
  by most large providers.
- If port 25 is blocked, mail stays in the queue and is retried; use an external SMTP
  sending profile instead.

Quick test from the host: `nc -vz -w 5 gmail-smtp-in.l.google.com 25`.

## Client allowlisting

Authentication records do not make a phishing simulation welcome. The client must
allowlist your sender before a campaign:

- **Microsoft 365**: Defender portal, _Advanced delivery_ (third-party phishing
  simulations): add the sending domain and the sending IP.
- **Google Workspace**: Admin console, Gmail, spam/phishing/malware settings: add an
  allowlist entry for the sending IP (and an inbound-gateway or approved-sender rule
  as your policy requires).

## Rotation

To rotate the DKIM key or the CA, delete the generated files under `data/mail/private/`
(`dkim.key`, or `ca.*` and `server.*`) and run `docker compose --profile mail restart mail`.
After a DKIM rotation, publish the new TXT value from `public/dkim.txt`. redfish rereads
`ca.crt` on every transport, so profiles keep working without a restart.

## Operation notes

- A full backup of `./data` also copies `./data/mail/private` (the DKIM and CA private keys); Litestream only covers the database and does not.
- Delivery is IPv4 only (Docker's default network); SPF and PTR must be IPv4.
- OpenSMTPD keeps its default retry behaviour for deferred mail.
- Inspect the queue: `docker compose --profile mail exec mail smtpctl show queue`.
