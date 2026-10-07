# Single image for both the API and the worker (different commands).
# Debian-based so sharp's prebuilds work.
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm --filter server build

FROM node:22-slim AS pruned
RUN corepack enable
WORKDIR /pruned
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/server/package.json apps/server/package.json
COPY apps/server/drizzle ./apps/server/drizzle
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm --filter server --prod --ignore-scripts deploy /app

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=pruned /app /app
COPY --from=build /build/apps/server/dist /app/dist
# Overridden per service in docker-compose.yml.
CMD ["node", "dist/api/serve.js"]
