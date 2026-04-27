# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci

FROM deps AS frontend-build
WORKDIR /app

COPY frontend ./frontend
RUN npm run build:frontend

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV RESOURCE_ROOT=/data/resources
ENV DATABASE_STORAGE=/data/iam.sqlite

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY app.js ./app.js
COPY backend ./backend
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

RUN mkdir -p /data/resources

EXPOSE 3001

CMD ["npm", "start"]
