FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

FROM base AS build
WORKDIR /app
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_support
ENV REDIS_HOST=localhost
ENV REDIS_PORT=6379
ENV AI_PROVIDER=deterministic
ENV AI_ENABLE_FALLBACK=true

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/observability/package.json packages/observability/package.json
RUN pnpm install --frozen-lockfile

COPY apps/api apps/api
COPY packages/db packages/db
COPY packages/observability packages/observability
RUN pnpm db:generate
RUN pnpm --filter @agentic-support/db build
RUN pnpm --filter @agentic-support/observability build
RUN pnpm --filter @apps/api build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_support
ENV REDIS_HOST=localhost
ENV REDIS_PORT=6379
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/packages/db ./packages/db
COPY --from=build /app/packages/observability ./packages/observability
WORKDIR /app/apps/api
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3001/health/live').then((res) => { if (!res.ok) process.exit(1); }).catch(() => process.exit(1))"
CMD ["node", "dist/main"]
