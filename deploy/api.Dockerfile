# API (api/*.js เดิม) — รันด้วย server/index.mjs แทน Vercel Functions
# build จากรากโปรเจกต์: docker compose -f deploy/docker-compose.yml build api
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production

# ใช้แค่ไลบรารีที่ handler import (stripe, nodemailer) — ไม่ลากทั้งโปรเจกต์มา
# package.json นี้มี "type": "module" ด้วย ทำให้ /app/api/*.js เป็น ESM เหมือนบน Vercel
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force

COPY api ./api
COPY server/index.mjs ./server/index.mjs

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.mjs"]
