# --- build the static bundle ---------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# No secrets are available (or needed) at build time: the API key is injected by nginx at runtime.
RUN npm run build

# --- serve it + proxy /api ------------------------------------------------------------------
# nginx-unprivileged runs as a non-root user and listens on 8080.
FROM nginxinc/nginx-unprivileged:alpine
# Only substitute ${API_KEY} in the template; nginx's own $variables must stay untouched.
ENV NGINX_ENVSUBST_FILTER=^API_KEY$
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
