# syntax=docker/dockerfile:1
# Expects `.env` in the build context (uploaded via .gcloudignore rules for `gcloud run deploy --source`).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime: Node/Express serves the built SPA AND the WhatsApp API + webhook.
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["node", "server/index.js"]
