# ── Stage 1: Install dependencies ──────────────────────────────────
FROM node:18-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY prisma ./prisma/
RUN npx prisma generate

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

# Entrypoint: run migrations then start
COPY <<'EOF' /app/entrypoint.sh
#!/bin/sh
set -e
export DATABASE_URL="file:/data/hr-buddy.db"
npx prisma migrate deploy --schema ./prisma/schema.prisma
exec node server.js
EOF
RUN chmod +x /app/entrypoint.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["/app/entrypoint.sh"]
