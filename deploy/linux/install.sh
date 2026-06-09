#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/mt5_project}"
USE_DOCKER="${USE_DOCKER:-1}"

echo "[install] target: $APP_DIR"

if [[ $EUID -ne 0 ]]; then
  echo "[install] please run as root or with sudo"
  exit 1
fi

mkdir -p "$APP_DIR"
rsync -a --delete \
  --exclude node_modules \
  --exclude .git \
  "$(cd "$(dirname "$0")/../.." && pwd)/" "$APP_DIR/"

if [[ "$USE_DOCKER" == "1" ]]; then
  if ! command -v docker >/dev/null; then
    echo "[install] installing docker..."
    curl -fsSL https://get.docker.com | sh
  fi
  cd "$APP_DIR/deploy/linux"
  docker compose up -d --build
else
  if ! command -v node >/dev/null; then
    echo "[install] please install Node.js 18+ first"
    exit 1
  fi
  cp "$APP_DIR/deploy/linux/mt5-quotes.service" /etc/systemd/system/mt5-quotes.service
  systemctl daemon-reload
  systemctl enable --now mt5-quotes
fi

sleep 2
curl -sf "http://127.0.0.1:9528/health" && echo
echo "[install] done. open port 9527 for Windows bridge IP only"
