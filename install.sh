#!/usr/bin/env bash
# Interactive installer for a production VPS (Debian/Ubuntu or similar).
# Run it from the repository root: ./install.sh
# Missing prerequisites (curl, openssl, Docker + Compose plugin) can be installed
# after confirmation; this needs root (run as root, or sudo must be available).
# Safe to re-run: an existing .env is only replaced after confirmation, and a
# backup is kept.
set -euo pipefail

TOTAL=8
STEP=0
ENV_FILE=".env"

if [ -t 1 ]; then
  C_BLUE=$'\033[1;34m'; C_GREEN=$'\033[32m'; C_RED=$'\033[31m'
  C_YELLOW=$'\033[33m'; C_RESET=$'\033[0m'
else
  C_BLUE=""; C_GREEN=""; C_RED=""; C_YELLOW=""; C_RESET=""
fi

step() { STEP=$((STEP + 1)); printf '\n%s==> [%d/%d] %s%s\n' "$C_BLUE" "$STEP" "$TOTAL" "$1" "$C_RESET"; }
ok()   { printf '  %s[ok]%s %s\n' "$C_GREEN" "$C_RESET" "$1"; }
info() { printf '  %s\n' "$1"; }
warn() { printf '  %s[warn]%s %s\n' "$C_YELLOW" "$C_RESET" "$1"; }
fail() { printf '  %s[error]%s %s\n' "$C_RED" "$C_RESET" "$1" >&2; exit 1; }

# ask VAR "prompt" [default]: read a non-secret value, re-asking while empty.
ask() {
  local __var=$1 __prompt=$2 __def=${3:-} __val=""
  while :; do
    if [ -n "$__def" ]; then
      read -r -p "  $__prompt [$__def]: " __val || fail "Input closed."
      __val=${__val:-$__def}
    else
      read -r -p "  $__prompt: " __val || fail "Input closed."
    fi
    if [ -z "$__val" ]; then warn "A value is required."; continue; fi
    if ! safe_value "$__val"; then continue; fi
    break
  done
  printf -v "$__var" '%s' "$__val"
}

# yesno "prompt" [default y|n]
yesno() {
  local __def=${2:-n} __a __hint="y/N"
  [ "$__def" = y ] && __hint="Y/n"
  read -r -p "  $1 [$__hint]: " __a || fail "Input closed."
  __a=${__a:-$__def}
  case "$__a" in [yY]|[yY][eE][sS]|[oO]|[oO][uU][iI]) return 0 ;; *) return 1 ;; esac
}

# Values are written single-quoted in .env: refuse characters that cannot be
# represented safely there.
safe_value() {
  case "$1" in
    *\'*|*$'\n'*|*$'\r'*) warn "Single quotes and line breaks are not allowed."; return 1 ;;
  esac
  return 0
}

# ask_secret VAR "prompt": masked input with confirmation.
ask_secret() {
  local __var=$1 __prompt=$2 __a __b
  while :; do
    read -r -s -p "  $__prompt: " __a || fail "Input closed."; echo
    read -r -s -p "  Confirm: " __b || fail "Input closed."; echo
    [ -n "$__a" ] || { warn "A value is required."; continue; }
    [ "$__a" = "$__b" ] || { warn "Values do not match."; continue; }
    safe_value "$__a" || continue
    break
  done
  printf -v "$__var" '%s' "$__a"
}

env_get() { # env_get FILE KEY: last value of KEY, quotes stripped
  local line
  line=$(grep -E "^$2=" "$1" 2>/dev/null | tail -n 1 || true)
  line=${line#*=}
  line=${line#\'}; line=${line%\'}
  line=${line#\"}; line=${line%\"}
  printf '%s' "$line"
}

# as_root CMD...: run a command as root (directly, or through sudo).
as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    fail "Root privileges are required to install packages. Re-run this script as root."
  fi
}

# pkg_install PKG...: install packages with the detected package manager.
pkg_install() {
  local pm=""
  for m in apt-get dnf yum zypper pacman; do
    if command -v "$m" >/dev/null 2>&1; then pm=$m; break; fi
  done
  case "$pm" in
    apt-get) as_root apt-get update && as_root apt-get install -y "$@" ;;
    dnf|yum) as_root "$pm" install -y "$@" ;;
    zypper)  as_root zypper --non-interactive install "$@" ;;
    pacman)  as_root pacman -S --noconfirm --needed "$@" ;;
    *) return 1 ;;
  esac
}

# ensure_tool CMD PKG HELP: install a missing tool via the package manager, after confirmation.
ensure_tool() {
  command -v "$1" >/dev/null 2>&1 && return 0
  yesno "$1 is not installed. Install it now?" y || fail "$1 is required. $3"
  pkg_install "$2" || fail "Could not install $1 automatically. $3"
  command -v "$1" >/dev/null 2>&1 || fail "$1 is still not available after installation. $3"
  ok "$1 installed"
}

# ---------------------------------------------------------------- 1. Preflight
step "Preflight checks"
[ -f docker-compose.yml ] || fail "docker-compose.yml not found. Run ./install.sh from the repository root."
ok "Repository root detected"
ensure_tool curl curl "Install it manually (e.g. apt install curl)."
ensure_tool openssl openssl "Install it manually (e.g. apt install openssl)."
ok "openssl and curl found"
DOCKER_INSTALLED=0
if ! command -v docker >/dev/null 2>&1; then
  yesno "docker is not installed. Install it now (official script from https://get.docker.com)?" y \
    || fail "docker is not installed. See https://docs.docker.com/engine/install/"
  curl -fsSL https://get.docker.com | as_root sh || fail "Docker installation failed. See https://docs.docker.com/engine/install/"
  command -v docker >/dev/null 2>&1 || fail "docker is still not available after installation. See https://docs.docker.com/engine/install/"
  if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
    as_root systemctl enable --now docker || warn "Could not enable/start the docker service."
  fi
  DOCKER_INSTALLED=1
  ok "Docker installed"
fi
if ! docker compose version >/dev/null 2>&1; then
  yesno "The 'docker compose' v2 plugin is not installed. Install it now?" y \
    || fail "The 'docker compose' v2 plugin is missing. Install docker-compose-plugin."
  COMPOSE_PKG=docker-compose-plugin
  if command -v zypper >/dev/null 2>&1 || command -v pacman >/dev/null 2>&1; then COMPOSE_PKG=docker-compose; fi
  if ! pkg_install "$COMPOSE_PKG" 2>/dev/null; then
    info "Package install failed or unavailable; trying the official Docker script."
    curl -fsSL https://get.docker.com | as_root sh || fail "Could not install the Compose plugin. Install docker-compose-plugin."
  fi
  docker compose version >/dev/null 2>&1 || fail "The 'docker compose' v2 plugin is still missing. Install docker-compose-plugin."
  ok "Docker Compose plugin installed"
fi
ok "Docker Compose plugin found"
if ! docker info >/dev/null 2>&1; then
  if [ "$DOCKER_INSTALLED" = 1 ] && [ "$(id -u)" -ne 0 ]; then
    fail "Docker was just installed, but your user cannot use it yet. Run 'sudo usermod -aG docker \$USER', log out and back in, then re-run this script (or re-run it as root)."
  fi
  fail "'docker info' failed. Either the daemon is not running, or your user lacks permission (add it to the 'docker' group and log in again, or run this script as root)."
fi
ok "Docker is usable by $(id -un)"
if [ -f "$ENV_FILE" ] || [ -d data ]; then
  warn "An existing installation was detected (.env and/or ./data). Re-running is safe; nothing is replaced without confirmation."
fi

# ------------------------------------------------------------- 2. Secret key
step "Secret key"
SECRET_KEY=""
if [ -f "$ENV_FILE" ]; then
  SECRET_KEY=$(env_get "$ENV_FILE" REDFISH_SECRET_KEY)
fi
if [ -n "$SECRET_KEY" ]; then
  ok "Keeping the existing REDFISH_SECRET_KEY from .env (not displayed)"
else
  SECRET_KEY=$(openssl rand -base64 32)
  [ -n "$SECRET_KEY" ] || fail "Could not generate a key with openssl."
  ok "Generated a new REDFISH_SECRET_KEY (not displayed; stored in .env)"
fi

# --------------------------------------------------------------- 3. Questions
step "Configuration"
info "DASHBOARD_HOST and TRACKING_HOST are both mandatory and must be two DIFFERENT host names"
info "(operator dashboard vs public tracking pages), e.g. redfish.example.org and go.example.org."
while :; do
  ask DASHBOARD_HOST "Dashboard host name"
  ask TRACKING_HOST "Tracking host name"
  [ "$DASHBOARD_HOST" != "$TRACKING_HOST" ] && break
  warn "The two hosts must be different. Please enter them again."
done
ADDRESS_HEADER=""
PROTOCOL_HEADER=""
HOST_HEADER=""
if yesno "Behind a reverse proxy (Caddy, nginx, Traefik, Cloudflare Tunnel...)? Almost always yes in production" y; then
  # Host isolation uses two host names, so a single fixed origin (the adapter-node origin setting) cannot be
  # used: adapter-node must read the real host per request from the proxy headers.
  PROTOCOL_HEADER="x-forwarded-proto"
  HOST_HEADER="x-forwarded-host"
  info "Proxies (Caddy, nginx, Traefik, Cloudflare) forward x-forwarded-proto / x-forwarded-host; the installer uses those for the request origin."
  info "Client IP: standard proxies use X-Forwarded-For. If you use Cloudflare (orange cloud or Tunnel), enter CF-Connecting-IP."
  ask ADDRESS_HEADER "Client IP header (ADDRESS_HEADER)" "X-Forwarded-For"
  XFF_DEPTH=""
  if [ "$(printf '%s' "$ADDRESS_HEADER" | tr '[:upper:]' '[:lower:]')" = "x-forwarded-for" ]; then
    ask XFF_DEPTH "Number of trusted proxies (XFF_DEPTH)" "1"
  fi
fi
XFF_DEPTH=${XFF_DEPTH:-}
ok "Configuration collected"

# --------------------------------------------------------------- 4. Write .env
step "Writing .env"
if [ -f "$ENV_FILE" ]; then
  if ! yesno ".env already exists. Overwrite it (a backup is made first)?" n; then
    fail "Aborted: .env left untouched."
  fi
  BACKUP="$ENV_FILE.bak.$(date +%Y%m%d%H%M%S)"
  cp -p "$ENV_FILE" "$BACKUP"
  chmod 600 "$BACKUP"
  ok "Backup saved to $BACKUP"
fi

TMP_ENV=$(mktemp "$ENV_FILE.XXXXXX")
trap 'rm -f "$TMP_ENV"' EXIT
chmod 600 "$TMP_ENV"
{
  echo "# Generated by install.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "REDFISH_SECRET_KEY='$SECRET_KEY'"
  echo "DATABASE_URL='file:./data/redfish.db'"
  echo "DASHBOARD_HOST='$DASHBOARD_HOST'"
  echo "TRACKING_HOST='$TRACKING_HOST'"
  [ -n "$PROTOCOL_HEADER" ] && echo "PROTOCOL_HEADER='$PROTOCOL_HEADER'"
  [ -n "$HOST_HEADER" ] && echo "HOST_HEADER='$HOST_HEADER'"
  [ -n "$ADDRESS_HEADER" ] && echo "ADDRESS_HEADER='$ADDRESS_HEADER'"
  [ -n "$XFF_DEPTH" ] && echo "XFF_DEPTH='$XFF_DEPTH'"
  true
} > "$TMP_ENV"
mv -f "$TMP_ENV" "$ENV_FILE"
chmod 600 "$ENV_FILE"
trap - EXIT
ok ".env written (mode 600)"

step "Optional built-in sending module"
MAIL=0
MAIL_DOMAIN=""; MAIL_HOSTNAME=""; MAIL_DKIM_SELECTOR=""; MAIL_SMTP_USER=""; MAIL_SMTP_PASSWORD=""
if yesno "Enable the built-in sending module now? (requires outbound port 25 to be open)" n; then
  MAIL=1
  ask MAIL_DOMAIN "Sending domain (MAIL_DOMAIN)"
  ask MAIL_HOSTNAME "Mail host name (MAIL_HOSTNAME; must match the server's PTR)" "mail.$MAIL_DOMAIN"
  ask MAIL_DKIM_SELECTOR "DKIM selector" "redfish"
  ask MAIL_SMTP_USER "SMTP user" "redfish"
  if yesno "Generate a strong SMTP password?" y; then
    MAIL_SMTP_PASSWORD=$(openssl rand -base64 24)
    ok "SMTP password generated (not displayed; stored in .env)"
  else
    while :; do
      ask_secret MAIL_SMTP_PASSWORD "SMTP password (at least 20 characters)"
      [ "${#MAIL_SMTP_PASSWORD}" -ge 20 ] && break
      warn "The password must be at least 20 characters."
    done
  fi
  ok "Mail module will be started with the 'mail' profile"
else
  info "Skipped. See docs/self-hosted-sending.md to enable it later."
fi

if [ "$MAIL" = 1 ]; then
  {
    echo "MAIL_DOMAIN='$MAIL_DOMAIN'"
    echo "MAIL_HOSTNAME='$MAIL_HOSTNAME'"
    echo "MAIL_DKIM_SELECTOR='$MAIL_DKIM_SELECTOR'"
    echo "MAIL_SMTP_USER='$MAIL_SMTP_USER'"
    echo "MAIL_SMTP_PASSWORD='$MAIL_SMTP_PASSWORD'"
  } >> "$ENV_FILE"
  ok "Mail variables added to .env"
fi


# ---------------------------------------------------------------- 6. Start
step "Starting the services"
PROFILE_ARGS=()
[ "$MAIL" = 1 ] && PROFILE_ARGS=(--profile mail)
# The web/worker containers run as the non-root 'node' user (uid 1000) and must
# be able to create the SQLite database in the ./data bind mount. Only data/ and
# the files directly in it are chowned: never recurse into data/mail (the mail
# module runs as root and OpenSMTPD is strict about the DKIM key permissions).
mkdir -p data
as_root chown 1000:1000 data
as_root find data -maxdepth 1 -type f -exec chown 1000:1000 {} +
info "Pulling images (this can take a few minutes)..."
docker compose ${PROFILE_ARGS[@]+"${PROFILE_ARGS[@]}"} pull || fail "docker compose pull failed."
ok "Images pulled"
info "Starting containers (migrations run automatically at startup)..."
docker compose ${PROFILE_ARGS[@]+"${PROFILE_ARGS[@]}"} up -d || fail "docker compose up failed."
ok "Containers started"

# -------------------------------------------------------------- 7. Health
step "Waiting for the application"
HEALTH_URL="http://localhost:3000/health"
DEADLINE=$((SECONDS + 120))
SPIN='|/-\'
i=0
HEALTHY=0
while [ "$SECONDS" -lt "$DEADLINE" ]; do
  if curl -fsS --max-time 3 "$HEALTH_URL" 2>/dev/null | grep -q '"status":"ok"'; then
    HEALTHY=1; break
  fi
  if [ -t 1 ]; then printf '\r  %s waiting for %s ' "${SPIN:i%4:1}" "$HEALTH_URL"; fi
  i=$((i + 1))
  sleep 2
done
[ -t 1 ] && printf '\r\033[K'
if [ "$HEALTHY" != 1 ]; then
  fail "The application did not become healthy within 120 s. Inspect: docker compose logs web"
fi
ok "Application is healthy ($HEALTH_URL)"

# ------------------------------------------------- 8. First administrator
step "First administrator account"
info "This account is created with the superadmin role (access to the Administration pages)."
ask SEED_EMAIL "Administrator e-mail"
ask_secret SEED_PASSWORD "Administrator password"
if docker compose run --rm -e SEED_EMAIL="$SEED_EMAIL" -e SEED_PASSWORD="$SEED_PASSWORD" -e SEED_ROLE=superadmin web node build/seed.js; then
  ok "Administrator account created"
else
  warn "The seed command failed (the account may already exist). Re-run it manually if needed:"
  info "docker compose run --rm -e SEED_EMAIL=... -e SEED_PASSWORD='...' -e SEED_ROLE=superadmin web node build/seed.js"
fi
unset SEED_PASSWORD

# --------------------------------------------------------------- Summary
printf '\n%sInstallation complete.%s\n\n' "$C_GREEN" "$C_RESET"
cat <<SUMMARY
  Dashboard:  https://$DASHBOARD_HOST

  DNS: make both names resolve to this server (A/AAAA records pointing at the
  server, or CNAME / Cloudflare Tunnel routes, depending on your hosting) and
  have your reverse proxy forward the original Host header, with HTTPS:
    - $DASHBOARD_HOST   (operator dashboard)
    - $TRACKING_HOST   (public tracking pages)

  Data: ./data (SQLite database). Back it up regularly; the 'backup' compose
  profile provides continuous Litestream replication (see docs/deployment.md).
SUMMARY
if [ "$MAIL" = 1 ]; then
  cat <<SUMMARY

  Mail module enabled. Next steps:
    - publish the DKIM record shown on the "Délivrabilité" page (selector: $MAIL_DKIM_SELECTOR);
    - make sure the server's PTR (reverse DNS) matches $MAIL_HOSTNAME.
    Details: docs/self-hosted-sending.md
SUMMARY
else
  cat <<'SUMMARY'

  Mail module not enabled. To add it later: set the MAIL_* variables in .env
  and run: docker compose --profile mail up -d
  (see docs/self-hosted-sending.md).
SUMMARY
fi
