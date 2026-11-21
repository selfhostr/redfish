#!/bin/sh
# Takes the documentation and website screenshots in a container, so the host
# needs neither Chromium nor its system libraries. Output: screenshots/out/
# (or the directory given as first argument). Extra variables passed through:
# SHOTS_SCHEMES (default "dark").
#
#   sh scripts/screenshots-docker.sh [output-dir]
#
# The image is the official Playwright one (same version as @playwright/test)
# with Node 24 added, as the app requires it. The repository is copied inside
# the container: the host's node_modules, build/ and data/ are never touched.
set -eu
cd "$(dirname "$0")/.."
PW=$(node -p "require('./package.json').devDependencies['@playwright/test']" 2>/dev/null ||
	sed -n 's/.*"@playwright\/test": "\([^"]*\)".*/\1/p' package.json)
OUT=$(mkdir -p "${1:-screenshots/out}" && cd "${1:-screenshots/out}" && pwd)
IMAGE="redfish-screenshots:$PW"

docker build -q -t "$IMAGE" - <<DOCKERFILE >/dev/null
FROM node:24-bookworm-slim AS node
FROM mcr.microsoft.com/playwright:v$PW-noble
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -sf ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -sf ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx
DOCKERFILE

docker run --rm --init --ipc=host \
	--user "$(id -u):$(id -g)" -e HOME=/tmp \
	-e SHOTS_SCHEMES="${SHOTS_SCHEMES:-dark}" -e SHOTS_DIR=/out \
	-v "$PWD:/src:ro" -v "$OUT:/out" \
	"$IMAGE" sh -ec '
		mkdir /tmp/app
		tar -C /src --exclude=./node_modules --exclude=./build --exclude=./.svelte-kit \
			--exclude=./data --exclude=./screenshots/out -cf - . | tar -C /tmp/app -xf -
		cd /tmp/app
		# Prebuilt binaries only (better-sqlite3, sharp, esbuild): no compiler in the image.
		npm ci --ignore-scripts --no-audit --no-fund --loglevel=error
		npm run screenshots
	'
echo "Screenshots written to $OUT"
