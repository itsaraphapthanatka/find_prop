#!/usr/bin/env bash
# หั่นวิดีโอเป็น HLS เข้ารหัส AES-128 ให้หน้า "วิดีโอสอนใช้งาน" ในแอป — รันบนเครื่อง edgexpert ในโฟลเดอร์ ~/hop
#   ./deploy/media-hls.sh ~/HOP-วิดีโอสอนใช้งาน/HOP-สอนใช้งานฉบับเต็ม_พากย์ใหม่.mp4
#   ./deploy/media-hls.sh --chapters-only    อัปเดตสารบัญจาก deploy/media/tutorial-chapters.json (ไม่หั่นวิดีโอใหม่)
# ผลลัพธ์ใน ~/hop-media/tutorial/: v<เวลา>/index.m3u8 + seg*.ts (เข้ารหัสทุกชิ้น) · current.json (ชี้รุ่นล่าสุด + สารบัญ)
# - ไฟล์ต้นฉบับ .mp4 ไม่ถูกคัดลอกไปที่ที่เว็บเสิร์ฟ · กุญแจอยู่ใน deploy/.env (MEDIA_HLS_KEY) เท่านั้น ไม่โผล่ในคำสั่ง/ps
# - ffmpeg รันในคอนเทนเนอร์ชั่วคราว (alpine) จำกัดแรม 1GB — ไม่ต้องลงโปรแกรมเพิ่ม ไม่แย่งแรมบริการอื่น
set -euo pipefail
cd "$(dirname "$0")"
NAME=tutorial
MEDIA_ENV="$( [ -f .env ] && grep -E '^HOP_MEDIA_DIR=' .env | tail -1 | cut -d= -f2- | tr -d "'\" " || true)"
MEDIA="$(realpath -m "${MEDIA_ENV:-../../hop-media}")"
OUT="$MEDIA/$NAME"
CHAPTERS="media/$NAME-chapters.json"
command -v python3 >/dev/null || { echo "❌ ต้องมี python3 บนเครื่อง"; exit 1; }

# เขียน current.json แบบสลับไฟล์ทีเดียว (คนที่กำลังดูไม่เห็นไฟล์ครึ่งๆ) · $1 = รุ่นใหม่ (ว่าง = คงเดิม) · $2 = ความยาว (วินาที)
write_current() {
  python3 - "$OUT/current.json" "$CHAPTERS" "${1:-}" "${2:-}" <<'PY'
import json, os, sys, time
cur_path, chap_path, ver, dur = sys.argv[1:5]
cur = {}
if os.path.exists(cur_path):
    with open(cur_path, encoding='utf-8') as f:
        cur = json.load(f)
with open(chap_path, encoding='utf-8') as f:
    chapters = json.load(f)
if ver:
    cur['playlist'] = f'{ver}/index.m3u8'
if dur:
    cur['duration'] = round(float(dur), 1)
if not cur.get('playlist'):
    sys.exit('❌ ยังไม่มีวิดีโอ — รันแบบใส่ไฟล์ .mp4 ก่อน')
cur['chapters'] = chapters
cur['updated'] = time.strftime('%Y-%m-%dT%H:%M:%S%z')
d = cur.get('duration')
late = [c['title'] for c in chapters if d and c['t'] >= d]
tmp = cur_path + '.tmp'
with open(tmp, 'w', encoding='utf-8') as f:
    json.dump(cur, f, ensure_ascii=False, indent=1)
os.chmod(tmp, 0o644)
os.replace(tmp, cur_path)
print(f"✅ current.json → {cur['playlist']} · สารบัญ {len(chapters)} บท")
if late:
    print(f"⚠️  บทที่เวลาเริ่มเกินความยาววิดีโอ ({d:.0f} วิ): {', '.join(late)} — แก้ {chap_path} แล้วรัน --chapters-only")
PY
}

if [ "${1:-}" = "--chapters-only" ]; then mkdir -p "$OUT"; write_current; exit 0; fi

SRC="$(realpath "${1:?ใช้: ./deploy/media-hls.sh <ไฟล์วิดีโอ.mp4>  หรือ  --chapters-only}")"
[ -f "$SRC" ] || { echo "❌ ไม่พบไฟล์ $SRC"; exit 1; }
[ -f .env ] || { echo "❌ ไม่พบ deploy/.env"; exit 1; }
mkdir -p "$OUT" 2>/dev/null || true
if [ ! -w "$OUT" ]; then
  # docker compose สร้างโฟลเดอร์ที่ต่อเข้าคอนเทนเนอร์ให้เองเป็นของ root (ถ้ายังไม่มีตอน up) — คืนสิทธิ์ด้วยคอนเทนเนอร์ชั่วคราว ไม่ต้อง sudo
  echo "▶ $MEDIA เป็นของ root — คืนสิทธิ์ให้ $(id -un)"
  docker run --rm -v "$MEDIA":/m alpine:3.22 chown -R "$(id -u):$(id -g)" /m
  mkdir -p "$OUT"
fi
[ -w "$OUT" ] || { echo "❌ เขียน $OUT ไม่ได้ — แก้ด้วย: sudo chown -R $(id -u):$(id -g) $MEDIA"; exit 1; }

# กุญแจ: ใช้ตัวเดิมถ้ามี (ชิ้นวิดีโอรุ่นก่อนที่ค้างในแคชยังเล่นได้) · ไม่มีก็สุ่มใหม่แล้วจดลง .env (สิทธิ์ 600)
KEY="$(grep -E '^MEDIA_HLS_KEY=' .env | tail -1 | cut -d= -f2- | tr -d "'\" " || true)"
NEWKEY=0
if ! [[ "$KEY" =~ ^[0-9a-fA-F]{32}$ ]]; then
  KEY="$(openssl rand -hex 16)"
  ( umask 077; { grep -v '^MEDIA_HLS_KEY=' .env; echo "MEDIA_HLS_KEY=$KEY"; } > .env.key-tmp )
  mv .env.key-tmp .env && chmod 600 .env
  NEWKEY=1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
chmod 700 "$TMP"
# printf เป็น builtin — กุญแจไม่โผล่ใน ps ของเครื่องที่ใช้ร่วมกับคนอื่น
printf '%b' "$(echo "$KEY" | sed 's/../\\x&/g')" > "$TMP/enc.key"
printf '/api/media-key?v=%s\n/k/enc.key\n%s\n' "$NAME" "$(openssl rand -hex 16)" > "$TMP/keyinfo"

VER="v$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT/$VER"
echo "▶ หั่นวิดีโอ → $OUT/$VER  (ffmpeg ในคอนเทนเนอร์ชั่วคราว · ไฟล์ยาวอาจใช้หลายนาที)"
docker run --rm --memory 1g --cpus 4 \
  -e SRC_NAME="$(basename "$SRC")" -e VER="$VER" -e OWNER="$(id -u):$(id -g)" \
  -v "$(dirname "$SRC")":/in:ro -v "$TMP":/k:ro -v "$OUT":/out \
  alpine:3.22 sh -euc '
    apk add --no-cache ffmpeg >/dev/null
    V=$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "/in/$SRC_NAME")
    A=$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of csv=p=0 "/in/$SRC_NAME")
    if [ "$V" = h264 ] && [ "$A" = aac ]; then
      CODEC="-c copy"; echo "  ภาพ/เสียงเดิม (h264/aac) เล่นบนเบราว์เซอร์ได้อยู่แล้ว — ไม่ต้องแปลง"
    else
      CODEC="-c:v libx264 -preset veryfast -crf 22 -pix_fmt yuv420p -c:a aac -b:a 128k"; echo "  แปลงเป็น h264/aac (ต้นฉบับ $V/$A)"
    fi
    ffmpeg -hide_banner -loglevel error -i "/in/$SRC_NAME" $CODEC -f hls -hls_time 6 -hls_playlist_type vod \
      -hls_key_info_file /k/keyinfo -hls_segment_filename "/out/$VER/seg%04d.ts" "/out/$VER/index.m3u8"
    ffprobe -v error -show_entries format=duration -of csv=p=0 "/in/$SRC_NAME" > "/out/$VER/.duration"
    chown -R "$OWNER" "/out/$VER"
  '

DUR="$(cat "$OUT/$VER/.duration")"
rm -f "$OUT/$VER/.duration"
SEGS="$(find "$OUT/$VER" -name 'seg*.ts' | wc -l)"
grep -q 'METHOD=AES-128' "$OUT/$VER/index.m3u8" || { echo "❌ playlist ไม่ได้เข้ารหัส — ยกเลิก"; rm -rf "${OUT:?}/$VER"; exit 1; }
write_current "$VER" "$DUR"
# เก็บแค่ 2 รุ่นล่าสุด (รุ่นก่อนหน้าไว้ให้คนที่เปิดค้างดูต่อจนจบ)
find "$OUT" -mindepth 1 -maxdepth 1 -type d -name 'v*' | sort | head -n -2 | xargs -r rm -rf
S="${DUR%.*}"
echo "✅ เสร็จ: $SEGS ชิ้น (เข้ารหัส AES-128) · ยาว $((S / 60)):$(printf '%02d' $((S % 60)))"
if [ "$NEWKEY" = 1 ]; then
  echo "ต่อไป: ./deploy/deploy.sh --no-pull   (สร้างกุญแจใหม่ — ให้ API รู้จักกุญแจ)"
fi
