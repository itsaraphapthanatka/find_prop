// จุดเข้าสำหรับทดสอบ FormPage ตรงๆ โดยไม่ผ่านหน้าล็อกอิน (dev เท่านั้น)
// ไม่มี session → useAuth คืน profile/org = null (AuthProvider เรนเดอร์ลูกตามปกติ)
// ปุ่ม "บันทึก" จะเรียก Supabase จริง ถ้าไม่ได้ล็อกอินจะถูก RLS ปฏิเสธ — ตั้งใจให้เทสต์แค่ UI/ร่าง
//
// โหมดที่ใช้ได้ (ต่อท้าย URL):
//   (ไม่ใส่อะไร) = เพิ่มทรัพย์ใหม่
//   ?edit=<id>   = โหมดแก้ไข /edit/:id (โหลดข้อมูลจริงไม่ได้เพราะไม่ได้ล็อกอิน — ดูแค่โครงฟอร์ม)
//   ?nav=1       = จำลองกด "แก้ไข" จากรายการที่เลื่อนลงมา เพื่อตรวจว่าฟอร์มเลื่อนขึ้นบนสุดให้เอง
//   ?page=profile|team|upgrade|detail (+ &pro=1) = หน้าอื่นที่ต้องมี auth ปลอม
//   ?page=detail&role=<บทบาท>&mine=1 = การ์ดรายละเอียดทรัพย์ (ดูการปิดข้อมูล/ปุ่มตามบทบาท)
//   &plan=starter|pro|free|enterprise &tier=100|250|500 &extra=<ที่นั่งที่ซื้อเพิ่ม> = ปรับแพ็กเกจปลอม
//   &trial=<จำนวนวันที่เหลือ> = จำลองช่วงทดลองใช้ (ไม่จำกัดที่นั่ง) · ติดลบ = หมดทดลองแล้ว
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext, AuthProvider } from '../src/lib/auth'
import FormPage from '../src/pages/FormPage'
import ProfilePage from '../src/pages/ProfilePage'
import TeamPage from '../src/pages/TeamPage'
import UpgradePage from '../src/pages/UpgradePage'
import PropertyDetail from '../src/components/PropertyDetail'
import { canDelete, canEdit, rolePerm, type Role } from '../src/lib/roles'
import type { Property } from '../src/types'
// ต้องโหลด CSS ชุดเดียวกับ main.tsx — ถ้าไม่มี leaflet.css แผนที่จะไม่ถูก clip แล้วบังปุ่มด้านล่าง
import 'leaflet/dist/leaflet.css'
import '../src/styles.css'

const params = new URLSearchParams(location.search)
const editId = params.get('edit')
const navMode = params.has('nav')
// ?pro=1 = สวมสถานะผู้ใช้แพ็กเกจ Pro ปลอม เพื่อทดสอบส่วนที่กั้นด้วยแพ็กเกจ (เช่น แผงนัดติดตาม)
const proMode = params.has('pro')

/** สถานะผู้ใช้ปลอมแพ็กเกจ Pro — ใช้เฉพาะหน้าทดสอบนี้ */
const noop = async () => {}
// แพ็กเกจ/ระดับ/ที่นั่งที่ซื้อเพิ่ม ปรับได้จาก query (ใช้ทดสอบโควตาที่นั่ง)
const fakePlan = params.get('plan') || 'pro'
const fakeTier = Number(params.get('tier')) || null
const fakeExtra = Number(params.get('extra')) || 0
// ช่วงทดลองใช้: ?trial=7 = เหลืออีก 7 วัน · ?trial=-1 = หมดไปแล้วเมื่อวาน
const trialDays = params.has('trial') ? Number(params.get('trial')) : null
const fakeRole = (params.get('role') || 'owner') as Role
const fakeAuth = {
  session: { user: { id: 'fake-user' } },
  profile: { id: 'fake-user', email: 'test@example.com', role: fakeRole, active: true },
  org: {
    id: 'fake-org', name: 'ทดสอบ', plan: fakePlan, plan_tier: fakeTier,
    extra_seats: fakeExtra,
    // หมดอายุอีก 30 วัน (ที่นั่งที่ซื้อเพิ่มต้องมีวันหมดอายุจึงนับ)
    extra_seats_expires_at: fakeExtra > 0
      ? new Date(Date.now() + 30 * 86400e3).toISOString().slice(0, 10) : null,
    ...(trialDays === null ? {} : {
      trial_plan: 'pro',
      trial_expires_at: new Date(Date.now() + trialDays * 86400e3).toISOString().slice(0, 10),
    }),
  },
  loading: false,
  signIn: async () => null,
  signUp: async () => ({ error: null, needConfirm: false }),
  signInWithGoogle: async () => null,
  signOut: noop,
  refreshProfile: noop,
  orgs: [],
  switchOrg: noop,
}

function Auth({ children }: { children: React.ReactNode }) {
  if (!proMode) return <AuthProvider>{children}</AuthProvider>
  return <AuthContext.Provider value={fakeAuth as never}>{children}</AuthContext.Provider>
}

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

/** ทรัพย์ปลอม 1 ชิ้นสำหรับดูการ์ดรายละเอียด — ธงปิดข้อมูลจำลองตามที่ properties_view จะส่งมา */
function DetailDemo() {
  const mine = params.has('mine')
  const perm = rolePerm(fakeRole)
  const masked = !mine && perm.maskContact
  const maskedHouseNo = !mine && perm.maskHouseNo
  const maskedLoc = !mine && perm.maskLocation !== false
  const p = {
    id: 'demo', code: 'DEMO001', record_date: '2026-08-01',
    property_type: 'โกดัง', listing_type: 'เช่า',
    house_no: maskedHouseNo ? null : '88/123',
    lessor_name: masked ? null : 'คุณสมชาย ใจดี',
    lessor_company: masked ? null : 'บริษัท ตัวอย่าง จำกัด',
    phone: masked ? null : '0812345678',
    province: 'สมุทรปราการ', district: 'บางพลี', subdistrict: 'บางพลีใหญ่',
    lat: maskedLoc ? null : 13.599, lng: maskedLoc ? null : 100.618,
    map_url: maskedLoc ? null : 'https://maps.google.com/?q=13.599,100.618',
    rent_per_month: 120000,
    created_by: mine ? 'fake-user' : 'someone-else',
    created_by_name: 'พี่หน่อย (ทีมขาย)',
    created_by_phone: '0899999999',
    contact_masked: masked, location_masked: maskedLoc, house_no_masked: maskedHouseNo,
  } as unknown as Property
  return (
    <PropertyDetail
      property={p}
      onClose={() => {}}
      onEdit={canEdit(p, fakeRole, 'fake-user') ? () => {} : null}
      onDelete={canDelete(p, fakeRole, 'fake-user', new Set(['someone-else'])) ? () => {} : null}
    />
  )
}

function App() {
  // ?page=profile|team|upgrade — หน้าที่ต้องมี auth (คู่กับ ?pro=1)
  const page = params.get('page')
  if (page === 'detail') {
    return (
      <MemoryRouter initialEntries={['/']}>
        <Routes><Route path="/" element={<DetailDemo />} /></Routes>
      </MemoryRouter>
    )
  }
  if (page === 'profile' || page === 'team' || page === 'upgrade') {
    const path = page === 'profile' ? '/me' : `/${page}`
    return (
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/me" element={<ProfilePage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/upgrade" element={<UpgradePage />} />
        </Routes>
      </MemoryRouter>
    )
  }
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
    <Auth>
      <App />
    </Auth>
  </StrictMode>,
)
