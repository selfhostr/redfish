# Optional send-only mail server (OpenSMTPD + DKIM signing) for redfish.
# See ../docs/self-hosted-sending.md. Not started unless the "mail" compose profile is used.
FROM debian:trixie-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2

RUN apt-get update \
	&& DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
		opensmtpd opensmtpd-filter-dkimsign openssl ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 0755 /usr/local/bin/entrypoint.sh

# Generated keys, certificates and the public artefacts (public/) live here.
VOLUME ["/var/lib/redfish-mail", "/var/spool/smtpd"]
# Submission only, and only on the internal Docker network (never published by compose).
EXPOSE 587

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
	CMD ["bash", "-c", "exec 3<>/dev/tcp/127.0.0.1/587"]

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
