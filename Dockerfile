# ── Stage 1: Install dependencies ──────────────────────────────────
FROM node:18-slim AS deps
RUN apt-get update && apt-get install -y openssl dos2unix && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN dos2unix package.json package-lock.json prisma/schema.prisma 2>/dev/null || true
ENV DATABASE_URL="file:/tmp/dummy.db"
RUN echo "=== Node: $(node -v) NPM: $(npm -v) ===" && \
    echo "=== package.json exists: $(test -f package.json && echo YES || echo NO) ===" && \
    echo "=== package-lock.json exists: $(test -f package-lock.json && echo YES || echo NO) ===" && \
    npm install --loglevel verbose 2>&1

# ── Stage 2: Build the Next.js app ─────────────────────────────────
FROM node:18-slim AS builder
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN rm -rf .next .env.local .env dev-output.log "Start Dashboard.bat" prisma/*.db prisma/*.db-journal
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="file:/tmp/dummy.db"
RUN npm run build

# ── Stage 3: Production image ──────────────────────────────────────
FROM node:18-slim AS runner
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=deps /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=deps /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma

RUN mkdir -p /data && chown nextjs:nodejs /data
VOLUME /data

RUN printf '#!/bin/sh\nset -e\nexport DATABASE_URL="file:/data/hr-buddy.db"\nnpx prisma migrate deploy --schema ./prisma/schema.prisma\nexec node server.js\n' > /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["/app/entrypoint.sh"]
