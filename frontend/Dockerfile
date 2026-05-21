ARG NODE_IMAGE=node:22-alpine
FROM ${NODE_IMAGE} AS builder

WORKDIR /app
COPY package.json tsconfig.json vite.config.ts index.html ./
COPY src ./src
RUN npm install
RUN npm run build

ARG NGINX_IMAGE=nginx:1.27-alpine
FROM ${NGINX_IMAGE}
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
