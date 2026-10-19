# ย้าย HOP จาก Vercel ไปเครื่อง msi-edgexpert-04dc

> โดเมนใหม่ **hopai.online** (ผูก Cloudflare แล้ว) · เครื่อง MSI EdgeXpert (NVIDIA GB10, **ARM64**, DGX OS/Ubuntu)
> ข้อมูลทั้งหมดยังอยู่ที่ Supabase เหมือนเดิม — ย้ายแค่ "เว็บ + API" เครื่องนี้ไม่มีข้อมูลที่ต้องสำรองนอกจาก `deploy/.env`

## ภาพรวม

```
ผู้ใช้ ─HTTPS─▶ Cloudflare (hopai.online) ─tunnel─▶ cloudflared ─▶ Caddy :8080 ─┬─▶ ไฟล์เว็บ (dist)
                                                                            ├─▶ /api/* → server/index.mjs :3000 (api/*.js เดิม)
แอปตัวเก่า ─▶ hob-alpha.vercel.app ─(ส่งต่อ)──────────────────────────────────┘    └─▶ /geo, /llms.txt → geo.appreview.cloud
```

- **ไม่ต้องเปิดพอร์ตเราเตอร์ / ไม่ต้องมี IP จริง** เพราะ cloudflared ต่อออกไปหา Cloudflare เอง
- `server/index.mjs` โหลด `api/*.js` ตัวเดิมโดยไม่แก้โค้ด (เลียนแบบ Vercel) และยิง push-cron เองทุกวันตอน 07:00 เวลาไทย
- `deploy/Caddyfile` แปลงกฎ redirect/rewrite/header จาก `vercel.json` มาครบ → ตรวจด้วย `npm run test:server`
- Vercel ยังเก็บไว้เป็น **ตัวส่งต่อ** (`deploy/vercel-forwarder`) เพราะแอปที่ติดตั้งไว้แล้วยังเรียก `hob-alpha.vercel.app`

| ไฟล์ | หน้าที่ |
|---|---|
| `server/index.mjs` + `server/package.json` | API server แทน Vercel Functions (ใช้แค่ stripe + nodemailer) |
| `deploy/docker-compose.yml` | 3 คอนเทนเนอร์: `api`, `web` (Caddy + dist), `tunnel` (cloudflared) |
| `deploy/api.Dockerfile`, `deploy/web.Dockerfile` | build image (ARM64 ได้ทุกตัว) |
| `deploy/Caddyfile` | เสิร์ฟเว็บ + กฎจาก vercel.json + ส่งต่อ /api |
| `deploy/.env.example` | รายการค่าลับที่ต้องกรอก (คัดลอกเป็น `deploy/.env`) |
| `deploy/deploy.sh` | อัปเดต: ดึงโค้ด → build → รันใหม่ → รอจนพร้อม |
| `deploy/vercel-forwarder/` | ใช้ตอนย้ายจริง — Vercel ส่งต่อไป hopai.online |

---

## ขั้นที่ 1 — เตรียมโค้ด ✅ (เสร็จแล้วใน branch `deploy/edgexpert`)

ยัง **ไม่ merge เข้า main** จนถึงขั้นที่ 4 — เพราะ bundle ใหม่ให้แอปมือถือเรียก `https://hopai.online` ถ้าขึ้น Vercel ก่อนเครื่องพร้อม แอปจะเรียก API ไม่ได้

---

## ขั้นที่ 2 — ติดตั้งบนเครื่อง (ทดสอบที่ staging.hopai.online)

### 2.1 เข้าเครื่อง

นั่งหน้าเครื่องเลยก็ได้ หรือ SSH จาก Mac — ถ้าอยู่วงแลนเดียวกันลอง `ssh <ชื่อผู้ใช้>@msi-edgexpert-04dc.local`
ถ้าต้องดูแลจากนอกบ้าน/ออฟฟิศ แนะนำ **Tailscale** (ฟรี ไม่ต้องเปิดพอร์ต):

```bash
# บนเครื่อง EdgeXpert
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --ssh
```

แล้วลงแอป Tailscale บน Mac ล็อกอินบัญชีเดียวกัน → `ssh <ชื่อผู้ใช้>@msi-edgexpert-04dc`

### 2.2 ตรวจ Docker (DGX OS มักติดตั้งมาให้แล้ว)

```bash
docker --version && docker compose version
```

ถ้ายังไม่มี:

```bash
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git curl
sudo usermod -aG docker $USER   # แล้วออก-เข้าระบบใหม่หนึ่งครั้ง
sudo systemctl enable --now docker   # ให้ Docker เปิดเองหลังรีบูต
```

### 2.3 ดึงโค้ด

```bash
git clone https://github.com/itsaraphapthanatka/find_prop.git ~/hop
cd ~/hop && git switch deploy/edgexpert
```

### 2.4 สร้าง Cloudflare Tunnel

1. Cloudflare → **Zero Trust** → **Networks** → **Tunnels** → **Create a tunnel** → เลือก **Cloudflared**
2. ตั้งชื่อ `hop-edgexpert` → หน้าติดตั้งเลือก **Docker** → คัดลอก **โทเคน** (ข้อความยาวหลัง `--token`) — ไม่ต้องรันคำสั่งที่หน้านั้น compose รันให้แล้ว
3. แท็บ **Public Hostname** → Add:
   - Subdomain `staging` · Domain `hopai.online`
   - Service Type `HTTP` · URL `web:8080`

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
- **ช่วงทดสอบ:** `PUBLIC_APP_URL=https://staging.hopai.online` · `INVITE_WEB_BASE=https://staging.hopai.online` · `ENABLE_CRON=0` (Vercel ยังยิง cron อยู่ กันแจ้งเตือนซ้ำ)

### 2.6 รัน

```bash
./deploy/deploy.sh --no-pull
```

รอขึ้น `✅ พร้อมใช้งาน` (ครั้งแรกนานหน่อยเพราะ build เว็บ) · ดู log: `docker compose -f deploy/docker-compose.yml logs -f --tail=100`

### 2.7 เช็คลิสต์ทดสอบที่ https://staging.hopai.online

ก่อนทดสอบ ให้ทำข้อ 3.1 (เพิ่ม Redirect URL ใน Supabase) ก่อน ไม่งั้นล็อกอิน Google จะเด้งกลับโดเมนเก่า

- [ ] `curl -s https://staging.hopai.online/healthz` ได้ `{"ok":true,...}`
- [ ] ล็อกอินอีเมล + Google ได้ · เห็นรายการทรัพย์ แผนที่ รูปภาพ
- [ ] เพิ่ม/แก้ทรัพย์ อัปรูปได้ · ผู้ช่วย AI ตอบได้
- [ ] เชิญลูกทีม → ลิงก์ในอีเมลขึ้นต้นด้วย staging.hopai.online
- [ ] หน้า `/docs/training`, `/stats`, `/guide.html`, `/Guide.html` (ต้องเด้งไปตัวเล็ก), `/geo`
- [ ] `curl -s https://staging.hopai.online/app-update.json` ได้ JSON ที่มี `version` ตรงกับ commit
- [ ] ชำระเงิน: **กดอัปเกรดแค่ให้ขึ้นหน้า Stripe แล้วกดย้อนกลับ** (ใช้คีย์ Live — ห้ามจ่ายจริงบน staging)
- [ ] `sudo reboot` → หลังเปิดเครื่อง เว็บกลับมาเองโดยไม่ต้องทำอะไร

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
2. **Tunnel → Public Hostname** เพิ่ม `hopai.online` → `HTTP` `web:8080` และ `www` → `HTTP` `web:8080`
3. บนเครื่อง แก้ `deploy/.env`: `PUBLIC_APP_URL=https://hopai.online` · `INVITE_WEB_BASE=https://hopai.online` · `ENABLE_CRON=1` → `./deploy/deploy.sh --no-pull`
4. เปิด https://hopai.online ทดสอบล็อกอินให้ผ่าน
5. **Supabase** → URL Configuration → **Site URL** = `https://hopai.online`
6. **Stripe (Live)** → Developers → Webhooks → endpoint เดิม → **แก้ URL** เป็น `https://hopai.online/api/stripe-webhook` (แก้ URL อย่างเดียว ความลับเดิมยังใช้ได้ ไม่ต้องเปลี่ยน `STRIPE_WEBHOOK_SECRET`)
7. **merge `deploy/edgexpert` → main** แล้วบนเครื่อง: `git switch main && ./deploy/deploy.sh`
   — CI จะ build APK ใหม่ที่ชี้ hopai.online ให้อัตโนมัติ (ต้องทำหลังข้อ 2 เพราะ CI ดึงค่า config จาก https://hopai.online)
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

- **ไฟดับ/เน็ตหลุด = เว็บล่ม** → ต่อ **UPS** และตั้ง BIOS ให้เปิดเครื่องเองเมื่อไฟกลับ (Restore on AC power loss = Power On)
- อัปเดตความปลอดภัยของระบบอัตโนมัติ: `sudo apt-get install -y unattended-upgrades`
- **อัปเดตเว็บ:** push เข้า main แล้วบนเครื่องรัน `./deploy/deploy.sh` (อยากให้อัตโนมัติ ค่อยทำ GitHub Actions self-hosted runner ภายหลัง)
- เก็บสำเนา `deploy/.env` ไว้ในที่ปลอดภัย (เช่น password manager) — เป็นสิ่งเดียวที่ต้องสำรองจากเครื่องนี้
- **ห้ามลบโปรเจกต์ Vercel** จนกว่าแอปทุกเครื่องอัปเดตแล้ว (ดูจาก Vercel → Logs ว่าไม่มีคำขอ `/api/*` เข้ามาอีกหลายสัปดาห์)

## ขั้นที่ 6 (ทางเลือก) — AI ในเครื่อง

GB10 รัน LLM ในเครื่องได้ — ตั้ง `AI_API_URL` ให้ชี้เซิร์ฟเวอร์โมเดลในเครื่อง (เช่น ผ่านเครือข่าย docker) จะไม่เสียค่า API ภายนอก · ทำแยกหลังย้ายเสร็จและนิ่งแล้ว

---

## คำสั่งที่ใช้บ่อย (บนเครื่อง ในโฟลเดอร์ `~/hop`)

```bash
./deploy/deploy.sh                                        # ดึงโค้ดล่าสุด + build + รันใหม่
docker compose -f deploy/docker-compose.yml ps            # สถานะ
docker compose -f deploy/docker-compose.yml logs -f api   # log ของ API
docker compose -f deploy/docker-compose.yml restart       # รีสตาร์ททั้งหมด
curl -s http://127.0.0.1:8080/healthz                     # เช็คในเครื่อง (ไม่ผ่าน Cloudflare)
```

ทดสอบส่งแจ้งเตือน: `curl "https://hopai.online/api/push-cron?test=1" -H "Authorization: Bearer <CRON_SECRET>"` (พิมพ์ค่าเองบนเครื่อง อย่าวางในแชต)
