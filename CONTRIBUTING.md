# Contributing to redfish

## Run everything in Docker

There is no host toolchain. From the repository root:

```sh
cp .env.example .env
docker compose run --rm app sh -c 'npm ci && npm run format:check && npm run check && npm test'
```

`docker compose up -d` starts the dev server on port 3000 and the worker. After changing dependencies, rebuild the image (`docker compose build && docker compose up -d --force-recreate`, or `docker compose down -v`), because the anonymous `node_modules` volume otherwise hides the new packages.

## What CI checks

Prettier (`npm run format:check`, fix with `npm run format`), `npm run check` (svelte-check), `npm test` (Vitest), the production build, `npm audit` and a licence check (only OSI-approved licences), and CodeQL. GitHub Actions are pinned to full commit SHAs.

## Branches and pull requests

- Work on a branch: `feat/...`, `fix/...`, `docs/...` or `chore/...`. Never push to `main`.
- One topic per pull request. Titles and commits follow Conventional Commits, for example `feat(scenarios): add a new scenario`.
- Sign off every commit (Developer Certificate of Origin): `git commit -s`.
- Add or update tests with the change.

## Rules of the project

- redfish never captures credentials. A change that stores what a target typed will not be merged.
- Scenarios are for authorised awareness training only.
- Never commit secrets, real target data, real hostnames or IP addresses. Use the documentation ranges and `example.com`.
- Text in the repository is written in English.

## Security

Report vulnerabilities privately, see [SECURITY.md](SECURITY.md).
