import { createContext, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from './supabase'
import { setLogActor } from './activityLog'

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
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [org, setOrg] = useState<Organization | null>(null)
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
    return () => sub.subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string): Promise<string | null> {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? error.message : null
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function refreshProfile() {
    if (session) await loadProfile(session.user.id)
  }

  return (
    <AuthContext.Provider
      value={{ session, profile, org, loading, signIn, signOut, refreshProfile }}
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
