FROM node:22.12.0-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
COPY --from=build /src/dist/client /usr/share/nginx/html
RUN if [ -f /usr/share/nginx/html/_shell.html ] && [ ! -f /usr/share/nginx/html/index.html ]; then \
      cp /usr/share/nginx/html/_shell.html /usr/share/nginx/html/index.html; \
    fi \
 && chmod +x /docker-entrypoint.sh
ENTRYPOINT ["/docker-entrypoint.sh"]
