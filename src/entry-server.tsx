// จุดเข้า "ฝั่งเซิร์ฟเวอร์" สำหรับ prerender หน้า landing ตอน build (scripts/prerender.mjs)
// ทำไมต้อง prerender: เว็บเป็น SPA ที่ส่ง <div id="root"> ว่างให้บอท — บอท AI/Google ที่ไม่รัน JavaScript
// จึงมองไม่เห็นอะไรเลย · หน้าสาธารณะมีหน้าเดียวคือ landing ที่ "/" (route อื่นอยู่ใต้ #/ และต้องล็อกอิน)
// LandingPage ไม่พึ่ง AuthProvider และดึงราคา/รีวิวใน useEffect เท่านั้น → renderToString ได้ค่าเริ่มต้นที่ถูกต้อง
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import LandingPage from './pages/LandingPage'

export function render(): string {
  return renderToString(
    <StaticRouter location="/">
      <LandingPage />
    </StaticRouter>,
  )
}
