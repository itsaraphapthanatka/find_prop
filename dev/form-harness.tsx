// จุดเข้าสำหรับทดสอบ FormPage ตรงๆ โดยไม่ผ่านหน้าล็อกอิน (dev เท่านั้น)
// ไม่มี session → useAuth คืน profile/org = null (AuthProvider เรนเดอร์ลูกตามปกติ)
// ปุ่ม "บันทึก" จะเรียก Supabase จริง ถ้าไม่ได้ล็อกอินจะถูก RLS ปฏิเสธ — ตั้งใจให้เทสต์แค่ UI/ร่าง
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../src/lib/auth'
import FormPage from '../src/pages/FormPage'
// ต้องโหลด CSS ชุดเดียวกับ main.tsx — ถ้าไม่มี leaflet.css แผนที่จะไม่ถูก clip แล้วบังปุ่มด้านล่าง
import 'leaflet/dist/leaflet.css'
import '../src/styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<FormPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
)
