#!/bin/sh
set -eu
# 监听端口只来自 WEB_PORT 和 API_PORT，模板里不写死数字。
envsubst '${WEB_PORT} ${API_PORT}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf
exec nginx -g 'daemon off;'
