# syntax=docker/dockerfile:1
#
# One image for the app, the migrations and the cleanup command (`npm run -s db:cleanup` via `docker exec`): the workspace packages export
# TypeScript sources and the MikroORM CLI needs the dev dependencies, so nothing is pruned here.
# The image is built once in CI or on the server (see "Wdrożenie na mikr.us" in README.md).
FROM node:22-slim

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# Dependencies first: this layer is cached until a package.json or the lockfile changes.
COPY package.json package-lock.json ./
COPY packages/app/package.json packages/app/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/ui/package.json packages/ui/
RUN npm ci

COPY . .
# `next build` does not need a database: the ORM connects lazily (AGENTS.md).
RUN npm run build

ENV NODE_ENV=production
USER node
EXPOSE 3000

# Inside the container the app listens on IPv4; Docker publishes the port on the host's IPv6 address too,
# which is what the mikr.us subdomains need (checked on the server, see README.md).
CMD ["npm", "run", "start", "-w", "@gomoku/app", "--", "-H", "0.0.0.0", "-p", "3000"]
