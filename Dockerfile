# ── Stage 1: Install dependencies ──────────────────────────────────
FROM node:18-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma/
ENV DATABASE_URL="file:/tmp/dummy.db"
RUN npm ci

# ── Stage 2: Build the Next.js app ─────────────────────────────────
FROM node:18-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Remove local dev artifacts
RUN rm -rf .next .env.local .env dev-output.log "Start Dashboard.bat" prisma/*.db prisma/*.db-journal
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Stage 3: Production image ──────────────────────────────────────
FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built assets
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy Prisma schema + migrations for runtime migrate
COPY --from=deps /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=deps /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma

# SQLite data lives in a persistent volume
RUN mkdir -p /data && chown nextjs:nodejs /data
VOLUME /data

# Entrypoint script: run migrations then start
RUN printf '#!/bin/sh\nset -e\nexport DATABASE_URL="file:/data/hr-buddy.db"\nnpx prisma migrate deploy --schema ./prisma/schema.prisma\nexec node server.js\n' > /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["/app/entrypoint.sh"]
