# syntax=docker/dockerfile:1.4
ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-bullseye AS base

ENV NODE_ENV=development \
    NPM_CONFIG_LOGLEVEL=warn \
    CHOKIDAR_USEPOLLING=true

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

FROM base AS development
ARG UID=1000
ARG GID=1000

RUN groupadd --gid "${GID}" nodeapp \
    && useradd --uid "${UID}" --gid nodeapp --shell /bin/bash --create-home nodeapp

USER nodeapp

WORKDIR /usr/src/app

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
