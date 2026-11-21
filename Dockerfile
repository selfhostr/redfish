# syntax=docker/dockerfile:1
# node:24-bookworm-slim
FROM node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS base
WORKDIR /app

# Dépendances complètes + outils de compilation (modules natifs, ex. better-sqlite3)
FROM base AS deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# Développement et tests : le code source est monté ou copié par-dessus
FROM deps AS dev
COPY . .
ENV NODE_ENV=development
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--port", "3000"]

FROM dev AS build
RUN mkdir -p data && npm run build && npm run build:worker && npm prune --omit=dev

# Production
FROM base AS runtime
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/scenarios ./scenarios
COPY --from=build /app/drizzle ./drizzle
COPY package.json ./
RUN mkdir -p data && chown -R node:node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Migrations puis serveur ; le worker utilise la même image : node build/worker.js
CMD ["sh", "-c", "node build/migrate.js && node build"]
