import { createContext, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from './supabase'
import type { Role } from './roles'
import { setLogActor } from './activityLog'
import { isNativeApp } from './native'
import { claimDeviceSession, watchDeviceSession } from './deviceSession'

// OAuth (Google) เด้งออกไปนอกแอปแล้วค่อยกลับมา — ตั้งธงไว้ก่อนเด้ง พอ SIGNED_IN กลับมาค่อยจดเครื่อง
// (จดเฉพาะตอนล็อกอินจริง ไม่จดตอน SIGNED_IN จากการสลับแท็บ ไม่งั้นเครื่องเก่าจะแย่งสิทธิ์คืน)
const OAUTH_CLAIM_FLAG = 'hop_oauth_claim'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  /** บทบาทใน org ที่ active อยู่ (8 ระดับ — ดู src/lib/roles.ts) */
  role: Role
  active: boolean
  org_id: string | null
  is_super?: boolean
  /** super กำลังสวมสิทธิ์องค์กรนี้อยู่ (null = โหมดภาพรวมปกติ) */
  impersonate_org_id?: string | null
  created_at?: string
}

export interface Organization {
  id: string
  name: string
  plan?: string
  /** ระดับโควตาทรัพย์ของแพ็กเกจ (100/250/500) — null = ลูกค้าเดิม/ทดลอง ตีความเป็น 500 */
  plan_tier?: number | null
  sub_status?: string
  sub_expires_at?: string | null
  trial_plan?: string | null       // แพ็กเกจช่วงทดลองใช้ (supabase/trial.sql)
  trial_expires_at?: string | null // วันสุดท้ายของช่วงทดลอง — หมดแล้วล็อกองค์กรจนกว่าจะเลือกแพ็กเกจ
  /** เกณฑ์แจ้งเตือนสัญญาใกล้หมดขององค์กร (วันล่วงหน้า) — null = ใช้ค่ามาตรฐานระบบ */
  contract_alert_days?: number[] | null
  /** ที่นั่งที่ซื้อเพิ่มนอกเหนือจากแพ็กเกจ (supabase/seats.sql) */
  extra_seats?: number | null
  extra_seats_expires_at?: string | null
}

/** องค์กรใช้งานได้มั้ย (ไม่ถูกระงับ + sub ไม่หมดอายุ + ช่วงทดลองไม่หมด) — ตรรกะเดียวกับ org_ok ในฐานข้อมูล */
export function orgOk(org: Organization | null): boolean {
  if (!org) return false
  if (org.sub_status === 'suspended') return false
  const today = new Date().toISOString().slice(0, 10)
  if (org.sub_expires_at && org.sub_expires_at < today) return false
  // หมดช่วงทดลองโดยยังไม่เคยจ่าย (plan ยังเป็น free) → ล็อกจนกว่าจะเลือกแพ็กเกจ
  // (trial_expires_at เป็น null = org ที่ไม่เคยได้ trial → ใช้ได้ในลิมิต Free ตามเดิม)
  if ((org.plan ?? 'free') === 'free' && org.trial_expires_at && org.trial_expires_at < today) return false
  return true
}

interface AuthState {
  session: Session | null
  profile: Profile | null
  org: Organization | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<{ error: string | null; needConfirm: boolean }>
  signInWithGoogle: () => Promise<string | null>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  /** องค์กรทั้งหมดที่ผู้ใช้เป็นสมาชิก (สำหรับตัวสลับองค์กร) */
  orgs: { org_id: string; name: string; role: string }[]
  /** สลับองค์กรที่กำลังใช้งาน */
  switchOrg: (orgId: string) => Promise<void>
  /** true = ผู้ใช้เพิ่งกดลิงก์ "ตั้งรหัสผ่านใหม่" จากอีเมล → ต้องให้ตั้งรหัสก่อนใช้งานต่อ */
  recovery: boolean
  /** ตั้งรหัสใหม่เสร็จ/ยกเลิก → เข้าใช้งานตามปกติ */
  clearRecovery: () => void
}

// export ไว้เพื่อให้หน้าทดสอบ dev/form-harness.tsx ใส่สถานะผู้ใช้ปลอมได้ (ทดสอบ UI ที่กั้นด้วยแพ็กเกจ)
// โค้ดแอปจริงให้ใช้ useAuth() เท่านั้น อย่าอ่าน context ตรงๆ
export const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [org, setOrg] = useState<Organization | null>(null)
  const [orgs, setOrgs] = useState<{ org_id: string; name: string; role: string }[]>([])
  const [loading, setLoading] = useState(true)
  // ลิงก์รีเซ็ตรหัสผ่านจากอีเมลจะสร้าง session ให้เลย (event = PASSWORD_RECOVERY)
  // ถ้าไม่กันไว้ ผู้ใช้จะหลุดเข้าแอปโดยไม่ได้ตั้งรหัสใหม่ แล้วก็ล็อกอินรอบหน้าไม่ได้อีก
  const [recovery, setRecovery] = useState(false)

  async function loadProfile(userId: string) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    const p = (data as Profile | null) ?? null
    setProfile(p)
    setLogActor(p ? p.full_name || p.email : null)
    // super ที่กำลังสวมสิทธิ์ → ใช้องค์กรที่สวมอยู่เป็นองค์กรปัจจุบันของแอป
    const effectiveOrgId = (p?.is_super && p.impersonate_org_id) || p?.org_id
    if (effectiveOrgId) {
      const { data: o } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', effectiveOrgId)
        .single()
      setOrg((o as Organization | null) ?? null)
    } else {
      setOrg(null)
    }
    // รายชื่อองค์กรที่ผู้ใช้เป็นสมาชิก (multi-org) — สำหรับตัวสลับองค์กร
    const { data: mo } = await supabase.rpc('my_orgs')
    setOrgs((mo as { org_id: string; name: string; role: string }[] | null) ?? [])
  }

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false)
      return
    }
    void supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (data.session) await loadProfile(data.session.user.id)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      // กลับมาจากหน้า Google พร้อม session ใหม่ → จดเครื่องนี้เป็นเครื่องที่ใช้งาน (เด้งเครื่องอื่นออก)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_IN' && s && localStorage.getItem(OAUTH_CLAIM_FLAG)) {
        localStorage.removeItem(OAUTH_CLAIM_FLAG)
        void claimDeviceSession()
      }
      if (s) void loadProfile(s.user.id)
      else {
        setProfile(null)
        setOrg(null)
        setLogActor(null)
      }
    })

    // แอปมือถือ: รับ deep link ที่ Google เด้งกลับ (com.hobproperty.app://auth-callback?code=…)
    // แล้วแลก code เป็น session เอง — เว็บทำให้อัตโนมัติผ่าน detectSessionInUrl
    let removeUrlListener: (() => void) | undefined
    if (isNativeApp) {
      void import('@capacitor/app').then(({ App }) => {
        void App.addListener('appUrlOpen', async ({ url }) => {
          if (!url.includes('auth-callback')) return
          try {
            const { Browser } = await import('@capacitor/browser')
            await Browser.close()
          } catch { /* บางเครื่องปิด in-app browser เองแล้ว */ }
          try {
            const code = new URL(url).searchParams.get('code')
            if (code) await supabase.auth.exchangeCodeForSession(code)
          } catch { /* ลิงก์ไม่มี code ที่ใช้ได้ */ }
        }).then((handle) => {
          removeUrlListener = () => void handle.remove()
        })
      })
    }

    return () => {
      sub.subscription.unsubscribe()
      removeUrlListener?.()
    }
  }, [])

  // ล็อกอินได้ทีละเครื่อง: เฝ้าดู profiles.current_session_id — มีเครื่องอื่นล็อกอินซ้อนเมื่อไหร่
  // เครื่องนี้ออกจากระบบทันทีพร้อมแจ้งเหตุผล (ดู lib/deviceSession.ts + supabase/single-device.sql)
  const userId = session?.user.id
  useEffect(() => {
    if (!userId || !supabaseConfigured) return
    return watchDeviceSession(userId, () => {
      void supabase.auth.signOut().finally(() => {
        alert('บัญชีนี้ถูกเข้าสู่ระบบบนเครื่องอื่น ระบบจึงออกจากระบบเครื่องนี้ให้\n(บัญชีหนึ่งใช้งานได้ทีละเครื่อง)')
      })
    })
  }, [userId])

  async function signIn(email: string, password: string): Promise<string | null> {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return error.message
    await claimDeviceSession() // ล็อกอินได้ทีละเครื่อง — เครื่องนี้เป็นเจ้าของ เครื่องเก่าเด้งออก
    return null
  }

  async function signUp(
    email: string,
    password: string,
    fullName: string,
  ): Promise<{ error: string | null; needConfirm: boolean }> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }, // → raw_user_meta_data.full_name → trigger สร้าง profile
    })
    if (error) return { error: error.message, needConfirm: false }
    // อีเมลถูกใช้แล้ว: Supabase คืน user ที่ identities ว่าง (กันการเดาว่ามีบัญชีอยู่)
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      return { error: 'อีเมลนี้ถูกใช้แล้ว — ลองเข้าสู่ระบบแทน', needConfirm: false }
    }
    if (data.session) await claimDeviceSession() // สมัครแล้วเข้าใช้ได้เลย → จดเครื่องนี้
    // ไม่มี session กลับมา = Supabase ตั้งค่าให้ยืนยันอีเมลก่อนใช้งาน
    return { error: null, needConfirm: !data.session }
  }

  async function signInWithGoogle(): Promise<string | null> {
    localStorage.setItem(OAUTH_CLAIM_FLAG, '1') // กลับมาถึงค่อยจดเครื่อง (ดูคอมเมนต์บนสุด)
    const redirectTo = isNativeApp ? 'com.hobproperty.app://auth-callback' : window.location.origin
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: isNativeApp },
    })
    if (error) return error.message
    // แอป: เปิดหน้า Google ใน in-app browser เอง (เว็บ Supabase เด้งหน้าให้อัตโนมัติ)
    if (isNativeApp && data?.url) {
      const { Browser } = await import('@capacitor/browser')
      await Browser.open({ url: data.url })
    }
    return null
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function refreshProfile() {
    if (session) await loadProfile(session.user.id)
  }

  async function switchOrg(orgId: string) {
    const { error } = await supabase.rpc('switch_org', { p_org: orgId })
    if (error) {
      alert(`สลับองค์กรไม่สำเร็จ: ${error.message}`)
      return
    }
    if (session) await loadProfile(session.user.id)
  }

  return (
    <AuthContext.Provider
      value={{
        session, profile, org, loading, signIn, signUp, signInWithGoogle, signOut, refreshProfile,
        orgs, switchOrg, recovery, clearRecovery: () => setRecovery(false),
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth ต้องอยู่ใน <AuthProvider>')
  return ctx
}
