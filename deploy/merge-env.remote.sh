# รันบนเครื่อง edgexpert ผ่าน ssh (สคริปต์ฝั่ง Mac ส่งข้อความนี้เป็นคำสั่ง และส่งค่าทาง stdin — ค่าไม่โผล่ใน ps)
# รวมบรรทัด KEY=value จาก stdin เข้า ~/hop/deploy/.env: มีอยู่แล้ว = แทนที่ · ยังไม่มี = เพิ่มท้าย · สำรองไฟล์เดิมเป็น .env.bak-<เวลา>
# ใช้โดย deploy/import-vercel-env.sh และ deploy/set-remote-env.sh
set -e
cd ~/hop/deploy
[ -f .env ] || { echo "❌ ไม่พบ ~/hop/deploy/.env — cp .env.example .env ก่อน"; exit 1; }
umask 077
cat > .env.import
BAK=".env.bak-$(date +%Y%m%d-%H%M%S)"
cp .env "$BAK" && chmod 600 "$BAK"
awk 'NR==FNR { i = index($0, "="); if (i > 1) v[substr($0, 1, i - 1)] = substr($0, i + 1); next }
     { if (match($0, /^[A-Z0-9_]+=/)) { k = substr($0, 1, RLENGTH - 1); if (k in v) { print k "=" v[k]; done[k] = 1; next } } print }
     END { for (k in v) if (!(k in done)) print k "=" v[k] }' .env.import .env > .env.new
mv .env.new .env
chmod 600 .env
KEYS="$(cut -d= -f1 .env.import | tr '\n' ' ')"
rm -f .env.import
ls -t .env.bak-* 2>/dev/null | tail -n +6 | xargs -r rm -f   # เก็บไฟล์สำรองล่าสุด 5 ไฟล์
echo "✅ อัปเดต .env แล้ว: $KEYS(ของเดิมสำรองไว้ที่ deploy/$BAK)"
