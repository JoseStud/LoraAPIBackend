# syntax=docker/dockerfile:1.4
ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-bullseye AS base

# Lighthouse CI's puppeteer would otherwise download Chrome on install; the
# dev server never uses it (CI skips it the same way).
ENV NODE_ENV=development \
    NPM_CONFIG_LOGLEVEL=warn \
    CHOKIDAR_USEPOLLING=true \
    PUPPETEER_SKIP_DOWNLOAD=true

WORKDIR /usr/src/app

COPY package.json package-lock.json ./

RUN npm ci

FROM base AS development
ARG UID=1000
ARG GID=1000

# The node image's own `node` user already holds UID/GID 1000, the default
# here, so it goes first. Vite writes its dependency cache to
# node_modules/.vite, and compose seeds the node_modules volume from this
# image, ownership included.
RUN (userdel --remove node 2>/dev/null || true) \
    && groupadd --gid "${GID}" nodeapp \
    && useradd --uid "${UID}" --gid nodeapp --shell /bin/bash --create-home nodeapp \
    && chown -R nodeapp:nodeapp /usr/src/app

USER nodeapp

WORKDIR /usr/src/app

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
