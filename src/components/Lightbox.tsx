// ดูรูปเต็มจอ — ซูมเข้า/ออก ลากดู และเลื่อนไปรูปถัดไปได้
// ใช้ pointer events ตัวเดียวคุมทั้ง เมาส์ / นิ้ว / ปากกา (ไม่พึ่งไลบรารีภายนอก)
//   · นิ้วเดียวตอนยังไม่ซูม = ปัดเปลี่ยนรูป · นิ้วเดียวตอนซูมแล้ว = ลากดูส่วนที่ล้นจอ
//   · สองนิ้ว = หนีบซูม (ซูมเข้าหาจุดกลางระหว่างสองนิ้ว)
//   · แตะสองครั้ง / ดับเบิลคลิก = สลับซูม · ล้อเมาส์ = ซูมเข้าหาตำแหน่งเมาส์
//   · คีย์บอร์ด: Esc ปิด · ←/→ เปลี่ยนรูป · +/− ซูม · 0 รีเซ็ต
import { useCallback, useEffect, useRef, useState } from 'react'
import { IconClose, IconDown, IconUp } from './icons'

const MAX_SCALE = 4
const SWIPE_PX = 60          // ระยะปัดขั้นต่ำที่ถือว่าเปลี่ยนรูป
const DOUBLE_TAP_MS = 300
const ZOOM_STEP = 1.6

interface Props {
  images: string[]
  /** รูปที่เปิดขึ้นมาก่อน */
  startIndex?: number
  /** ข้อความกำกับ (เช่นรหัสทรัพย์) */
  label?: string
  onClose: () => void
}

export default function Lightbox({ images, startIndex = 0, label, onClose }: Props) {
  const [i, setI] = useState(Math.min(Math.max(startIndex, 0), Math.max(images.length - 1, 0)))
  const [scale, setScale] = useState(1)
  const [t, setT] = useState({ x: 0, y: 0 })
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)

  const stageRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  // pointer ที่กดอยู่ (รองรับหลายนิ้ว) + สถานะเริ่มต้นของ gesture
  const pts = useRef(new Map<number, { x: number; y: number }>())
  const start = useRef({ dist: 0, scale: 1, tx: 0, ty: 0, x: 0, y: 0, moved: false })
  const lastTap = useRef(0)

  const zoomed = scale > 1.01
  const many = images.length > 1

  /** ไม่ให้ลากรูปหลุดออกนอกจอ — ขอบเขตคือครึ่งหนึ่งของส่วนที่ล้นจากการซูม */
  const clamp = useCallback((x: number, y: number, s: number) => {
    const el = stageRef.current
    if (!el) return { x, y }
    const mx = Math.max(0, (el.clientWidth * (s - 1)) / 2)
    const my = Math.max(0, (el.clientHeight * (s - 1)) / 2)
    return { x: Math.min(mx, Math.max(-mx, x)), y: Math.min(my, Math.max(-my, y)) }
  }, [])

  /** ซูมโดยตรึงจุด (px, py) บนหน้าจอไว้กับเนื้อรูปเดิม — ซูมแล้วไม่กระโดด */
  const zoomAbout = useCallback((px: number, py: number, next: number) => {
    const el = stageRef.current
    if (!el) return
    const s2 = Math.min(MAX_SCALE, Math.max(1, next))
    const r = el.getBoundingClientRect()
    const dx = px - (r.left + r.width / 2)
    const dy = py - (r.top + r.height / 2)
    setT((cur) => {
      if (s2 === 1) return { x: 0, y: 0 }
      const ratio = s2 / scale
      return clamp(dx - ratio * (dx - cur.x), dy - ratio * (dy - cur.y), s2)
    })
    setScale(s2)
  }, [scale, clamp])

  const reset = useCallback(() => {
    setScale(1)
    setT({ x: 0, y: 0 })
  }, [])

  const go = useCallback((d: number) => {
    setI((cur) => {
      const n = cur + d
      if (n < 0 || n > images.length - 1) return cur
      return n
    })
    reset()
  }, [images.length, reset])

  // ปุ่มคีย์บอร์ด + ล็อกการเลื่อนหน้าหลังไว้ระหว่างเปิดดูรูป
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === '+' || e.key === '=') setScale((s) => Math.min(MAX_SCALE, s * ZOOM_STEP))
      else if (e.key === '-' || e.key === '_') { const s = Math.max(1, scale / ZOOM_STEP); setScale(s); if (s === 1) setT({ x: 0, y: 0 }) }
      else if (e.key === '0') reset()
    }
    // capture: กัน Esc ไปโดนการ์ดรายละเอียดที่อยู่ข้างหลังปิดไปพร้อมกัน
    window.addEventListener('keydown', onKey, true)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prev
    }
  }, [onClose, go, reset, scale])

  function onPointerDown(e: React.PointerEvent) {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const list = [...pts.current.values()]
    if (list.length === 2) {
      start.current.dist = Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y)
      start.current.scale = scale
      start.current.tx = t.x
      start.current.ty = t.y
    } else if (list.length === 1) {
      start.current = { ...start.current, x: e.clientX, y: e.clientY, tx: t.x, ty: t.y, moved: false }
      setDragging(true)
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pts.current.has(e.pointerId)) return
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const list = [...pts.current.values()]

    if (list.length >= 2) {
      // หนีบซูม — เทียบระยะสองนิ้วกับตอนเริ่ม
      const d = Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y)
      if (start.current.dist > 0) {
        const mx = (list[0].x + list[1].x) / 2
        const my = (list[0].y + list[1].y) / 2
        zoomAbout(mx, my, start.current.scale * (d / start.current.dist))
      }
      start.current.moved = true
      return
    }

    const dx = e.clientX - start.current.x
    const dy = e.clientY - start.current.y
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) start.current.moved = true

    if (zoomed) {
      setT(clamp(start.current.tx + dx, start.current.ty + dy, scale))
    } else if (many) {
      setDragX(dx)
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pts.current.delete(e.pointerId)
    if (pts.current.size > 0) return
    setDragging(false)

    // ปัดเปลี่ยนรูป (เฉพาะตอนยังไม่ซูม)
    if (!zoomed && many && Math.abs(dragX) > SWIPE_PX) {
      go(dragX < 0 ? 1 : -1)
    }
    setDragX(0)

    // แตะสองครั้ง = สลับซูม (ต้องไม่ใช่การลาก)
    if (!start.current.moved) {
      const now = Date.now()
      if (now - lastTap.current < DOUBLE_TAP_MS) {
        lastTap.current = 0
        if (zoomed) reset()
        else zoomAbout(e.clientX, e.clientY, 2.5)
      } else {
        lastTap.current = now
      }
    }
    start.current.dist = 0
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    const next = e.deltaY < 0 ? scale * 1.15 : scale / 1.15
    zoomAbout(e.clientX, e.clientY, next)
  }

  if (images.length === 0) return null

  return (
    <div className="lb" role="dialog" aria-modal="true" aria-label={`รูป${label ? ` ${label}` : ''}`}>
      <div className="lb-bar">
        <span className="lb-count">
          {label && <b>{label}</b>}
          {many && <> {i + 1} / {images.length}</>}
        </span>
        <div className="lb-tools">
          <button className="lb-btn" title="ซูมออก (−)" aria-label="ซูมออก"
            onClick={() => { const s = Math.max(1, scale / ZOOM_STEP); setScale(s); if (s === 1) setT({ x: 0, y: 0 }) }}>−</button>
          <button className="lb-btn" title="ซูมเข้า (+)" aria-label="ซูมเข้า"
            onClick={() => setScale((s) => Math.min(MAX_SCALE, s * ZOOM_STEP))}>+</button>
          <button className="lb-btn" title="ขนาดพอดีจอ (0)" aria-label="ขนาดพอดีจอ"
            onClick={reset} disabled={!zoomed}>{Math.round(scale * 100)}%</button>
          <button ref={closeRef} className="lb-btn" title="ปิด (Esc)" aria-label="ปิด" onClick={onClose}>
            <IconClose size={18} />
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        className={`lb-stage ${zoomed ? 'zoomed' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        /* ไม่ใช้ onDoubleClick — pointer events ครอบทั้งเมาส์และนิ้วอยู่แล้ว
           ถ้าใส่ทั้งสองทาง ดับเบิลคลิกจะถูกนับ 2 ครั้ง (ย่อแล้วขยายกลับทันที) */
      >
        <div
          className="lb-track"
          style={{
            transform: `translateX(calc(${-i * 100}% + ${dragX}px))`,
            transition: dragging ? 'none' : 'transform 0.24s ease',
          }}
        >
          {images.map((src, idx) => (
            <div className="lb-slide" key={idx}>
              <img
                src={src}
                alt={`${label ?? 'รูป'} ${idx + 1}`}
                draggable={false}
                style={idx === i && zoomed
                  ? { transform: `translate(${t.x}px, ${t.y}px) scale(${scale})` }
                  : undefined}
              />
            </div>
          ))}
        </div>
      </div>

      {many && (
        <>
          {/* ปุ่มเลื่อนสำหรับเมาส์/คีย์บอร์ด — บนมือถือใช้ปัดนิ้วได้เลย */}
          <button className="lb-nav prev" title="รูปก่อนหน้า (←)" aria-label="รูปก่อนหน้า"
            onClick={() => go(-1)} disabled={i === 0}><IconUp size={20} /></button>
          <button className="lb-nav next" title="รูปถัดไป (→)" aria-label="รูปถัดไป"
            onClick={() => go(1)} disabled={i === images.length - 1}><IconDown size={20} /></button>
          <div className="lb-dots">
            {images.map((_, idx) => (
              <button key={idx} className={`lb-dot ${idx === i ? 'on' : ''}`} aria-label={`ไปรูปที่ ${idx + 1}`}
                onClick={() => { setI(idx); reset() }} />
            ))}
          </div>
        </>
      )}
      <div className="lb-hint">{zoomed ? 'ลากเพื่อเลื่อนดู · แตะสองครั้งเพื่อย่อ' : 'แตะสองครั้งหรือหนีบสองนิ้วเพื่อซูม'}</div>
    </div>
  )
}
