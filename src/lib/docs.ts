// คู่มือ HTML ที่ไปกับตัวระบบ (docs/*.html → dist/docs/*.html ตอน build — ดู docsPlugin ใน vite.config.ts)
// URL ไม่โชว์ .html: /docs/training · /docs/features · /docs/system (vercel.json rewrite ให้ชี้ไปไฟล์จริง)
import { API_BASE } from './native'

/**
 * ลิงก์คู่มือ — ในแอป Capacitor ต้องชี้ไปเว็บ prod (API_BASE) เพราะเบราว์เซอร์ของเครื่อง
 * เปิด capacitor://localhost ไม่ได้ · บนเว็บ API_BASE ว่าง → ได้ลิงก์ในโดเมนเดียวกัน
 */
export const docUrl = (slug: string) => `${API_BASE}/docs/${slug}`

/** คู่มือใช้งานสำหรับทีมลูกค้า (ทุกบทบาทเปิดได้) — docs/TRAINING.html */
export const TRAINING_DOC = docUrl('training')
/** เอกสารฟีเจอร์ทั้งระบบแบบละเอียด (ทีมขาย/อบรม/ลูกค้าที่อยากรู้ลึก) — docs/FEATURES.html */
export const FEATURES_DOC = docUrl('features')
/** เอกสารอธิบายการทำงานของระบบ (เชิงเทคนิค — สำหรับทีมงาน/super admin) — docs/SYSTEM.html */
export const SYSTEM_DOC = docUrl('system')
