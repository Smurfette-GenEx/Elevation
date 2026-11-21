# syntax=docker/dockerfile:1.7
# ---------- deps ----------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---------- build ----------
FROM deps AS build
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build-time placeholders only; real values are injected at runtime
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" APP_SECRET="build-time-placeholder-secret-not-used-at-runtime" npm run build

# ---------- prisma CLI (migrations at start-up) ----------
# Installed on its own with its full dependency tree (it needs packages such as `effect`
# that are not part of the Next.js standalone output).
FROM node:22-bookworm-slim AS prisma-cli
WORKDIR /opt/prisma-cli
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN echo '{"name":"prisma-cli","private":true}' > package.json \
  && npm install --omit=dev --no-audit --no-fund prisma@6.19.3

# ---------- runtime ----------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 app && useradd --system --uid 1001 --gid app --home /app app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 \
    CHECKPOINT_DISABLE=1 PRISMA_HIDE_UPDATE_MESSAGE=1
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/prisma ./prisma
# Generated Prisma client + query engine used by the app
COPY --from=build --chown=app:app /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build --chown=app:app /app/node_modules/.prisma ./node_modules/.prisma
# Standalone Prisma CLI for `migrate deploy`
COPY --from=prisma-cli /opt/prisma-cli /opt/prisma-cli
COPY --chown=app:app docker/entrypoint.sh ./entrypoint.sh
RUN mkdir -p /app/storage && chown app:app /app/storage && chmod +x ./entrypoint.sh
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--", "./entrypoint.sh"]
CMD ["node", "server.js"]
