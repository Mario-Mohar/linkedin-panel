#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "[sync] pull…"; git pull --rebase --autostash || { echo "[sync] pull fehlgeschlagen"; exit 1; }
echo "[sync] collect…"; npm run --silent collect || true
if [ -n "$(git status --porcelain data)" ]; then
  git add data/
  git commit -q -m "data: collect $(date -u +%FT%TZ) [$(hostname)]"
  echo "[sync] push…"; git push || { echo "[sync] push fehlgeschlagen — später erneut"; exit 1; }
  echo "[sync] fertig."
else
  echo "[sync] keine Datenänderung."
fi
