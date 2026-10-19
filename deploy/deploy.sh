#!/usr/bin/env bash
# อัปเดต HOP บนเครื่อง edgexpert: ดึงโค้ด → pull image ของ commit นั้นจาก GitHub Actions → รันใหม่ → รอจนพร้อม
#   ./deploy/deploy.sh             ดึงโค้ดล่าสุดของ branch ปัจจุบัน แล้ว pull image ที่ CI build ให้
#   ./deploy/deploy.sh --no-pull   ใช้โค้ดที่อยู่ในเครื่องตอนนี้ (เช่น หลังแก้ deploy/.env)
#   ./deploy/deploy.sh --build     build image ในเครื่องเอง (สำรอง — ต้องมีแรมว่าง ≥ 4GB: free -h)
set -euo pipefail
cd "$(dirname "$0")"

PULL_GIT=1
MODE=pull
for arg in "$@"; do
  case "$arg" in
    --no-pull) PULL_GIT=0 ;;
    --build) MODE=build ;;
    *) echo "ไม่รู้จักตัวเลือก: $arg"; exit 2 ;;
  esac
done

if [ ! -f .env ]; then
  echo "❌ ไม่พบ deploy/.env — คัดลอกจาก .env.example แล้วกรอกค่าก่อน"
  exit 1
fi
if [ "$PULL_GIT" = 1 ]; then
  git -C .. pull --ff-only
fi

export GIT_SHA HOP_TAG
GIT_SHA="$(git -C .. rev-parse HEAD)"
HOP_TAG="$GIT_SHA"

if [ "$MODE" = build ]; then
  echo "▶ build ในเครื่อง commit ${GIT_SHA:0:7}"
  docker compose -f docker-compose.yml -f docker-compose.build.yml build --pull api web
else
  echo "▶ รอ image ของ commit ${GIT_SHA:0:7} จาก GitHub Actions (สูงสุด 15 นาที)"
  for i in $(seq 1 90); do
    if out="$(docker compose pull --quiet api web 2>&1)"; then
      break
    fi
    if echo "$out" | grep -qiE 'unauthorized|denied|authentication required'; then
      echo "❌ ดึง image ไม่ได้ (ไม่มีสิทธิ์) — ตั้ง package hop-api / hop-web บน GitHub เป็น Public"
      echo "   หรือ docker login ghcr.io (ดู docs/DEPLOY-EDGEXPERT.md)"
      exit 1
    fi
    if [ "$i" = 90 ]; then
      echo "❌ ยังไม่มี image ของ commit นี้ — ดูสถานะที่ GitHub → Actions → Deploy images"
      echo "$out" | tail -3
      exit 1
    fi
    sleep 10
  done
fi

# จดแท็กที่ deploy ไว้ใน .env — คำสั่ง docker compose ที่พิมพ์เองภายหลังจะใช้ image ตัวเดียวกัน (ไม่หลุดไปหาแท็กอื่น)
umask 077
{ grep -v '^HOP_TAG=' .env; echo "HOP_TAG=$HOP_TAG"; } > .env.tag-tmp && mv .env.tag-tmp .env && chmod 600 .env

docker compose up -d --no-build --remove-orphans
docker image prune -f >/dev/null

WEB_PORT="$(grep -E '^WEB_PORT=' .env | tail -1 | cut -d= -f2 | tr -d "'\" ")"
WEB_PORT="${WEB_PORT:-8098}"
for _ in $(seq 1 45); do
  if curl -fsS "http://127.0.0.1:${WEB_PORT}/healthz" >/dev/null 2>&1; then
    echo "✅ พร้อมใช้งาน (commit ${GIT_SHA:0:7})"
    docker compose ps
    exit 0
  fi
  sleep 2
done
echo "❌ ยังไม่พร้อมใน 90 วินาที — ดู log: docker compose -f deploy/docker-compose.yml logs --tail=100"
docker compose ps
exit 1
