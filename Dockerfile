FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Prisma schema at repo-relative path ../prisma from server/
COPY prisma ./prisma
COPY server/package.json server/package-lock.json ./server/

WORKDIR /app/server
RUN npm ci

COPY server ./

RUN npx prisma generate --schema=../prisma/schema.prisma

ENV NODE_ENV=production
EXPOSE 3001

CMD ["npx", "tsx", "src/index.ts"]
