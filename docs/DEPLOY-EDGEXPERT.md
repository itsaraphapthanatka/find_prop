# ย้าย HOP จาก Vercel ไปเครื่อง EdgeXpert

> โดเมนใหม่ **hopai.online** (ผูก Cloudflare แล้ว) · เครื่อง MSI EdgeXpert ชื่อ `edgexpert-1346` (NVIDIA GB10, **ARM64**, Ubuntu 24.04) เข้าผ่าน `ssh ssh.appreview.cloud`
> ⚠️ เครื่องนี้**ใช้ร่วมกับบริการอื่นราว 45 คอนเทนเนอร์** (jkpprop, appreview, lawyer, panpay ฯลฯ) — ห้ามแตะของคนอื่น: ไม่แก้ `/etc/cloudflared`, ไม่รีสตาร์ท cloudflared/Docker, ไม่ `docker system prune`
> ข้อมูลทั้งหมดยังอยู่ที่ Supabase เหมือนเดิม — ย้ายแค่ "เว็บ + API" เครื่องนี้ไม่มีข้อมูลที่ต้องสำรองนอกจาก `deploy/.env`

## ภาพรวม

```
ผู้ใช้ ─HTTPS─▶ Cloudflare (hopai.online) ─tunnel─▶ cloudflared (hop) ─▶ Caddy ─┬─▶ ไฟล์เว็บ (dist)
                                                                            ├─▶ /api/* → server/index.mjs :3000 (api/*.js เดิม)
แอปตัวเก่า ─▶ hob-alpha.vercel.app ─(ส่งต่อ)──────────────────────────────────┘    └─▶ /geo, /llms.txt → geo.appreview.cloud
```

- **ไม่ต้องเปิดพอร์ตเราเตอร์ / ไม่ต้องมี IP จริง** เพราะ cloudflared ต่อออกไปหา Cloudflare เอง — HOP มี tunnel ของตัวเอง แยกจาก tunnel เดิมของเครื่อง
- **ไม่ build บนเครื่อง:** แรมเครื่องถูก vLLM (`aunjai-vllm`) จองไว้เกือบหมด (เหลือว่างราว 2GB) — GitHub Actions build image ARM64 ให้ (`.github/workflows/deploy-images.yml`) เครื่องแค่ pull · แต่ละคอนเทนเนอร์จำกัดแรมไว้ (รวม ≤ 900MB ใช้จริงราว 150MB)
- `server/index.mjs` โหลด `api/*.js` ตัวเดิมโดยไม่แก้โค้ด (เลียนแบบ Vercel) และยิง push-cron เองทุกวันตอน 07:00 เวลาไทย
- `deploy/Caddyfile` แปลงกฎ redirect/rewrite/header จาก `vercel.json` มาครบ → ตรวจด้วย `npm run test:server`
- Vercel ยังเก็บไว้เป็น **ตัวส่งต่อ** (`deploy/vercel-forwarder`) เพราะแอปที่ติดตั้งไว้แล้วยังเรียก `hob-alpha.vercel.app`

| ไฟล์ | หน้าที่ |
|---|---|
| `server/index.mjs` + `server/package.json` | API server แทน Vercel Functions (ใช้แค่ stripe + nodemailer) |
| `deploy/docker-compose.yml` | 3 คอนเทนเนอร์: `api`, `web` (Caddy + dist), `tunnel` (cloudflared) |
| `deploy/api.Dockerfile`, `deploy/web.Dockerfile` | สูตร image (ARM64 ได้ทุกตัว) |
| `.github/workflows/deploy-images.yml` | build + push `ghcr.io/itsaraphapthanatka/hop-api` / `hop-web` ทุก commit ของ main และ deploy/edgexpert |
| `deploy/Caddyfile` | เสิร์ฟเว็บ + กฎจาก vercel.json + ส่งต่อ /api |
| `deploy/.env.example` | รายการค่าลับที่ต้องกรอก (คัดลอกเป็น `deploy/.env`) |
| `deploy/deploy.sh` | อัปเดต: ดึงโค้ด → รอ/pull image ของ commit นั้น → รันใหม่ → รอจนพร้อม |
| `deploy/vercel-forwarder/` | ใช้ตอนย้ายจริง — Vercel ส่งต่อไป hopai.online |

---

## ขั้นที่ 1 — เตรียมโค้ด ✅ (เสร็จแล้วใน branch `deploy/edgexpert`)

ยัง **ไม่ merge เข้า main** จนถึงขั้นที่ 4 — เพราะ bundle ใหม่ให้แอปมือถือเรียก `https://hopai.online` ถ้าขึ้น Vercel ก่อนเครื่องพร้อม แอปจะเรียก API ไม่ได้

---

## ขั้นที่ 2 — ติดตั้งบนเครื่อง (ทดสอบที่ staging.hopai.online)

### 2.1 เข้าเครื่อง

จาก Mac (ตั้งค่าไว้แล้วใน `~/.ssh/config` — ผ่าน Cloudflare Access):

```bash
ssh ssh.appreview.cloud
```

Docker 29 + Compose v5 มีแล้ว ผู้ใช้ `aistudiofebc` อยู่กลุ่ม `docker` แล้ว ไม่ต้องติดตั้งอะไรเพิ่ม

### 2.2 ดึงโค้ด

```bash
git clone https://github.com/itsaraphapthanatka/find_prop.git ~/hop
cd ~/hop && git switch deploy/edgexpert
```

### 2.3 เปิดให้เครื่องดึง image ได้ (ทำครั้งเดียว)

หลัง push ครั้งแรก GitHub Actions (แท็บ **Actions → Deploy images**) จะสร้าง package `hop-api` และ `hop-web`
ถ้า `deploy.sh` แจ้งว่า "ไม่มีสิทธิ์" ให้เปิดเป็น Public — ใน image ไม่มีค่าลับ (ค่าลับอยู่ใน `deploy/.env` บนเครื่องเท่านั้น) และโค้ดก็อยู่ใน repo สาธารณะอยู่แล้ว:

GitHub → โปรไฟล์ → **Packages** → `hop-api` → **Package settings** → Danger Zone → **Change visibility → Public** (ทำซ้ำกับ `hop-web`)

### 2.4 สร้าง Cloudflare Tunnel ของ HOP

tunnel เดิมของเครื่อง (`/etc/cloudflared/config.yml`) ตั้งค่าแบบไฟล์ และเว็บอื่นใช้ร่วมกันอยู่ — ถ้าเพิ่มโดเมนต้องแก้ไฟล์แล้วรีสตาร์ท ซึ่งทำให้เว็บอื่นสะดุด จึงสร้าง tunnel แยกให้ HOP (จัดการจากแดชบอร์ด เพิ่มโดเมนทีหลังไม่ต้องรีสตาร์ทอะไร):

1. Cloudflare → **Zero Trust** → **Networks** → **Tunnels** → **Create a tunnel** → **Cloudflared**
2. ตั้งชื่อ `hop` → หน้าติดตั้งเลือก **Docker** → คัดลอก **โทเคน** (ข้อความยาวหลัง `--token`) — ไม่ต้องรันคำสั่งที่หน้านั้น compose รันให้
3. **Public Hostname** → Add: Subdomain `staging` · Domain `hopai.online` · Service Type `HTTP` · URL `web:8080`

> ⚠️ โทเคนนี้คือกุญแจเข้าเว็บ — ใส่ใน `deploy/.env` บนเครื่องเท่านั้น อย่าวางในแชต/ส่งให้ใคร

### 2.5 กรอกค่าลับ

```bash
cp deploy/.env.example deploy/.env
nano deploy/.env
chmod 600 deploy/.env
```

- ค่าส่วนใหญ่ใช้ชุดเดียวกับ **Vercel → Settings → Environment Variables (Production)**
- ตัวที่ Vercel ตั้งเป็น *Sensitive* จะเปิดดูไม่ได้ ให้เอาจากต้นทาง: Supabase (service role) · Stripe (secret key — ถ้าไม่ได้เก็บไว้ ให้สร้างคีย์ใหม่ได้ คีย์เดิมยังใช้ได้คู่กัน · webhook secret เปิดดูได้เสมอ) · Gmail App Password (สร้างใหม่ได้)
- `CRON_SECRET` สุ่มใหม่ได้: `openssl rand -hex 32`
- `COMPOSE_PROFILES=tunnel` + `CLOUDFLARE_TUNNEL_TOKEN=<โทเคนจากข้อ 2.4>` · `WEB_PORT=8098` (8080/3000 มีบริการอื่นใช้แล้ว — เช็คว่าว่าง: `ss -ltn | grep :8098` ต้องไม่มีผลลัพธ์)
- **ช่วงทดสอบ:** `PUBLIC_APP_URL=https://staging.hopai.online` · `INVITE_WEB_BASE=https://staging.hopai.online` · `ENABLE_CRON=0` (Vercel ยังยิง cron อยู่ กันแจ้งเตือนซ้ำ)

### 2.6 รัน

```bash
./deploy/deploy.sh --no-pull
```

สคริปต์รอ image ของ commit ที่ checkout อยู่จาก GitHub Actions (ปกติ 3–6 นาทีหลัง push) แล้วรัน — รอขึ้น `✅ พร้อมใช้งาน`
ดู log: `docker compose -f deploy/docker-compose.yml logs -f --tail=100`

> ⚠️ **ห้ามใช้ `--build` บนเครื่องนี้** เว้นแต่ `free -h` ช่อง available เหลือ ≥ 4GB — แรมถูก vLLM จองไว้ build เว็บอาจทำให้ระบบฆ่าโปรเซสใหญ่ (อาจเป็นบริการของคนอื่น)

### 2.7 เช็คลิสต์ทดสอบที่ https://staging.hopai.online

ก่อนทดสอบ ให้ทำข้อ 3.1 (เพิ่ม Redirect URL ใน Supabase) ก่อน ไม่งั้นล็อกอิน Google จะเด้งกลับโดเมนเก่า

- [ ] `curl -s https://staging.hopai.online/healthz` ได้ `{"ok":true,...}`
- [ ] ล็อกอินอีเมล + Google ได้ · เห็นรายการทรัพย์ แผนที่ รูปภาพ
- [ ] เพิ่ม/แก้ทรัพย์ อัปรูปได้ · ผู้ช่วย AI ตอบได้
- [ ] เชิญลูกทีม → ลิงก์ในอีเมลขึ้นต้นด้วย staging.hopai.online
- [ ] หน้า `/docs/training`, `/stats`, `/guide.html`, `/Guide.html` (ต้องเด้งไปตัวเล็ก), `/geo`
- [ ] `curl -s https://staging.hopai.online/app-update.json` ได้ JSON ที่มี `version` ตรงกับ commit
- [ ] ชำระเงิน: **กดอัปเกรดแค่ให้ขึ้นหน้า Stripe แล้วกดย้อนกลับ** (ใช้คีย์ Live — ห้ามจ่ายจริงบน staging)
- [ ] `docker compose -f deploy/docker-compose.yml restart` → เว็บกลับมาเอง (ไม่ต้องรีบูตทั้งเครื่อง — บริการอื่นใช้อยู่ · `restart: unless-stopped` ทำให้กลับมาเองหลังเครื่องรีบูตอยู่แล้ว)

---

## ขั้นที่ 3 — เตรียมบริการภายนอก (ทำก่อนวันย้าย)

1. **Supabase** → Authentication → URL Configuration → **Redirect URLs** เพิ่ม `https://hopai.online/**` และ `https://staging.hopai.online/**` (ของเดิมเก็บไว้ก่อน)
2. **Cloudflare** (โดเมน hopai.online):
   - **Bot Fight Mode ต้องปิด** (Security → Bots) — ไม่งั้นอาจบล็อก webhook ของ Stripe, คำขอจากแอปมือถือ และคำขอที่ Vercel ส่งต่อมา
   - SSL/TLS → Edge Certificates → เปิด **Always Use HTTPS**
   - เปิด **Web Analytics** (แทน Vercel Analytics ไม่ต้องแก้โค้ด)
3. **Google OAuth** — ปกติไม่ต้องแก้ (callback ยังเป็นของ Supabase) ถ้า OAuth consent screen มีรายการ Authorized domains ให้เพิ่ม `hopai.online`
4. **Uptime monitor** (เช่น UptimeRobot / Better Stack ฟรี) → ยิง `https://staging.hopai.online/healthz` ทุก 5 นาที แจ้งเตือนทางอีเมล — วันย้ายค่อยเปลี่ยนเป็นโดเมนหลัก

---

## ขั้นที่ 4 — ย้ายจริง (ประมาณ 30 นาที เลือกช่วงคนใช้น้อย)

ลำดับสำคัญ — ทำตามนี้ทีละข้อ:

1. **Cloudflare DNS** → ลบ record `A`/`AAAA`/`CNAME` เดิมของ `hopai.online` และ `www` (ถ้ามี)
2. **Tunnel `hop` → Public Hostname** เพิ่ม `hopai.online` และ `www` → `HTTP` `web:8080` (ไม่ต้องรีสตาร์ทอะไร)
3. บนเครื่อง แก้ `deploy/.env`: `PUBLIC_APP_URL=https://hopai.online` · `INVITE_WEB_BASE=https://hopai.online` · `ENABLE_CRON=1` → `./deploy/deploy.sh --no-pull`
4. เปิด https://hopai.online ทดสอบล็อกอินให้ผ่าน
5. **Supabase** → URL Configuration → **Site URL** = `https://hopai.online`
6. **Stripe (Live)** → Developers → Webhooks → endpoint เดิม → **แก้ URL** เป็น `https://hopai.online/api/stripe-webhook` (แก้ URL อย่างเดียว ความลับเดิมยังใช้ได้ ไม่ต้องเปลี่ยน `STRIPE_WEBHOOK_SECRET`)
7. **merge `deploy/edgexpert` → main** แล้วบนเครื่อง: `git switch main && ./deploy/deploy.sh`
   — CI build image ของ main ให้ และ build APK ใหม่ที่ชี้ hopai.online อัตโนมัติ
8. **Vercel** → Settings → Build and Deployment → **Root Directory** = `deploy/vercel-forwarder` · Framework Preset = **Other** · ไม่ต้องมี Build Command → **Redeploy**
9. ตรวจตัวส่งต่อ:
   - `curl -sI https://hob-alpha.vercel.app/guide.html` → `308` ไป `https://hopai.online/guide.html`
   - `curl -s https://hob-alpha.vercel.app/app-update.json` → JSON จากเครื่องใหม่ (version = commit ล่าสุด)
   - หน้า Vercel → Settings → Cron Jobs ต้องว่าง (ไม่งั้นแจ้งเตือนซ้ำ)
10. แจ้งทีม: **ผู้ใช้เว็บต้องล็อกอินใหม่หนึ่งครั้ง** (โดเมนใหม่ = ที่เก็บข้อมูลเบราว์เซอร์ใหม่) · แอปมือถือไม่ต้องล็อกอินใหม่ อัปเดตตัวเองตอนเปิดแอปครั้งถัดไป
11. เปลี่ยน uptime monitor เป็น `https://hopai.online/healthz`

### ถ้ามีปัญหา — ถอยกลับ

- Vercel → Root Directory กลับเป็นค่าว่าง (รากโปรเจกต์) → Redeploy → `hob-alpha.vercel.app` กลับมาเป็นเว็บเต็มเหมือนเดิม
- Stripe webhook URL กลับเป็น `https://hob-alpha.vercel.app/api/stripe-webhook` · Supabase Site URL กลับ
- แอปที่ได้ bundle ใหม่แล้วจะเรียก hopai.online — ถ้าเครื่องเสียนาน ให้เพิ่มโดเมน `hopai.online` ในโปรเจกต์ Vercel แล้วเปลี่ยน DNS ใน Cloudflare เป็น CNAME ไปที่ Vercel ชั่วคราว

---

## ขั้นที่ 5 — หลังย้าย

- **ไฟดับ/เน็ตหลุด = เว็บล่ม (พร้อมเว็บอื่นในเครื่อง)** → ควรมี **UPS** และ BIOS ตั้งให้เปิดเครื่องเองเมื่อไฟกลับ (Restore on AC power loss = Power On)
- **อัปเดตเว็บ:** push เข้า main แล้วบนเครื่องรัน `./deploy/deploy.sh` (รอ CI build เสร็จให้เอง) · อยากให้อัตโนมัติ ค่อยตั้ง cron บนเครื่องภายหลัง
- เก็บสำเนา `deploy/.env` ไว้ในที่ปลอดภัย (เช่น password manager) — เป็นสิ่งเดียวที่ต้องสำรองจากเครื่องนี้
- **ห้ามลบโปรเจกต์ Vercel** จนกว่าแอปทุกเครื่องอัปเดตแล้ว (ดูจาก Vercel → Logs ว่าไม่มีคำขอ `/api/*` เข้ามาอีกหลายสัปดาห์)

## ขั้นที่ 6 (ทางเลือก) — AI ในเครื่อง

เครื่องมี vLLM / llama-server / LiteLLM รันอยู่แล้ว — ตั้ง `AI_API_URL` ให้ชี้เซิร์ฟเวอร์โมเดลในเครื่องได้ จะไม่เสียค่า API ภายนอก · ทำแยกหลังย้ายเสร็จและนิ่งแล้ว (ต้องเช็คก่อนว่าโมเดลที่มีอ่านรูป/ตอบไทยได้ดีพอ)

---

## คำสั่งที่ใช้บ่อย (บนเครื่อง ในโฟลเดอร์ `~/hop`)

```bash
./deploy/deploy.sh                                        # ดึงโค้ดล่าสุด + pull image + รันใหม่
docker compose -f deploy/docker-compose.yml ps            # สถานะ (เฉพาะของ HOP)
docker compose -f deploy/docker-compose.yml logs -f api   # log ของ API
docker compose -f deploy/docker-compose.yml restart       # รีสตาร์ทเฉพาะ HOP
docker stats --no-stream hop-api-1 hop-web-1 hop-tunnel-1 # แรม/CPU ที่ HOP ใช้
curl -s http://127.0.0.1:8098/healthz                     # เช็คในเครื่อง (ไม่ผ่าน Cloudflare)
```

ทดสอบส่งแจ้งเตือน: `curl "https://hopai.online/api/push-cron?test=1" -H "Authorization: Bearer <CRON_SECRET>"` (พิมพ์ค่าเองบนเครื่อง อย่าวางในแชต)
