FROM node:20-alpine AS build

RUN apk add --no-cache openssl
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @app/api exec prisma generate && pnpm --filter @app/api run build

FROM node:20-alpine AS runtime

ENV NODE_ENV=production
# MD4 (required by PEAP-MSCHAPv2 NT-hash) is disabled by default in OpenSSL 3.
# The legacy provider re-enables it without affecting security of other operations.
ENV NODE_OPTIONS=--openssl-legacy-provider
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/index.js"]
