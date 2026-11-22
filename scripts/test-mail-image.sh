#!/usr/bin/env bash
# Builds the mail image and checks it: STARTTLS on 587, no unauthenticated relay,
# authenticated submission accepted and DKIM-signed, refuses to start without its password.
# Used by CI (job "Mail image") and runnable locally with Docker: scripts/test-mail-image.sh
set -euo pipefail

cd "$(dirname "$0")/.."
IMAGE=redfish-mail:test
NAME=redfish-mail-test-$$
DOMAIN=verify-mail.test
USER_NAME=redfish
PASSWORD=test-password-0123456789-abc

cleanup() {
	docker rm -f "$NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

fail() {
	echo "FAIL: $*" >&2
	docker logs "$NAME" 2>&1 | tail -30 >&2 || true
	exit 1
}

docker build -t "$IMAGE" mail

echo "== refuses to start without MAIL_SMTP_PASSWORD"
if docker run --rm -e MAIL_DOMAIN="$DOMAIN" "$IMAGE" >/dev/null 2>&1; then
	fail "container started without MAIL_SMTP_PASSWORD"
fi
if docker run --rm -e MAIL_DOMAIN="$DOMAIN" -e MAIL_SMTP_PASSWORD=short "$IMAGE" >/dev/null 2>&1; then
	fail "container started with a short MAIL_SMTP_PASSWORD"
fi
if docker run --rm -e MAIL_SMTP_PASSWORD="$PASSWORD" "$IMAGE" >/dev/null 2>&1; then
	fail "container started without MAIL_DOMAIN"
fi

echo "== starts"
docker run -d --name "$NAME" \
	-e MAIL_DOMAIN="$DOMAIN" -e MAIL_SMTP_USER="$USER_NAME" -e MAIL_SMTP_PASSWORD="$PASSWORD" \
	"$IMAGE" >/dev/null
for _ in $(seq 1 60); do
	if docker exec "$NAME" bash -c 'exec 3<>/dev/tcp/127.0.0.1/587' 2>/dev/null; then
		break
	fi
	sleep 1
done
docker exec "$NAME" bash -c 'exec 3<>/dev/tcp/127.0.0.1/587' || fail "nothing listens on 587"

# Talks SMTP over STARTTLS inside the container. $1 = the dialogue after STARTTLS.
# The server certificate is verified against the generated CA, as redfish does.
smtp() {
	# OpenSMTPD does not accept pipelining: send one line at a time.
	docker exec -i "$NAME" bash -c '
		( sleep 2; while IFS= read -r l || [ -n "$l" ]; do printf "%s\r\n" "$l"; sleep 0.4; done; sleep 2 ) \
			| openssl s_client -starttls smtp -connect 127.0.0.1:587 \
				-servername mail -verify_hostname mail -verify_return_error \
				-CAfile /var/lib/redfish-mail/public/ca.crt -quiet 2>&1
	'
}

echo "== STARTTLS is offered and the certificate verifies against the module CA"
out=$(printf 'EHLO test.local\nQUIT\n' | smtp) || true
echo "$out" | grep -q '^250' || fail "no EHLO answer over STARTTLS: $out"
echo "$out" | grep -qi 'verification error' && fail "certificate did not verify: $out"

echo "== unauthenticated relay is refused"
out=$(printf 'EHLO test.local\nMAIL FROM:<a@%s>\nRCPT TO:<x@example.com>\nQUIT\n' "$DOMAIN" | smtp) || true
echo "$out" | grep -Eq '^5[0-9][0-9] ' || fail "unauthenticated RCPT was not rejected: $out"
echo "$out" | grep -Eq '^250 .*(Recipient|OK|Ok)' && fail "unauthenticated RCPT accepted: $out"

echo "== authenticated submission is accepted and DKIM-signed"
docker exec "$NAME" smtpctl pause mta >/dev/null
auth=$(printf '\0%s\0%s' "$USER_NAME" "$PASSWORD" | base64 -w0)
msg=$(printf 'EHLO test.local\nAUTH PLAIN %s\nMAIL FROM:<noreply@%s>\nRCPT TO:<x@example.com>\nDATA\nFrom: noreply@%s\nTo: x@example.com\nSubject: dkim test\nDate: Mon, 01 Jan 2026 00:00:00 +0000\nMessage-ID: <t1@%s>\n\nhello\n.\nQUIT\n' \
	"$auth" "$DOMAIN" "$DOMAIN" "$DOMAIN")
out=$(printf '%s' "$msg" | smtp) || true
echo "$out" | grep -q '^235' || fail "authentication refused: $out"
echo "$out" | grep -q '^250 2.0.0 .* Message accepted for delivery' || fail "message not accepted: $out"
sleep 2
# The header is folded over several lines: unfold it before checking the tags.
sig=$(docker exec "$NAME" grep -rh -A6 '^DKIM-Signature' /var/spool/smtpd 2>/dev/null | tr -d '\r\n\t ' || true)
[ -n "$sig" ] || fail "queued message has no DKIM-Signature"
case "$sig" in *"d=$DOMAIN;"*) ;; *) fail "DKIM-Signature has the wrong domain: $sig" ;; esac
case "$sig" in *"s=redfish;"*) ;; *) fail "DKIM-Signature has the wrong selector: $sig" ;; esac

echo "== public artefacts"
docker exec "$NAME" head -c 27 /var/lib/redfish-mail/public/ca.crt | grep -q 'BEGIN CERTIFICATE' || fail "ca.crt"
[ "$(docker exec "$NAME" sed -n 1p /var/lib/redfish-mail/public/dkim.txt)" = redfish ] || fail "dkim.txt selector"
docker exec "$NAME" sed -n 2p /var/lib/redfish-mail/public/dkim.txt | grep -q '^v=DKIM1; k=rsa; p=MII' \
	|| fail "dkim.txt value"

echo "== compose files validate with and without the mail profile"
env_file=$(mktemp)
echo "REDFISH_SECRET_KEY=x" >"$env_file"
created_env=0
if [ ! -e .env ]; then
	cp "$env_file" .env
	created_env=1
fi
docker compose config >/dev/null
docker compose --profile mail config >/dev/null
docker compose --profile mail config | grep -A40 '^  mail:' | grep -q 'published' && fail "mail service publishes a port"
[ "$created_env" = 1 ] && rm -f .env
rm -f "$env_file"

echo "OK"
