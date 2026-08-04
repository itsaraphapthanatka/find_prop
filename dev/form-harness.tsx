// จุดเข้าสำหรับทดสอบ FormPage ตรงๆ โดยไม่ผ่านหน้าล็อกอิน (dev เท่านั้น)
// ไม่มี session → useAuth คืน profile/org = null (AuthProvider เรนเดอร์ลูกตามปกติ)
// ปุ่ม "บันทึก" จะเรียก Supabase จริง ถ้าไม่ได้ล็อกอินจะถูก RLS ปฏิเสธ — ตั้งใจให้เทสต์แค่ UI/ร่าง
//
// โหมดที่ใช้ได้ (ต่อท้าย URL):
//   (ไม่ใส่อะไร) = เพิ่มทรัพย์ใหม่
//   ?edit=<id>   = โหมดแก้ไข /edit/:id (โหลดข้อมูลจริงไม่ได้เพราะไม่ได้ล็อกอิน — ดูแค่โครงฟอร์ม)
//   ?nav=1       = จำลองกด "แก้ไข" จากรายการที่เลื่อนลงมา เพื่อตรวจว่าฟอร์มเลื่อนขึ้นบนสุดให้เอง
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../src/lib/auth'
import FormPage from '../src/pages/FormPage'
// ต้องโหลด CSS ชุดเดียวกับ main.tsx — ถ้าไม่มี leaflet.css แผนที่จะไม่ถูก clip แล้วบังปุ่มด้านล่าง
import 'leaflet/dist/leaflet.css'
import '../src/styles.css'

const params = new URLSearchParams(location.search)
const editId = params.get('edit')
const navMode = params.has('nav')

/** หน้ารายการปลอมสูงๆ + ลิงก์ไปหน้าแก้ไข (ใช้เฉพาะโหมด nav) */
function TallList() {
  return (
    <div style={{ padding: 20 }}>
      <div style={{ height: 2400, background: 'linear-gradient(#fff, #eee)' }}>
        รายการปลอม — เลื่อนลงล่างสุดแล้วกดปุ่มแก้ไข
      </div>
      <Link to="/edit/fake-id" id="go-edit" className="btn primary">แก้ไข</Link>
    </div>
  )
}

function App() {
  if (navMode) {
    return (
      <MemoryRouter initialEntries={['/list']}>
        <Routes>
          <Route path="/list" element={<TallList />} />
          <Route path="/edit/:id" element={<FormPage />} />
        </Routes>
      </MemoryRouter>
    )
  }
  if (editId) {
    return (
      <MemoryRouter initialEntries={[`/edit/${editId}`]}>
        <Routes>
          <Route path="/edit/:id" element={<FormPage />} />
        </Routes>
      </MemoryRouter>
    )
  }
  return (
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<FormPage />} />
      </Routes>
    </BrowserRouter>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
