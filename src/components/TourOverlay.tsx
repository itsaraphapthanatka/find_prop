import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { TOUR_STEPS, markTourSeen, tourSeen, type TourStep } from '../lib/tour'

const PAD = 6 // ระยะเผื่อรอบจุดที่ไฮไลต์
const TW = 300 // ความกว้างการ์ดคำอธิบาย
const TH = 190 // ความสูงโดยประมาณ (ใช้ตัดสินวางบน/ล่าง)

/** เลือกเฉพาะขั้นที่จุดเป้าหมาย "มีจริงและมองเห็นได้" ในหน้านี้ (ตามบทบาท/มือถือ) */
function availableSteps(): TourStep[] {
  return TOUR_STEPS.filter((s) => {
    if (!s.target) return true
    const el = document.querySelector(s.target) as HTMLElement | null
    return !!el && el.getBoundingClientRect().width > 0
  })
}

export default function TourOverlay() {
  const [active, setActive] = useState(false)
  const [steps, setSteps] = useState<TourStep[]>([])
  const [idx, setIdx] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)

  const begin = useCallback(() => {
    const avail = availableSteps()
    if (avail.length === 0) return
    setSteps(avail)
    setIdx(0)
    setActive(true)
  }, [])

  // เริ่มจากปุ่ม "?" (event) + เล่นอัตโนมัติครั้งแรกถ้ายังไม่เคยดู
  useEffect(() => {
    const onStart = () => begin()
    window.addEventListener('hop-start-tour', onStart)
    let t: number | undefined
    if (!tourSeen()) t = window.setTimeout(begin, 600)
    return () => {
      window.removeEventListener('hop-start-tour', onStart)
      if (t) clearTimeout(t)
    }
  }, [begin])

  const step: TourStep | undefined = steps[idx]

  // วัดตำแหน่งจุดเป้าหมาย + อัปเดตเมื่อ resize/scroll
  useLayoutEffect(() => {
    if (!active || !step) return
    const compute = () => {
      if (!step.target) return setRect(null)
      const el = document.querySelector(step.target) as HTMLElement | null
      if (!el) return setRect(null)
      setRect(el.getBoundingClientRect())
    }
    compute()
    window.addEventListener('resize', compute)
    window.addEventListener('scroll', compute, true)
    return () => {
      window.removeEventListener('resize', compute)
      window.removeEventListener('scroll', compute, true)
    }
  }, [active, step])

  if (!active || !step) return null

  const finish = () => {
    markTourSeen()
    setActive(false)
  }
  const next = () => (idx + 1 < steps.length ? setIdx(idx + 1) : finish())
  const back = () => setIdx((i) => Math.max(0, i - 1))

  // ตำแหน่งการ์ด: ไม่มีเป้าหมาย = กลางจอ · มีเป้าหมาย = ใต้จุด (ถ้าไม่พอวางบน) แล้ว clamp ในจอ
  const vw = window.innerWidth
  const vh = window.innerHeight
  let cardStyle: CSSProperties
  if (!rect) {
    cardStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  } else {
    const below = rect.bottom + 12
    const above = below + TH > vh
    const top = above ? Math.max(12, rect.top - TH - 12) : below
    const left = Math.min(Math.max(12, rect.left), vw - TW - 12)
    cardStyle = { top, left }
  }

  return createPortal(
    <div className="tour-root" role="dialog" aria-modal="true">
      {/* ฉากหลังกันคลิกทะลุ — โปร่งใสตอนมีสปอตไลต์ (สปอตไลต์เป็นตัวหรี่จอ), มืดตอนการ์ดกลางจอ */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9000,
          background: rect ? 'transparent' : 'rgba(16,17,20,0.55)',
          cursor: 'default',
        }}
        onClick={(e) => e.stopPropagation()}
      />

      {/* สปอตไลต์: กล่องโปร่งครอบจุดเป้าหมาย + เงายักษ์หรี่ส่วนที่เหลือทั้งจอ */}
      {rect && (
        <div
          style={{
            position: 'fixed',
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            borderRadius: 12,
            boxShadow: '0 0 0 9999px rgba(16,17,20,0.55)',
            outline: '2px solid var(--purple)',
            outlineOffset: 2,
            pointerEvents: 'none',
            transition: 'all .22s ease',
            zIndex: 9001,
          }}
        />
      )}

      {/* การ์ดคำอธิบาย */}
      <div
        style={{
          position: 'fixed',
          width: TW,
          maxWidth: 'calc(100vw - 24px)',
          background: '#fff',
          color: 'var(--ink)',
          borderRadius: 14,
          boxShadow: 'var(--shadow-lg)',
          padding: '15px 16px 13px',
          zIndex: 9002,
          ...cardStyle,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{step.title}</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--muted)' }}>{step.body}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {idx + 1} / {steps.length}
          </span>
          <span style={{ flex: 1 }} />
          {idx > 0 && (
            <button className="btn sm" onClick={back}>
              ย้อน
            </button>
          )}
          {idx < steps.length - 1 && (
            <button className="btn sm" onClick={finish}>
              ข้าม
            </button>
          )}
          <button className="btn sm primary" onClick={next}>
            {idx + 1 < steps.length ? 'ถัดไป' : 'เริ่มใช้งาน'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
