FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY tsconfig.json vitest.config.ts ./
COPY src ./src

COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

ENV NODE_ENV=production

ENTRYPOINT ["./entrypoint.sh"]
