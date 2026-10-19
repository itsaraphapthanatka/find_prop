#!/usr/bin/env bash
# ตั้งค่าใน ~/hop/deploy/.env บนเครื่อง edgexpert ทีละตัว จาก Mac — ไม่แสดงค่าออกจอ ไม่ใส่ค่าในคำสั่ง (ส่งทาง stdin ของ ssh)
#   ./deploy/set-remote-env.sh SMTP_PASS                                  พิมพ์ค่าเอง (ตัวอักษรไม่แสดง)
#   ./deploy/set-remote-env.sh FCM_SERVICE_ACCOUNT ~/Downloads/key.json   อ่านจากไฟล์ (JSON ย่อเป็นบรรทัดเดียวให้)
#   ./deploy/set-remote-env.sh CRON_SECRET --random                       สุ่มค่าใหม่ 64 ตัวอักษร
# เครื่องปลายทางเปลี่ยนได้ด้วย HOP_HOST=... (ค่าเริ่ม ssh.appreview.cloud) · มีผลหลังรัน deploy.sh --no-pull
set -euo pipefail
cd "$(dirname "$0")/.."
KEY="${1:-}"
SRC="${2:-}"
HOST="${HOP_HOST:-ssh.appreview.cloud}"
[[ "$KEY" =~ ^[A-Z][A-Z0-9_]*$ ]] || { echo "ใช้: ./deploy/set-remote-env.sh <ชื่อค่า> [ไฟล์ | --random]"; exit 2; }

if [ "$SRC" = "--random" ]; then
  VAL="$(openssl rand -hex 32)"
elif [ -n "$SRC" ]; then
  [ -f "$SRC" ] || { echo "❌ ไม่พบไฟล์ $SRC"; exit 1; }
  VAL="$(node -e 'const t=require("fs").readFileSync(process.argv[1],"utf8");try{process.stdout.write(JSON.stringify(JSON.parse(t)))}catch{process.stdout.write(t.replace(/\r?\n$/,""))}' "$SRC")"
else
  read -r -s -p "ค่าของ $KEY (พิมพ์แล้วไม่แสดง แล้วกด Enter): " VAL
  echo
fi

# Gmail แสดง App Password เป็น 4 กลุ่มคั่นช่องว่าง แต่ต้องใช้แบบติดกัน 16 ตัว (เคยพังเพราะช่องว่าง)
[ "$KEY" = SMTP_PASS ] && VAL="${VAL// /}"

[ -n "$VAL" ] || { echo "❌ ค่าว่าง — ไม่ทำอะไร"; exit 1; }
[[ "$VAL" != *"'"* ]] || { echo "❌ ค่ามีเครื่องหมาย ' — ครอบใน .env ไม่ได้ ให้แก้ด้วย nano แทน"; exit 1; }
[[ "$VAL" != *$'\n'* ]] || { echo "❌ ค่ามีหลายบรรทัด — ถ้าเป็น JSON ให้ส่งเป็นไฟล์แทน"; exit 1; }

# '...' = compose อ่านตรงตัว (ไม่แปล $ และ \n) · printf เป็น builtin ค่าจึงไม่โผล่ใน ps
printf "%s='%s'\n" "$KEY" "$VAL" | ssh "$HOST" "$(cat deploy/merge-env.remote.sh)"
echo "ต่อไป: ssh $HOST 'cd ~/hop && ./deploy/deploy.sh --no-pull'"
