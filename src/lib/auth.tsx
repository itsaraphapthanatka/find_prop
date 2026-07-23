import { createContext, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from './supabase'
import { setLogActor } from './activityLog'
import { isNativeApp } from './native'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: 'admin' | 'member'
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
  sub_status?: string
  sub_expires_at?: string | null
}

/** องค์กรใช้งานได้มั้ย (ไม่ถูกระงับ + ยังไม่หมดอายุ) — ตรรกะเดียวกับ org_ok ในฐานข้อมูล */
export function orgOk(org: Organization | null): boolean {
  if (!org) return false
  if (org.sub_status === 'suspended') return false
  if (org.sub_expires_at && org.sub_expires_at < new Date().toISOString().slice(0, 10)) return false
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
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [org, setOrg] = useState<Organization | null>(null)
  const [orgs, setOrgs] = useState<{ org_id: string; name: string; role: string }[]>([])
  const [loading, setLoading] = useState(true)

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
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
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

  async function signIn(email: string, password: string): Promise<string | null> {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? error.message : null
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
    // ไม่มี session กลับมา = Supabase ตั้งค่าให้ยืนยันอีเมลก่อนใช้งาน
    return { error: null, needConfirm: !data.session }
  }

  async function signInWithGoogle(): Promise<string | null> {
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
      value={{ session, profile, org, loading, signIn, signUp, signInWithGoogle, signOut, refreshProfile, orgs, switchOrg }}
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
