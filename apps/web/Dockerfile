FROM node:22-slim AS build
RUN corepack enable
WORKDIR /build
ARG PUBLIC_API_URL=http://localhost:4000
ENV PUBLIC_API_URL=${PUBLIC_API_URL}
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/server/package.json apps/server/package.json
COPY apps/web ./apps/web
# `--ignore-scripts`: workspace `prepare` hooks (panda codegen) assume a dev
# checkout; the build step below generates what it needs explicitly. No
# dependency requires postinstall for these images (sharp/esbuild ship
# prebuilds; Playwright browsers are dev-only).
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm --filter web build

FROM node:22-slim AS pruned
RUN corepack enable
WORKDIR /pruned
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm --filter web --prod --ignore-scripts deploy /app

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4321 \
    HOST=0.0.0.0
COPY --from=pruned /app /app
COPY --from=build /build/apps/web/dist /app/dist
EXPOSE 4321
CMD ["node", "./dist/server/entry.mjs"]
