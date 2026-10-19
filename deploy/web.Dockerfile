# เว็บ (Vite build) + Caddy เสิร์ฟไฟล์ static และส่งต่อ /api/* ไปที่คอนเทนเนอร์ api
# build จากรากโปรเจกต์: docker compose -f deploy/docker-compose.yml build web

# ── ขั้น build: ใช้ Debian (glibc) ให้ตรงกับแพ็กเกจ native ใน package-lock (rollup/esbuild linux-arm64-gnu) ──
FROM node:24-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .

# ค่า public ของ Supabase (อยู่ในบันเดิลเว็บอยู่แล้ว — ด่านความปลอดภัยจริงคือ RLS)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
# รหัส commit → buildId ของ live-update (ไม่มี .git ในคอนเทนเนอร์ ต้องส่งเข้ามา)
ARG GIT_SHA=dev
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    GITHUB_SHA=$GIT_SHA
RUN test -n "$VITE_SUPABASE_URL" && test -n "$VITE_SUPABASE_ANON_KEY" \
  || (echo "ยังไม่ได้ตั้ง VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ใน deploy/.env" && exit 1)
RUN npm run build

# ── ขั้นรัน ──
FROM caddy:2.11-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/dist /srv/dist
EXPOSE 8080
