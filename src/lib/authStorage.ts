// ที่เก็บ session ของการล็อกอิน — เลือกได้ว่า "จำการเข้าสู่ระบบในเครื่องนี้" หรือไม่
//
//   จำไว้ (ค่าเริ่มต้น) = localStorage → ปิดเบราว์เซอร์แล้วเปิดใหม่ยังล็อกอินอยู่
//   ไม่จำ (เครื่องสาธารณะ) = sessionStorage → ปิดแท็บ/เบราว์เซอร์ = ออกจากระบบเอง
//
// อ่านค่าธงทุกครั้งที่เขียน จึงสลับโหมดได้โดยไม่ต้องสร้าง client ใหม่

const FLAG = 'hop_remember'

/** true = ให้จำการเข้าสู่ระบบไว้ในเครื่องนี้ (ค่าเริ่มต้น) */
export function rememberMe(): boolean {
  try {
    return localStorage.getItem(FLAG) !== '0'
  } catch {
    return true
  }
}

/** ตั้งก่อนเรียกล็อกอิน — false = เก็บ session ไว้แค่ในแท็บนี้ */
export function setRememberMe(on: boolean): void {
  try {
    if (on) localStorage.removeItem(FLAG)
    else localStorage.setItem(FLAG, '0')
  } catch { /* เบราว์เซอร์ปิด storage — ใช้ค่าเริ่มต้น (จำไว้) */ }
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/**
 * storage adapter ที่ส่งให้ supabase-js
 * - อ่าน: หาใน sessionStorage ก่อน (โหมดไม่จำ) แล้วค่อย localStorage — ย้ายโหมดแล้ว session เดิมยังใช้ได้
 * - เขียน: ลงที่ที่เลือก และลบอีกฝั่งทิ้ง เพื่อไม่ให้ session ค้างในเครื่องตอนเลือก "ไม่จำ"
 * - ลบ: ลบทั้งสองฝั่ง
 */
export function makeAuthStorage(
  local: Store | null = typeof window === 'undefined' ? null : window.localStorage,
  session: Store | null = typeof window === 'undefined' ? null : window.sessionStorage,
  remember: () => boolean = rememberMe,
): Store {
  const safe = <T,>(fn: () => T, fallback: T): T => {
    try { return fn() } catch { return fallback }
  }
  return {
    getItem: (k) => safe(() => session?.getItem(k) ?? local?.getItem(k) ?? null, null),
    setItem: (k, v) => {
      const keep = remember()
      safe(() => {
        if (keep) { local?.setItem(k, v); session?.removeItem(k) }
        else { session?.setItem(k, v); local?.removeItem(k) }
      }, undefined)
    },
    removeItem: (k) => safe(() => { local?.removeItem(k); session?.removeItem(k) }, undefined),
  }
}
