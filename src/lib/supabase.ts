import { createClient } from '@supabase/supabase-js'
import { isNativeApp } from './native'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && anonKey)

export const supabase = createClient(url ?? 'https://placeholder.supabase.co', anonKey ?? 'placeholder', {
  auth: {
    // PKCE = flow มาตรฐานสำหรับ OAuth (Google) — ต้องใช้ exchangeCodeForSession
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    // เว็บ: ให้ Supabase อ่าน ?code ใน URL หลังเด้งกลับจาก Google อัตโนมัติ
    // แอป (Capacitor): URL ของหน้าเป็น capacitor://localhost — โค้ดมาทาง deep link (appUrlOpen)
    //   จึงปิดตัวนี้ แล้วเรียก exchangeCodeForSession เองใน lib/auth.tsx
    detectSessionInUrl: !isNativeApp,
  },
})

export const PHOTO_BUCKET = 'property-photos'
