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
RUN pnpm install --frozen-lockfile

COPY apps/worker apps/worker
COPY packages/db packages/db
RUN pnpm db:generate
RUN pnpm --filter @agentic-support/db build
RUN pnpm --filter @apps/worker build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_support
ENV REDIS_HOST=localhost
ENV REDIS_PORT=6379
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/worker ./apps/worker
COPY --from=build /app/packages/db ./packages/db
WORKDIR /app/apps/worker
CMD ["node", "dist/main"]
