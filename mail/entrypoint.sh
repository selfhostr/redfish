#!/bin/bash
# Entrypoint of the redfish mail module: validates the environment, generates the DKIM key,
# a private CA and a server certificate on first start, renders smtpd.conf and runs smtpd.
set -euo pipefail

DATA=/var/lib/redfish-mail
PUBLIC="$DATA/public"
PRIVATE="$DATA/private"
SPOOL=/var/spool/smtpd
CONF=/etc/smtpd.conf
CREDS=/etc/smtpd-creds

die() {
	echo "redfish-mail: $*" >&2
	exit 1
}

[ -n "${MAIL_DOMAIN:-}" ] || die "MAIL_DOMAIN is required (sending and DKIM domain)"
MAIL_DOMAIN="${MAIL_DOMAIN,,}"
MAIL_HOSTNAME="${MAIL_HOSTNAME:-mail.$MAIL_DOMAIN}"
MAIL_HOSTNAME="${MAIL_HOSTNAME,,}"
MAIL_DKIM_SELECTOR="${MAIL_DKIM_SELECTOR:-redfish}"
MAIL_SMTP_USER="${MAIL_SMTP_USER:-redfish}"
[ -n "${MAIL_SMTP_PASSWORD:-}" ] || die "MAIL_SMTP_PASSWORD is required"
[ "${#MAIL_SMTP_PASSWORD}" -ge 20 ] || die "MAIL_SMTP_PASSWORD must be at least 20 characters"

# Values end up in smtpd.conf and in certificates: accept plain DNS-style tokens only.
dns_re='^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$'
[[ $MAIL_DOMAIN =~ $dns_re ]] || die "MAIL_DOMAIN is not a valid domain name"
[[ $MAIL_HOSTNAME =~ $dns_re ]] || die "MAIL_HOSTNAME is not a valid host name"
[[ $MAIL_DKIM_SELECTOR =~ ^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?$ ]] \
	|| die "MAIL_DKIM_SELECTOR is not a valid DKIM selector"
[[ $MAIL_SMTP_USER =~ ^[A-Za-z0-9._-]+$ ]] || die "MAIL_SMTP_USER contains invalid characters"

# The DKIM filter runs unprivileged: "opensmtpd" on Debian, "_smtpd" elsewhere.
FUSER=""
for u in opensmtpd _smtpd; do
	if getent passwd "$u" >/dev/null; then
		FUSER=$u
		break
	fi
done
[ -n "$FUSER" ] || die "cannot find the OpenSMTPD filter user"

umask 077
# The volume root and its directories must be traversable by the filter user, or smtpd
# exits with "lost processor: dkim".
mkdir -p "$PUBLIC" "$PRIVATE"
chown root:root "$DATA"
chmod 0755 "$DATA" "$PUBLIC"
chown root:"$FUSER" "$PRIVATE"
chmod 0750 "$PRIVATE"

# DKIM key (RSA 2048), reused on later starts. Owned by the filter user, mode 0600.
if [ ! -s "$PRIVATE/dkim.key" ]; then
	echo "redfish-mail: generating the DKIM key"
	openssl genrsa -out "$PRIVATE/dkim.key" 2048 2>/dev/null
fi
chown "$FUSER":"$FUSER" "$PRIVATE/dkim.key"
chmod 0600 "$PRIVATE/dkim.key"

# Private CA and server certificate for the service name "mail", reused on later starts.
if [ ! -s "$PRIVATE/ca.key" ] || [ ! -s "$PRIVATE/ca.crt" ]; then
	echo "redfish-mail: generating the private CA"
	openssl req -x509 -newkey rsa:3072 -nodes -days 3650 -sha256 \
		-subj "/CN=redfish mail CA" \
		-addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
		-addext "keyUsage=critical,keyCertSign,cRLSign" \
		-keyout "$PRIVATE/ca.key" -out "$PRIVATE/ca.crt" 2>/dev/null
	rm -f "$PRIVATE/server.key" "$PRIVATE/server.crt"
fi
if [ ! -s "$PRIVATE/server.key" ] || [ ! -s "$PRIVATE/server.crt" ]; then
	echo "redfish-mail: generating the server certificate"
	openssl req -newkey rsa:2048 -nodes -sha256 -subj "/CN=mail" \
		-keyout "$PRIVATE/server.key" -out "$PRIVATE/server.csr" 2>/dev/null
	printf 'basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:mail,DNS:localhost\n' \
		>"$PRIVATE/server.ext"
	openssl x509 -req -in "$PRIVATE/server.csr" -CA "$PRIVATE/ca.crt" -CAkey "$PRIVATE/ca.key" \
		-CAcreateserial -days 3650 -sha256 -extfile "$PRIVATE/server.ext" \
		-out "$PRIVATE/server.crt" 2>/dev/null
	rm -f "$PRIVATE/server.csr" "$PRIVATE/server.ext"
fi
chown root:root "$PRIVATE"/ca.* "$PRIVATE"/server.* 2>/dev/null || true
chmod 0600 "$PRIVATE"/ca.* "$PRIVATE"/server.* 2>/dev/null || true

# Public artefacts, readable by the redfish containers (user "node").
cp "$PRIVATE/ca.crt" "$PUBLIC/ca.crt"
{
	echo "$MAIL_DKIM_SELECTOR"
	printf 'v=DKIM1; k=rsa; p=%s\n' \
		"$(openssl rsa -in "$PRIVATE/dkim.key" -pubout -outform DER 2>/dev/null | openssl base64 -A)"
} >"$PUBLIC/dkim.txt"
chmod 0644 "$PUBLIC/ca.crt" "$PUBLIC/dkim.txt"

# Submission credentials (sha512-crypt), never written to the volume.
printf '%s %s\n' "$MAIL_SMTP_USER" "$(printf '%s' "$MAIL_SMTP_PASSWORD" | openssl passwd -6 -stdin)" >"$CREDS"
chmod 0640 "$CREDS"
chown root:"$FUSER" "$CREDS"

# Queue directory lives on its own volume so queued mail survives restarts.
mkdir -p "$SPOOL"
chown root:root "$SPOOL"
chmod 0711 "$SPOOL"

# One listener, STARTTLS and authentication required, DKIM-signed. No other listener and no
# match rule for unauthenticated mail: it is rejected (no open relay, no inbound port 25).
cat >"$CONF" <<EOF
pki mail cert "$PRIVATE/server.crt"
pki mail key "$PRIVATE/server.key"

table creds file:$CREDS

filter dkim proc-exec "/usr/libexec/opensmtpd/filter-dkimsign -d $MAIL_DOMAIN -s $MAIL_DKIM_SELECTOR -k $PRIVATE/dkim.key" user $FUSER group $FUSER

listen on 0.0.0.0 port 587 hostname $MAIL_HOSTNAME tls-require pki mail auth <creds> filter dkim

action "relay" relay helo $MAIL_HOSTNAME
match auth from any for any action "relay"
EOF
chmod 0644 "$CONF"

smtpd -n -f "$CONF" >/dev/null || die "smtpd.conf is invalid"

echo "redfish-mail: starting for $MAIL_DOMAIN (HELO $MAIL_HOSTNAME, DKIM selector $MAIL_DKIM_SELECTOR)"
exec smtpd -d -f "$CONF"
