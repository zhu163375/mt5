#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/mt5_project}"
cd "$APP_DIR"

echo "=== node ==="
command -v node && node -v || echo "node not found"

echo
echo "=== code version ==="
if [[ -f src/start-server.js ]]; then
  echo "start-server.js: OK"
else
  echo "start-server.js: MISSING (git pull required)"
fi
grep -q 'startQuoteServer' src/server.js && echo "server.js fix: OK" || echo "server.js fix: MISSING"

echo
echo "=== ports 9627/9628 ==="
ss -lntp 2>/dev/null | grep -E ':9627|:9628' || echo "nothing listening on 9627/9628"

echo
echo "=== pm2 ==="
if command -v pm2 >/dev/null; then
  pm2 status || true
  echo "--- pm2 logs (last 20) ---"
  pm2 logs mt5-quotes --lines 20 --nostream 2>/dev/null || echo "no mt5-quotes logs"
else
  echo "pm2 not installed"
fi

echo
echo "=== docker ==="
if command -v docker >/dev/null && docker ps -a --format '{{.Names}} {{.Status}}' 2>/dev/null | grep -i mt5; then
  docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -i mt5 || true
else
  echo "no mt5 docker container"
fi

echo
echo "=== systemd ==="
systemctl is-active mt5-quotes 2>/dev/null || echo "mt5-quotes service not active"

echo
echo "=== direct test (3s) ==="
timeout 3 node src/start-server.js 2>&1 || true
