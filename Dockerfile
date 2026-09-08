# One container: the built wall, and the server in front of it.
#
#   docker build -t storyboard .
#   docker run -p 8787:8787 -v storyboard-data:/data \
#     -e BASE_URL=https://wall.example -e OWNER_EMAIL=you@example.com storyboard
#
# Everything it keeps is under /data. With no RESEND_API_KEY, sign-in
# links are printed to the container's log.

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
# the server, and the few source leaves it reads by their real names
COPY server ./server
COPY tools ./tools
COPY src ./src
COPY examples ./examples
COPY public ./public
ENV DATA_DIR=/data PORT=8787 HOST=0.0.0.0
VOLUME /data
EXPOSE 8787
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
