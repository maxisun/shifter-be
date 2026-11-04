# syntax=docker/dockerfile:1

ARG NODE_VERSION=26.13
ARG PNPM_VERSION=12.14.0

FROM node:${NODE_VERSION}-bookworm-slim AS base
ARG PNPM_VERSION
WORKDIR /app
RUN npm install --global --no-audit --no-fund pnpm@${PNPM_VERSION}

FROM base AS development
ENV NODE_ENV=development
COPY . .
EXPOSE 3000 9229
CMD ["pnpm", "run", "start:dev"]

FROM base AS build
ENV NODE_ENV=development
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM base AS production-dependencies
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM node:${NODE_VERSION}-bookworm-slim AS production
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/main.js"]
