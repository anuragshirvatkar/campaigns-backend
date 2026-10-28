#!/usr/bin/env bash
# Build the API image locally, ship it to the droplet, migrate, restart.
# The droplet (512 MB) is too small to build images itself.
set -euo pipefail

HOST="${DEPLOY_HOST:-anurag-droplet}"
APP_DIR=/srv/apps/campaign-one
IMAGE=campaign-one-api
TAG="$(date +%Y%m%d%H%M%S)"
PUBLIC_URL=https://campaign-one.64-227-171-165.sslip.io/api/health

cd "$(dirname "$0")/.."

echo "==> Building $IMAGE:$TAG"
docker build --platform linux/amd64 -t "$IMAGE:$TAG" .

echo "==> Uploading image to $HOST"
docker save "$IMAGE:$TAG" | gzip | ssh "$HOST" "gunzip | docker load >/dev/null"
ssh "$HOST" "docker tag $IMAGE:$TAG $IMAGE:latest"
scp -q deploy/docker-compose.yml "$HOST:$APP_DIR/docker-compose.yml"

echo "==> Migrating database and restarting"
ssh "$HOST" "cd $APP_DIR \
  && docker compose run --rm api npx prisma migrate deploy \
  && docker compose run --rm api node dist/scripts/create-admin.js \
  && docker compose up -d"

echo "==> Removing old images on the server"
ssh "$HOST" "docker images $IMAGE --format '{{.Tag}}' | grep -v -e '^latest$' -e '^$TAG$' | xargs -r -I{} docker rmi $IMAGE:{} >/dev/null"
docker rmi "$IMAGE:$TAG" >/dev/null

echo "==> Checking $PUBLIC_URL"
for _ in $(seq 1 20); do
  if curl -fsS "$PUBLIC_URL"; then echo; echo "Deployed $TAG"; exit 0; fi
  sleep 3
done
echo "Health check failed. Logs: ssh $HOST docker logs campaign-one-api" >&2
exit 1
