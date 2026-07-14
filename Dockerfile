# syntax=docker/dockerfile:1.7
FROM --platform=$BUILDPLATFORM node:24.16.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run typecheck && npm run test && npm run build

FROM --platform=$TARGETPLATFORM node:24.16.0-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=8787
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/api ./api
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["npm", "start"]
