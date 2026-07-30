import { supabase } from './supabase'

// ── ล็อกอินได้ทีละเครื่อง (single device login) ──
// ทุกครั้งที่ล็อกอินสำเร็จ เครื่องจะสุ่ม "รหัสประจำเครื่อง" เก็บใน localStorage แล้วจดลง
// profiles.current_session_id — เครื่องอื่นที่ถือรหัสเก่าเห็นว่ารหัสใน DB ไม่ตรงของตัวเอง
// ก็เด้งออกจากระบบทันที (realtime + polling สำรอง) · ต้องรัน supabase/single-device.sql ก่อน
// หมายเหตุ: แท็บหลายแท็บบนเครื่องเดียวกันใช้ localStorage ร่วมกัน = รหัสเดียวกัน ไม่เด้งกันเอง

const KEY = 'hop_device_session'

const getLocalId = () => {
  try { return localStorage.getItem(KEY) } catch { return null }
}

const newId = () =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`

// กันเช็คสวนทางตอนกำลังจด (เพิ่งล็อกอิน แต่ polling อ่านค่าเก่าจาก DB ทัน) — รอให้จดเสร็จก่อน
let claiming: Promise<void> | null = null

/** จดว่าเครื่องนี้เป็นเครื่องที่ใช้งานอยู่ (เรียกตอนล็อกอินสำเร็จ) — เครื่องอื่นจะถูกเด้งออก */
export function claimDeviceSession(): Promise<void> {
  const run = (async () => {
    const id = newId()
    try { localStorage.setItem(KEY, id) } catch { return }
    const { error } = await supabase.rpc('claim_device_session', { p_session: id })
    // DB ยังไม่ได้รัน single-device.sql → ถอยเป็นโหมดเดิม (ล็อกอินซ้อนได้) ดีกว่าล็อกอินไม่ได้
    if (error) { try { localStorage.removeItem(KEY) } catch { /* ignore */ } }
  })()
  claiming = run
  void run.finally(() => { if (claiming === run) claiming = null })
  return run
}

/** true = เครื่องนี้ยังเป็นเจ้าของบัญชี · false = มีเครื่องอื่นล็อกอินซ้อน ต้องออกจากระบบ */
export async function verifyDeviceSession(userId: string): Promise<boolean> {
  if (claiming) { await claiming; return true }
  const { data, error } = await supabase
    .from('profiles')
    .select('current_session_id')
    .eq('id', userId)
    .single()
  if (error) return true // อ่านไม่ได้ (เน็ตหลุด/ยังไม่รัน SQL) — อย่าเพิ่งเด้งผู้ใช้ออก
  const dbId = (data as { current_session_id?: string | null }).current_session_id ?? null
  const localId = getLocalId()
  // ยังไม่เคยจด (บัญชีเก่าก่อนมีระบบนี้) หรือเครื่องนี้เพิ่งล้าง storage ทั้งที่ session ยังอยู่
  // → ถือว่าเครื่องนี้คือเครื่องที่ใช้งานล่าสุด จดทับไปเลย
  if (!dbId || !localId) {
    await claimDeviceSession()
    return true
  }
  return dbId === localId
}

/**
 * เฝ้าดูว่ามีเครื่องอื่นล็อกอินซ้อนมั้ย — realtime เด้งทันที + เช็คซ้ำทุก 60 วิ
 * และตอนสลับกลับมาที่แท็บ/แอป (กันกรณี realtime ต่อไม่ติด) · คืน cleanup
 */
export function watchDeviceSession(userId: string, onKicked: () => void): () => void {
  let stopped = false
  const kick = () => {
    if (stopped) return
    stopped = true
    onKicked()
  }
  const check = () => {
    if (stopped) return
    void verifyDeviceSession(userId).then((ok) => { if (!ok) kick() })
  }
  check()
  const channel = supabase
    .channel(`device-session-${userId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
      (payload) => {
        const next = (payload.new as { current_session_id?: string | null }).current_session_id
        if (next && !claiming && next !== getLocalId()) kick()
      },
    )
    .subscribe()
  const poll = window.setInterval(check, 60_000)
  const onVisible = () => { if (document.visibilityState === 'visible') check() }
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    stopped = true
    window.clearInterval(poll)
    document.removeEventListener('visibilitychange', onVisible)
    void supabase.removeChannel(channel)
  }
}
