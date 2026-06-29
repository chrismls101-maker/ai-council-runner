FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.server.json vite.config.ts index.html ./
COPY public ./public
COPY prototypes ./prototypes
COPY src ./src
COPY glass-app/glass-update-manifest.json ./glass-app/glass-update-manifest.json
COPY glass-app/src/renderer/overlay/GlassIdeEditor.css ./glass-app/src/renderer/overlay/
COPY glass-app/src/renderer/overlay/GlassIdeFileTree.css ./glass-app/src/renderer/overlay/
COPY glass-app/src/renderer/overlay/GlassIdePremium.css ./glass-app/src/renderer/overlay/
COPY glass-app/src/renderer/overlay/GlassIdePreview.css ./glass-app/src/renderer/overlay/
COPY glass-app/src/renderer/overlay/GlassIdeShell.css ./glass-app/src/renderer/overlay/
COPY glass-app/src/renderer/overlay/GlassIdeStream.css ./glass-app/src/renderer/overlay/
COPY glass-app/src/renderer/workspace/workspaceChrome.css ./glass-app/src/renderer/workspace/
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/glass-app/glass-update-manifest.json ./glass-app/glass-update-manifest.json
EXPOSE 3001

# Railway / Docker health check — container is healthy when /api/health returns 200.
# Interval 30s, 10s timeout, 3 retries before marked unhealthy, 20s start grace period.
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=20s \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "dist/server/index.js"]
