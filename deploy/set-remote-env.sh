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

# วาง "KEY=ค่า" หรือ "export KEY=ค่า" มาทั้งบรรทัด → เหลือแต่ค่า · ตัดช่องว่างหัวท้าย
VAL="${VAL#export }"; VAL="${VAL#"$KEY"=}"
VAL="${VAL#"${VAL%%[![:space:]]*}"}"; VAL="${VAL%"${VAL##*[![:space:]]}"}"

# Gmail แสดง App Password เป็น 4 กลุ่มคั่นช่องว่าง แต่ต้องใช้แบบติดกัน 16 ตัว (เคยพังเพราะช่องว่าง)
[ "$KEY" = SMTP_PASS ] && VAL="${VAL// /}"

# คีย์ Gemini (AI Studio) = "AIza" + 35 ตัว — เคยวางของอื่นติดมาจน Google ตอบ 400 (2026-11-14)
# บอกแค่รูปร่าง ไม่แสดงค่า · คีย์รูปแบบอื่นที่แน่ใจว่าถูก ข้ามการตรวจด้วย HOP_FORCE=1
if [ "$KEY" = GEMINI_API_KEY ] && [ "${HOP_FORCE:-}" != 1 ] && ! [[ "$VAL" =~ ^AIza[0-9A-Za-z_-]{35}$ ]]; then
  ws=$([[ "$VAL" =~ [[:space:]] ]] && echo "มีช่องว่างอยู่ข้างใน" || echo "ไม่มีช่องว่าง")
  pre=$([[ "$VAL" == AIza* ]] && echo "ขึ้นต้นด้วย AIza" || echo "ไม่ได้ขึ้นต้นด้วย AIza")
  echo "❌ ไม่เหมือนคีย์ Gemini — ยาว ${#VAL} ตัว (ควรเป็น 39) · $pre · $ws"
  echo "   คัดลอกใหม่จาก https://aistudio.google.com/apikey ด้วยปุ่มคัดลอกข้างคีย์ แล้วรันคำสั่งนี้อีกครั้ง — ยังไม่ได้บันทึกอะไร"
  exit 1
fi

[ -n "$VAL" ] || { echo "❌ ค่าว่าง — ไม่ทำอะไร"; exit 1; }
[[ "$VAL" != *"'"* ]] || { echo "❌ ค่ามีเครื่องหมาย ' — ครอบใน .env ไม่ได้ ให้แก้ด้วย nano แทน"; exit 1; }
[[ "$VAL" != *$'\n'* ]] || { echo "❌ ค่ามีหลายบรรทัด — ถ้าเป็น JSON ให้ส่งเป็นไฟล์แทน"; exit 1; }

# '...' = compose อ่านตรงตัว (ไม่แปล $ และ \n) · printf เป็น builtin ค่าจึงไม่โผล่ใน ps
printf "%s='%s'\n" "$KEY" "$VAL" | ssh "$HOST" "$(cat deploy/merge-env.remote.sh)"
echo "ต่อไป: ssh $HOST 'cd ~/hop && ./deploy/deploy.sh --no-pull'"
