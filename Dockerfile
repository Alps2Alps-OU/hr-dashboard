# Stage 1: Install dependencies
FROM node:18-slim AS deps
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma/
ENV DATABASE_URL="file:/tmp/dummy.db"
RUN tr -d '\0' < prisma/schema.prisma | sed 's|[[:space:]]*//.*||' > /tmp/schema.clean && mv /tmp/schema.clean prisma/schema.prisma && npm ci

# Stage 2: Build the Nexth.js app
FROM node:18-slim AS builder
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN rm -rf .next .env.local .env dev-output.log "Start Dashboard.bat" prisma/*.db prisma/*.db-journal
RUN find . -path ./node_modules -prune -o -type f -name '*.js' -print -o -name '*.ts' -print -o -name '*.tsx' -print -o -name '*.jsx' -print -o -name '*.json' -print -o -name '*.css' -print -o -name '*.mjs' -print -o -name '*.prisma' -print -o -name '*.md' -print | while read f; do tr -d '\0' < "$f" > "$f.tmp" && mv "$f.tmp" "$f"; done
# Fix next.config.js truncated by null-byte corruption in initial push
RUN printf '%s\n' "/** @type {import('next').NextConfig} */" "const nextConfig = {" "  output: 'standalone'," "  typescript: { ignoreBuildErrors: true }," "  eslint: { ignoreDuringBuilds: true }," "  experimental: {" "    serverComponentsExternalPackages: ['pdf-parse', '@prisma/client']," "  }," "};" "" "module.exports = nextConfig;" > next.config.js
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="file:/tmp/dummy.db"
RUN npx prisma db push --skip-generate
RUN mkdir -p public
RUN npm run build

# Stage 3: Production image
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
