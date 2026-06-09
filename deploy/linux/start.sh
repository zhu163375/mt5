#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/deploy/linux"

docker compose up -d --build
sleep 2
curl -s "http://127.0.0.1:9528/health" || true
echo
echo "Linux quote API: http://<server-ip>:9528/"
echo "Next: run Python bridge on Windows and set MT5_TCP_HOST=<linux-server-ip>"
