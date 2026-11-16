// "มีเวอร์ชันใหม่" — เช็คซ้ำทุกครั้งที่กลับเข้าแอป/แท็บ ไม่ใช่แค่ตอนเปิดครั้งแรก
// เหตุ (2026-11-16 "version mobile ไม่เท่า version desktop"): มือถือแทบไม่เคยปิดแอป/แท็บจริง
// แค่สลับไปมา → เดิมเช็คอัปเดตเฉพาะตอนเปิดครั้งแรก จึงค้างรุ่นเก่าได้หลายวัน
// ขณะที่จอคอมรีเฟรชบ่อยเลยได้รุ่นใหม่ก่อนเสมอ
// ใช้ทั้งเว็บ/PWA (main.tsx) และแอป Capacitor (lib/appUpdate.ts) · แถบแจ้งอยู่ใน App.tsx

const MIN_GAP_MS = 5 * 60_000 // เว้นระยะเช็คอย่างน้อย 5 นาที (สลับแอปถี่ๆ ไม่ยิงซ้ำ)
const POLL_MS = 30 * 60_000 // เปิดค้างหน้าจอไว้นานๆ ก็เช็คทุก 30 นาที

/** เรียก fn เมื่อกลับมาที่หน้าจอ (visibility) + ทุก 30 นาทีระหว่างเปิดค้าง
    คืนฟังก์ชันสั่งเช็คเอง (ใช้กับอีเวนต์ resume ของแอป) — ทุกทางผ่านตัวเว้นระยะเดียวกัน */
export function onReturn(fn: () => Promise<void> | void): () => void {
  let last = Date.now() // ตอนเปิดแอปมีการเช็ครอบแรกอยู่แล้ว
  const run = () => {
    if (document.visibilityState !== 'visible' || Date.now() - last < MIN_GAP_MS) return
    last = Date.now()
    void Promise.resolve().then(fn).catch(() => {}) // พลาดก็เงียบไว้ รอบหน้าลองใหม่เอง
  }
  document.addEventListener('visibilitychange', run)
  window.setInterval(run, POLL_MS)
  return run
}

/** แจ้ง App.tsx ให้โชว์แถบ "มีเวอร์ชันใหม่" — apply = สลับไปใช้ทันที (ไม่กดก็ได้รุ่นใหม่ตอนเปิดครั้งหน้า) */
export function announceUpdate(apply: () => void) {
  window.dispatchEvent(new CustomEvent('hob-update-ready', { detail: { apply } }))
}

/** เว็บ/PWA: เทียบเวลา build ใน /app-update.json (ไม่อยู่ใน precache ของ SW) กับโค้ดที่รันอยู่ */
export function watchWebUpdates(getReg: () => ServiceWorkerRegistration | undefined) {
  let announced = false
  onReturn(async () => {
    if (announced) return
    const res = await fetch('/app-update.json', { cache: 'no-store' })
    if (!res.ok) return
    const m = (await res.json()) as { builtAt?: number }
    if (!m.builtAt || m.builtAt <= __BUILT_AT__) return
    announced = true
    announceUpdate(() => {
      void (async () => {
        // ให้ SW ดึงชุดใหม่ก่อน (autoUpdate จะ skipWaiting แล้วโหลดหน้าใหม่ให้เองด้วย) · ไม่มี SW ก็โหลดใหม่เฉยๆ
        try { await getReg()?.update() } catch { /* ignore */ }
        location.reload()
      })()
    })
  })
}
