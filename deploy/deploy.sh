#!/usr/bin/env bash
# อัปเดต HOP บนเครื่อง msi-edgexpert-04dc: ดึงโค้ดล่าสุด → build → รันใหม่ → รอจนพร้อม
#   ./deploy/deploy.sh            (ดึงจาก branch ปัจจุบัน)
#   ./deploy/deploy.sh --no-pull  (build จากโค้ดที่อยู่ในเครื่องตอนนี้)
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "❌ ไม่พบ deploy/.env — คัดลอกจาก .env.example แล้วกรอกค่าก่อน"
  exit 1
fi
if [ "${1:-}" != "--no-pull" ]; then
  git -C .. pull --ff-only
fi

export GIT_SHA
GIT_SHA="$(git -C .. rev-parse HEAD)"
echo "▶ build commit ${GIT_SHA:0:7}"

docker compose build --pull
docker compose up -d --remove-orphans
docker image prune -f >/dev/null

WEB_PORT="$(grep -E '^WEB_PORT=' .env | tail -1 | cut -d= -f2 | tr -d "'\" ")"
WEB_PORT="${WEB_PORT:-8080}"
for _ in $(seq 1 45); do
  if curl -fsS "http://127.0.0.1:${WEB_PORT}/healthz" >/dev/null 2>&1; then
    echo "✅ พร้อมใช้งาน"
    docker compose ps
    exit 0
  fi
  sleep 2
done
echo "❌ ยังไม่พร้อมใน 90 วินาที — ดู log: docker compose -f deploy/docker-compose.yml logs --tail=100"
docker compose ps
exit 1
