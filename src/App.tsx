import { Navigate, NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import ListPage from './pages/ListPage'
import FormPage from './pages/FormPage'
import MapPage from './pages/MapPage'
import DashboardPage from './pages/DashboardPage'
import PlansPage from './pages/PlansPage'
import ComparePage from './pages/ComparePage'
import TeamPage from './pages/TeamPage'
import SuperAdminPage from './pages/SuperAdminPage'
import LogsPage from './pages/LogsPage'
import ProfilePage from './pages/ProfilePage'

// โหลดเมื่อเข้าใช้เท่านั้น — หน้านำเข้าลาก SheetJS (~ตัวใหญ่) มาด้วย ไม่ควรอยู่ใน bundle หลัก
const ImportPage = lazy(() => import('./pages/ImportPage'))
import LoginPage, { CreateOrgScreen, JoinOrgScreen, PendingScreen, SuspendedScreen } from './pages/LoginPage'
import LandingPage from './pages/LandingPage'
import Assistant from './components/Assistant'
import ReviewPanel from './components/ReviewPanel'
import TourOverlay from './components/TourOverlay'
import UpgradeNotice from './components/UpgradeNotice'
import { planAccess } from './lib/plan'
import { buildTourSteps, startTour } from './lib/tour'
import { initReviewMode } from './lib/review'
import { supabase, supabaseConfigured } from './lib/supabase'
import { orgOk, useAuth } from './lib/auth'
import { isInstalledApp } from './lib/native'
import { IconChart, IconForm, IconList, IconMap, IconRoute, IconShield, IconUser, IconUsers } from './components/icons'

/** ป้ายเมนู: ข้อความเต็มบน sidebar เดสก์ท็อป / ข้อความสั้นบน bottom nav มือถือ */
function NavText({ full, short }: { full: string; short?: string }) {
  return (
    <span className="nav-text">
      <span className="nav-lg">{full}</span>
      {short && <span className="nav-sm">{short}</span>}
    </span>
  )
}

export default function App() {
  const { session, profile, org, loading, signOut, refreshProfile, orgs, switchOrg } = useAuth()
  const [search, setSearch] = useState('')
  const [ignoreInvite, setIgnoreInvite] = useState(false)
  // แจ้งเตือนจาก lib/appUpdate เมื่อมี APK เวอร์ชันใหม่ให้ดาวน์โหลด (เฉพาะในแอป)
  const [apkUpdate, setApkUpdate] = useState<{ version: string; url: string } | null>(null)
  useEffect(() => {
    const onApk = (e: Event) => setApkUpdate((e as CustomEvent<{ version: string; url: string }>).detail)
    window.addEventListener('hob-apk-update', onApk)
    return () => window.removeEventListener('hob-apk-update', onApk)
  }, [])
  // ลงทะเบียนรับแจ้งเตือนแผนเยี่ยมชมหลังล็อกอิน (ทำงานเฉพาะในแอป — ดู lib/push.ts)
  const userId = session?.user.id ?? null
  const userOrg = profile?.org_id ?? null
  useEffect(() => {
    if (!userId || !profile) return
    void import('./lib/push').then((m) => m.initPush(userId, userOrg)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, userOrg])
  // โหลดสถานะโหมดรีวิวหลังล็อกอิน (ปุ่มรีวิวจะโผล่เมื่อ super เปิดโหมด)
  useEffect(() => {
    if (session) void initReviewMode()
  }, [session])
  const navigate = useNavigate()
  const location = useLocation()

  // เปิดลิงก์ชวนเพื่อน (?ref=CODE) → เก็บไว้ ให้คงอยู่ข้ามหน้าสมัคร/OAuth แล้วผูกตอนสร้างองค์กร
  const [searchParams] = useSearchParams()
  useEffect(() => {
    const ref = searchParams.get('ref')
    if (ref) {
      try { localStorage.setItem('hop_ref', ref) } catch { /* ไม่มี localStorage ก็ข้าม */ }
    }
    const invite = searchParams.get('invite')
    if (invite) {
      try { localStorage.setItem('hop_invite', invite) } catch { /* ข้าม */ }
    }
  }, [searchParams])

  // ขั้นตอนทัวร์ตามบทบาท — คำนวณระดับบนสุด (ต้องอยู่เหนือ early return ตามกฎ hooks)
  const tourSteps = useMemo(
    () =>
      buildTourSteps({
        isSuper: Boolean(profile?.is_super),
        canTeam: Boolean(
          (profile?.role === 'admin' && profile?.org_id) ||
            (profile?.is_super && profile?.impersonate_org_id),
        ),
      }),
    [profile?.is_super, profile?.role, profile?.org_id, profile?.impersonate_org_id],
  )

  if (!supabaseConfigured) {
    return (
      <div className="banner-warn" style={{ marginTop: 40 }}>
        ยังไม่ได้ตั้งค่า Supabase — คัดลอก <code>.env.example</code> เป็น <code>.env</code>{' '}
        แล้วใส่ <code>VITE_SUPABASE_URL</code> / <code>VITE_SUPABASE_ANON_KEY</code>{' '}
        จากนั้นรัน <code>supabase/*.sql</code> ตามลำดับใน SQL Editor
      </div>
    )
  }
  if (loading) return <div className="loading" style={{ paddingTop: 80 }}>กำลังโหลด…</div>
  // ยังไม่ล็อกอิน: บนเว็บคนทั่วไปเห็น landing page (ทีมงานเข้าทาง /login)
  // ส่วนแอปมือถือ/PWA ที่ติดตั้งไว้ ผู้ใช้คือทีมงานอยู่แล้ว — ข้ามไปหน้า login เลย
  if (!session) return isInstalledApp || location.pathname === '/login' ? <LoginPage /> : <LandingPage />

  const isSuper = Boolean(profile?.is_super)

  // คำเชิญค้างอยู่ (มาจากลิงก์เชิญ) → หน้ายอมรับ — ต้องทำงานแม้ผู้ใช้ "มี org อยู่แล้ว" (multi-org)
  if (profile && !isSuper && !ignoreInvite) {
    let inviteTok: string | null = null
    try { inviteTok = localStorage.getItem('hop_invite') } catch { inviteTok = null }
    if (inviteTok) {
      return (
        <JoinOrgScreen
          token={inviteTok}
          onDecline={() => {
            try { localStorage.removeItem('hop_invite') } catch { /* ข้าม */ }
            setIgnoreInvite(true)
          }}
          onSignOut={() => void signOut()}
        />
      )
    }
  }

  // ยังไม่มีองค์กร → ตั้งองค์กรใหม่ (super admin ข้ามได้ เพื่อเข้าหน้าบริหารระบบ)
  if (profile && !profile.org_id && !isSuper) {
    return <CreateOrgScreen email={session.user.email} onSignOut={() => void signOut()} />
  }
  // มีองค์กรแต่ถูกปิดใช้งานรายบุคคล → รอแอดมินเปิดให้
  if (!profile || (!profile.active && !isSuper)) {
    return <PendingScreen email={session.user.email} onSignOut={() => void signOut()} />
  }
  // องค์กรถูกระงับ/หมดอายุ → ใช้งานไม่ได้ (super admin ไม่ติดล็อกนี้)
  if (!isSuper && profile.org_id && !orgOk(org)) {
    const expired = Boolean(
      org?.sub_expires_at && org.sub_expires_at < new Date().toISOString().slice(0, 10),
    )
    return (
      <SuspendedScreen orgName={org?.name} expired={expired} onSignOut={() => void signOut()} />
    )
  }

  const isAdmin = profile.role === 'admin'
  const impersonating = Boolean(isSuper && profile.impersonate_org_id)
  // สิทธิ์ตามแพ็กเกจ — super (โหมดภาพรวม) = เต็ม · สวมสิทธิ์/ปกติ = ตามแพ็กเกจองค์กร
  const access = planAccess(isSuper && !impersonating ? 'enterprise' : org?.plan)

  async function exitImpersonation() {
    await supabase.rpc('super_impersonate', { p_org: null })
    await refreshProfile()
    navigate('/super')
  }

  return (
    <div className="app-shell">
      {apkUpdate && (
        <div className="apk-update-bar">
          <span>
            📲 แอปเวอร์ชันใหม่ <b>v{apkUpdate.version}</b> พร้อมติดตั้ง
          </span>
          <button className="btn sm primary" onClick={() => window.open(apkUpdate.url, '_blank')}>
            ดาวน์โหลด
          </button>
          <button className="btn sm" onClick={() => setApkUpdate(null)}>ไว้ก่อน</button>
        </div>
      )}
      {impersonating && (
        <div className="impersonate-bar">
          <IconShield size={15} />
          <span>
            กำลังใช้สิทธิ์แทนองค์กร <b>{org?.name ?? '…'}</b> — สิ่งที่เพิ่ม/แก้จะเป็นข้อมูลขององค์กรนี้
          </span>
          <button className="btn sm" onClick={() => void exitImpersonation()}>ออกจากสิทธิ์</button>
        </div>
      )}
      <header className="topbar">
        <div className="brand">
          <svg width="26" height="26" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="7" fill="#7132f5" />
            <path d="M6 24V14l10-6 10 6v10h-7v-6h-6v6H6z" fill="#fff" />
          </svg>
          <span>H<span className="brand-accent">OP</span></span>
        </div>
        <input
          data-tour="search"
          placeholder="ค้นหาทรัพย์ (รหัส, ทำเล, ประเภท…)"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            navigate('/')
          }}
        />
        <div className="user-chip">
          {orgs.length > 1 ? (
            <select
              className="org-switch"
              value={org?.id ?? ''}
              onChange={(e) => {
                // สลับ org แล้วโหลดหน้าใหม่ที่ '/' — ให้ทุกหน้าดึงข้อมูลของ org ใหม่ครบ (กันข้อมูลค้างของเก่า)
                void switchOrg(e.target.value).then(() => window.location.assign('/'))
              }}
              title="สลับองค์กร"
            >
              {orgs.map((o) => <option key={o.org_id} value={o.org_id}>{o.name}</option>)}
            </select>
          ) : (
            org && <span className="org-badge">{org.name}</span>
          )}
          <span className="user-name">{profile.full_name || profile.email}</span>
          {isSuper && <span className="role-badge super">SUPER</span>}
          {!isSuper && isAdmin && <span className="role-badge">แอดมิน</span>}
          <button className="btn sm icon-only" onClick={() => navigate('/me')} title="โปรไฟล์ของฉัน" aria-label="โปรไฟล์ของฉัน"><IconUser size={15} /></button>
          <button className="btn sm" onClick={() => startTour()} title="ดูวิธีใช้ (ทัวร์แนะนำ)">?</button>
          <button className="btn sm" onClick={() => void signOut()} title="ออกจากระบบ">ออก</button>
        </div>
      </header>
      <div className="main">
        <nav className="sidebar">
          <NavLink to="/map" data-tour="nav-map"><IconMap /><NavText full="แผนที่" /></NavLink>
          <NavLink to="/new" data-tour="nav-form"><IconForm /><NavText full="ฟอร์ม" /></NavLink>
          <NavLink to="/" end data-tour="nav-list"><IconList /><NavText full="รายการทรัพย์" short="รายการ" /></NavLink>
          <NavLink to="/dashboard" data-tour="nav-dashboard"><IconChart /><NavText full="สรุปภาพรวม" short="สรุป" /></NavLink>
          <NavLink to="/plans" data-tour="nav-plans"><IconRoute /><NavText full="แผนเยี่ยมชม" short="แผนเยี่ยม" /></NavLink>
          {((isAdmin && profile.org_id) || impersonating) && (
            <NavLink to="/team" data-tour="nav-team"><IconUsers /><NavText full="ทีม" /></NavLink>
          )}
          {isSuper && <NavLink to="/super" data-tour="nav-super"><IconShield /><NavText full="Super Admin" short="Super" /></NavLink>}
        </nav>
        <main className="content">
          <Routes>
            <Route path="/" element={<ListPage search={search} />} />
            <Route path="/me" element={<ProfilePage />} />
            <Route path="/dashboard" element={access.dashboard ? <DashboardPage /> : <UpgradeNotice feature="สรุปภาพรวม" />} />
            <Route path="/map" element={<MapPage />} />
            {/* key ตาม path — สลับ new/edit หรือแก้คนละทรัพย์ ให้ FormPage remount ล้างฟอร์มใหม่ */}
            <Route path="/new" element={<FormPage key={location.pathname} />} />
            <Route path="/edit/:id" element={<FormPage key={location.pathname} />} />
            <Route path="/plans" element={access.visitPlans ? <PlansPage /> : <UpgradeNotice feature="แผนเยี่ยมชม" />} />
            <Route path="/compare" element={<ComparePage />} />
            <Route
              path="/import"
              element={
                access.importCsv ? (
                  <Suspense fallback={<div className="loading">กำลังโหลด…</div>}>
                    <ImportPage />
                  </Suspense>
                ) : (
                  <UpgradeNotice feature="นำเข้า Excel/CSV" />
                )
              }
            />
            <Route
              path="/team"
              element={
                (isAdmin && profile.org_id) || impersonating
                  ? <TeamPage />
                  : <Navigate to="/" replace />
              }
            />
            <Route
              path="/super"
              element={isSuper ? <SuperAdminPage /> : <Navigate to="/" replace />}
            />
            <Route
              path="/logs"
              element={isAdmin || isSuper ? <LogsPage /> : <Navigate to="/" replace />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      <Assistant />
      <ReviewPanel />
      <TourOverlay steps={tourSteps} />
    </div>
  )
}
