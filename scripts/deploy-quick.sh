#!/usr/bin/env bash
# Quick deploy for code-only changes: compiles locally and ships just dist/ (a few hundred KB) instead
# of the whole 1.2 GB image, which slow or flaky connections can't upload. The server layers it on top
# of its current image and restarts. Use scripts/deploy.sh when dependencies or the database change.
set -euo pipefail

HOST="${DEPLOY_HOST:-anurag-droplet}"
APP_DIR=/srv/apps/campaign-one
IMAGE=campaign-one-api
TAG="$(date +%Y%m%d%H%M%S)"
PUBLIC_URL=https://campaign-one.64-227-171-165.sslip.io/api/health

cd "$(dirname "$0")/.."

echo "==> Compiling"
rm -rf dist
npm run build >/dev/null

echo "==> Uploading code ($(du -sh dist | cut -f1)) and restarting"
tar czf - dist | ssh "$HOST" "set -e
  rm -rf /tmp/quick-deploy && mkdir -p /tmp/quick-deploy
  tar xzf - -C /tmp/quick-deploy
  printf 'FROM $IMAGE:latest\nCOPY dist /app/dist\n' > /tmp/quick-deploy/Dockerfile
  docker build -q -t $IMAGE:$TAG /tmp/quick-deploy >/dev/null
  docker tag $IMAGE:$TAG $IMAGE:latest
  cd $APP_DIR && docker compose up -d
  rm -rf /tmp/quick-deploy
  docker images $IMAGE --format '{{.Tag}}' | grep -v -e '^latest\$' -e '^$TAG\$' | xargs -r -I{} docker rmi $IMAGE:{} >/dev/null 2>&1 || true"

echo "==> Checking $PUBLIC_URL"
for _ in $(seq 1 20); do
  if curl -fsS "$PUBLIC_URL" >/dev/null; then echo "Deployed $TAG"; exit 0; fi
  sleep 3
done
echo "Health check failed. Logs: ssh $HOST docker logs campaign-one-api" >&2
exit 1
