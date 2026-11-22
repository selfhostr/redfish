# redfish mail module

Optional, send-only OpenSMTPD server for redfish: authenticated submission on port 587
(STARTTLS required, internal Docker network only), DKIM signing for one domain, no inbound
listener and no open relay. Disabled unless the `mail` compose profile is started.

See [docs/self-hosted-sending.md](../docs/self-hosted-sending.md) to enable it.
