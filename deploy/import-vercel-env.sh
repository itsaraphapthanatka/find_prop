#!/usr/bin/env bash
# ดึง env (Production) จาก Vercel บน Mac → ใส่ใน ~/hop/deploy/.env บนเครื่อง edgexpert ผ่าน SSH
# ไม่แสดงค่าออกจอ ไม่เขียนลง repo — ไฟล์ชั่วคราวอยู่ใน mktemp (สิทธิ์ 700) และถูกลบทันทีเมื่อจบ
#   ./deploy/import-vercel-env.sh [ssh-host]    (ค่าเริ่ม ssh.appreview.cloud)
# ครั้งแรกต้องทำที่รากโปรเจกต์บน Mac: vercel login แล้ว vercel link (เลือกโปรเจกต์ของ hob-alpha.vercel.app)
# ค่าที่เป็นของเครื่อง (WEB_PORT, PUBLIC_APP_URL, ENABLE_CRON ฯลฯ) ไม่ถูกทับ · .env เดิมสำรองไว้เป็น .env.bak-<เวลา>
set -euo pipefail
HOST="${1:-ssh.appreview.cloud}"
cd "$(dirname "$0")/.."

command -v vercel >/dev/null || { echo "❌ ไม่พบ vercel CLI — brew install vercel-cli"; exit 1; }
# vercel link เก็บการผูกได้ 2 แบบ: project.json (ผูกโฟลเดอร์) หรือ repo.json (โหมด "linked by git")
# ไม่หยุดตรงนี้ — ให้ vercel env pull ตัดสินเอง (บางรุ่นของ CLI เขียน/ย้ายไฟล์ผูกเองระหว่างทำงาน)
if [ ! -f .vercel/project.json ] && [ ! -f .vercel/repo.json ]; then
  echo "⚠️ ไม่เห็นไฟล์ผูกโปรเจกต์ใน $(pwd)/.vercel — จะลองดึงต่อ (ถ้าไม่ได้ ให้รัน vercel link ที่โฟลเดอร์นี้)"
fi

TMP="$(mktemp -d)"
chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT

echo "▶ ดึง env (Production) จาก Vercel"
vercel env pull "$TMP/vercel.env" --environment=production --yes >/dev/null 2>"$TMP/err" \
  || { echo "❌ vercel env pull ไม่สำเร็จ (โฟลเดอร์: $(pwd)):"; tail -3 "$TMP/err"; ls -la .vercel 2>&1 | tail -3; exit 1; }
node deploy/vercel-env-to-compose.mjs "$TMP/vercel.env" deploy/.env.example > "$TMP/import.env"

echo "▶ ส่งเข้า ~/hop/deploy/.env บน $HOST"
REMOTE="$(cat deploy/merge-env.remote.sh)"
ssh "$HOST" "$REMOTE" < "$TMP/import.env"
echo "ต่อไป: ssh $HOST 'cd ~/hop && ./deploy/deploy.sh'"
