# ตัวส่งต่อจาก Vercel (ใช้ตอนย้ายจริงเท่านั้น)

ใช้ในขั้นที่ 4 ของ [docs/DEPLOY-EDGEXPERT.md](../../docs/DEPLOY-EDGEXPERT.md) ตั้งค่าที่ Vercel → Settings → Build and Deployment → **Root Directory = `deploy/vercel-forwarder`** (Framework: Other, ไม่ต้องมี Build Command)

- แอปมือถือที่ติดตั้งไว้แล้วยังเรียก `hob-alpha.vercel.app` อยู่ ระบบจึงส่งต่อ `/api/*` และ `/app-update.*` แบบ **proxy** (ไม่ใช้ redirect เพราะ redirect จะทำให้ POST หายระหว่างทาง)
- หน้าเว็บอื่นทั้งหมด **redirect ถาวร (308)** ไป `https://hopai.online/...` ลิงก์แชร์ ลิงก์ชวนเพื่อน และลิงก์เชิญเดิมยังใช้ได้ เพราะเบราว์เซอร์เก็บส่วน `#/...` ไว้ให้
- **ไม่มี `crons`** เพราะเครื่องใหม่ยิงเองแล้ว ถ้าใส่ไว้ แจ้งเตือนจะออกซ้ำวันละ 2 ครั้ง
- ห้ามย้ายโฟลเดอร์ `api/` เข้ามาไว้ที่นี่ เพราะ Vercel จะรันฟังก์ชันเองแทนการส่งต่อ
