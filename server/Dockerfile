# ---- build stage -----------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Copy manifests first so `npm ci` is cached until dependencies actually change.
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# postinstall runs `prisma generate`, which needs the schema copied above.
RUN npm ci

COPY tsconfig*.json nest-cli.json ./
COPY src ./src

RUN npm run build

# ---- runtime stage ---------------------------------------------------------
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

# Prisma's engine needs OpenSSL on Alpine; curl is used by the healthcheck.
RUN apk add --no-cache openssl curl

COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# --ignore-scripts would skip prisma generate, so let postinstall run, then drop
# the dev dependencies it needed.
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

# Create the upload directory owned by the runtime user *before* dropping
# privileges. A named volume mounted here inherits the image's ownership for
# this path; without it Docker creates the directory as root and the
# unprivileged process cannot write a single file.
RUN mkdir -p /app/uploads && chown node:node /app/uploads

# Never run the app as root.
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/api/v1/health || exit 1

CMD ["node", "dist/src/main"]
