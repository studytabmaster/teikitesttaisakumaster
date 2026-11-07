# 1. ビルド作業（bunでアプリを組み立てる）
FROM node:22-alpine AS builder
WORKDIR /app

RUN npm install -g bun
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# Node.jsサーバー向けに組み立てる設定
ENV NITRO_PRESET=node-server
RUN bun run build

# 2. 実行作業（出来上がったファイルだけを軽量サーバーで動かす）
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0


COPY --from=builder /app/.output ./.output


CMD ["node", ".output/server/index.mjs"]
