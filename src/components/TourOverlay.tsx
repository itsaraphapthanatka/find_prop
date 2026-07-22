import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { markTourSeen, tourSeen, type TourStep } from '../lib/tour'

const PAD = 6 // ระยะเผื่อรอบจุดที่ไฮไลต์
const TW = 300 // ความกว้างการ์ดคำอธิบาย
const TH = 200 // ความสูงโดยประมาณ (ใช้ตัดสินวางบน/ล่าง)

export default function TourOverlay({ steps }: { steps: TourStep[] }) {
  const [active, setActive] = useState(false)
  const [idx, setIdx] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const navigate = useNavigate()
  const location = useLocation()

  const begin = useCallback(() => {
    if (steps.length === 0) return
    setIdx(0)
    setRect(null)
    setActive(true)
  }, [steps.length])

  const finish = useCallback(() => {
    markTourSeen()
    setActive(false)
    setRect(null)
  }, [])

  // เริ่มจากปุ่ม "?" (event) + เล่นอัตโนมัติครั้งแรกถ้ายังไม่เคยดู
  useEffect(() => {
    const onStart = () => begin()
    window.addEventListener('hop-start-tour', onStart)
    let t: number | undefined
    if (!tourSeen()) t = window.setTimeout(begin, 700)
    return () => {
      window.removeEventListener('hop-start-tour', onStart)
      if (t) clearTimeout(t)
    }
  }, [begin])

  // เปลี่ยนขั้น: ไปหน้าเป้าหมาย → รอจุดโผล่ → ไฮไลต์ (ไม่เจอใน ~2 วิ = ข้าม)
  useEffect(() => {
    if (!active) return
    const step = steps[idx]
    if (!step) return
    let cancelled = false

    if (step.route && location.pathname !== step.route) navigate(step.route)
    setRect(null)
    if (!step.target) return // การ์ดกลางจอ

    let tries = 0
    const tick = () => {
      if (cancelled) return
      const el = document.querySelector(step.target!) as HTMLElement | null
      if (el && el.getBoundingClientRect().width > 0) {
        el.scrollIntoView({ block: 'center', inline: 'nearest' })
        requestAnimationFrame(() => {
          if (!cancelled) setRect(el.getBoundingClientRect())
        })
        return
      }
      if (++tries > 40) {
        // ไม่พบจุด (ไม่มีข้อมูล/สิทธิ์) → ข้ามไปขั้นถัดไป หรือจบถ้าเป็นขั้นสุดท้าย
        if (!cancelled) setIdx((i) => (i + 1 < steps.length ? i + 1 : i))
        if (!cancelled && idx + 1 >= steps.length) finish()
        return
      }
      window.setTimeout(tick, 50)
    }
    const startId = window.setTimeout(tick, 80)
    return () => {
      cancelled = true
      clearTimeout(startId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, idx, steps])

  // ตามจุดเป้าหมายเมื่อ resize/scroll
  useEffect(() => {
    if (!active) return
    const step = steps[idx]
    if (!step?.target) return
    const follow = () => {
      const el = document.querySelector(step.target!) as HTMLElement | null
      if (el) setRect(el.getBoundingClientRect())
    }
    window.addEventListener('resize', follow)
    window.addEventListener('scroll', follow, true)
    return () => {
      window.removeEventListener('resize', follow)
      window.removeEventListener('scroll', follow, true)
    }
  }, [active, idx, steps])

  if (!active) return null
  const step = steps[idx]
  if (!step) return null

  const next = () => (idx + 1 < steps.length ? setIdx(idx + 1) : finish())
  const back = () => setIdx((i) => Math.max(0, i - 1))

  // ตำแหน่งการ์ด: ไม่มีจุด = กลางจอ · มีจุด = ใต้จุด (ถ้าไม่พอวางบน) แล้ว clamp ในจอ
  const vw = window.innerWidth
  const vh = window.innerHeight
  let cardStyle: CSSProperties
  if (!rect) {
    cardStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  } else {
    const below = rect.bottom + 12
    const placeAbove = below + TH > vh
    const top = placeAbove ? Math.max(12, rect.top - TH - 12) : below
    const left = Math.min(Math.max(12, rect.left), vw - TW - 12)
    cardStyle = { top, left }
  }

  return createPortal(
    <div className="tour-root" role="dialog" aria-modal="true">
      {/* ฉากหลังกันคลิกทะลุ — โปร่งตอนมีสปอตไลต์ (สปอตไลต์เป็นตัวหรี่จอ), มืดตอนการ์ดกลางจอ */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9000,
          background: rect ? 'transparent' : 'rgba(16,17,20,0.55)',
        }}
        onClick={(e) => e.stopPropagation()}
      />

      {/* สปอตไลต์ */}
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
            transition: 'all .2s ease',
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
