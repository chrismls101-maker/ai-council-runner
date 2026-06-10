FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.server.json vite.config.ts index.html ./
COPY public ./public
COPY prototypes ./prototypes
COPY src ./src
COPY desktop-glass/glass-update-manifest.json ./desktop-glass/glass-update-manifest.json
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 3001

# Railway / Docker health check — container is healthy when /api/health returns 200.
# Interval 30s, 10s timeout, 3 retries before marked unhealthy, 20s start grace period.
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=20s \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "dist/server/index.js"]
