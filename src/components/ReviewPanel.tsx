import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import { CHECKPOINTS, submitReview, useReviewMode, type Checkpoint, type ReviewStatus } from '../lib/review'
import { IconClose } from './icons'

interface ItemState {
  status?: ReviewStatus
  comment: string
  busy?: boolean
  done?: boolean
}

const STATUS: { key: ReviewStatus; label: string }[] = [
  { key: 'pass', label: '✅ ผ่าน' },
  { key: 'fail', label: '❌ ไม่ผ่าน' },
  { key: 'note', label: '⚠️ สังเกต' },
]

// ซ่อนปุ่มชั่วคราวได้ 1 ชั่วโมง + ลากย้ายตำแหน่งได้ (จำทั้งคู่ไว้ใน localStorage เฉพาะเครื่องนั้น)
const HIDE_MS = 3600e3
const HIDE_KEY = 'hop_review_hide_until'
const POS_KEY = 'hop_review_fab_pos'

/** ปุ่มรีวิวลอย — โผล่เฉพาะตอน super เปิดโหมดรีวิว (review_mode = on) */
export default function ReviewPanel() {
  const on = useReviewMode()
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<Record<string, ItemState>>({})

  // ── ซ่อนชั่วคราว (ทุกคนกดได้) — ครบ 1 ชม. โผล่กลับเอง แม้รีโหลดหน้าก็ยังนับต่อ ──
  const [hiddenUntil, setHiddenUntil] = useState<number>(() => {
    try { return Number(localStorage.getItem(HIDE_KEY) ?? 0) } catch { return 0 }
  })
  useEffect(() => {
    const left = hiddenUntil - Date.now()
    if (left <= 0) return
    const t = window.setTimeout(() => setHiddenUntil(0), left)
    return () => window.clearTimeout(t)
  }, [hiddenUntil])

  // ── ลากย้ายตำแหน่ง — ตำแหน่งเก็บเป็นมุมซ้ายบน (px) · null = ตำแหน่งมาตรฐาน (มุมล่างซ้าย) ──
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null') as { x: number; y: number } | null
      return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? v : null
    } catch { return null }
  })
  const wrapRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ dx: number; dy: number; sx: number; sy: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)

  const clampPos = (x: number, y: number) => {
    const r = wrapRef.current?.getBoundingClientRect()
    const w = r?.width ?? 100
    const h = r?.height ?? 44
    return {
      x: Math.min(Math.max(4, x), window.innerWidth - w - 4),
      y: Math.min(Math.max(4, y), window.innerHeight - h - 4),
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const r = wrapRef.current?.getBoundingClientRect()
    if (!r) return
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, sx: e.clientX, sy: e.clientY, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d) return
    // ขยับเกิน 6px ถึงนับเป็นการลาก — ไม่งั้นถือว่าตั้งใจ "กด"
    if (!d.moved && Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) < 6) return
    d.moved = true
    setPos(clampPos(e.clientX - d.dx, e.clientY - d.dy))
  }
  function onPointerUp() {
    const d = drag.current
    drag.current = null
    if (!d?.moved) return
    suppressClick.current = true // กันคลิกเปิดแผงหลังปล่อยจากการลาก
    setPos((p) => {
      try { if (p) localStorage.setItem(POS_KEY, JSON.stringify(p)) } catch { /* ข้าม */ }
      return p
    })
  }

  function hideTemporarily(e: React.MouseEvent) {
    e.stopPropagation()
    const until = Date.now() + HIDE_MS
    try { localStorage.setItem(HIDE_KEY, String(until)) } catch { /* ข้าม */ }
    setHiddenUntil(until)
    setOpen(false)
  }

  if (!on) return null
  if (hiddenUntil > Date.now()) return null

  const reviewerName = profile?.full_name || profile?.email || null
  const get = (id: string): ItemState => state[id] ?? { comment: '' }
  const patch = (id: string, p: Partial<ItemState>) =>
    setState((s) => ({ ...s, [id]: { ...get(id), ...p } }))

  async function send(cp: Checkpoint) {
    const st = get(cp.id)
    if (!st.status) {
      alert('เลือกสถานะก่อน (ผ่าน/ไม่ผ่าน/สังเกต)')
      return
    }
    patch(cp.id, { busy: true })
    const err = await submitReview(cp, st.status, st.comment, reviewerName)
    if (err) {
      patch(cp.id, { busy: false })
      alert(`ส่งรีวิวไม่สำเร็จ: ${err}`)
      return
    }
    patch(cp.id, { busy: false, done: true })
  }

  const flows = [...new Set(CHECKPOINTS.map((c) => c.flow))]

  return (
    <>
      <div
        ref={wrapRef}
        className="review-fab-wrap"
        style={pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <button
          className="review-fab"
          title="รีวิว/ทดสอบระบบ — ลากเพื่อย้ายตำแหน่ง"
          onClick={() => {
            if (suppressClick.current) { suppressClick.current = false; return }
            setOpen(true)
          }}
        >
          <span className="rf-emoji">📝</span>
          <span className="rf-label">รีวิว</span>
        </button>
        <button className="review-fab-x" title="ซ่อนชั่วคราว 1 ชั่วโมง" onClick={hideTemporarily}>✕</button>
      </div>
      {open && (
        <div className="review-overlay" onClick={() => setOpen(false)}>
          <aside className="review-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="review-head">
              <div>
                <div className="rv-title">รีวิวการทดสอบระบบ</div>
                <div className="rv-sub">เลือกสถานะ + ใส่ comment แล้วกดส่ง (ปิดท้ายแต่ละ journey)</div>
              </div>
              <button className="icon-btn" onClick={() => setOpen(false)} title="ปิด"><IconClose /></button>
            </div>
            <div className="review-body">
              {flows.map((flow) => (
                <div key={flow}>
                  <div className="rv-group">{flow}</div>
                  {CHECKPOINTS.filter((c) => c.flow === flow).map((cp) => {
                    const st = get(cp.id)
                    return (
                      <div key={cp.id} className={`rv-item ${st.done ? 'done' : ''}`}>
                        <div className="rv-label">
                          {cp.label}
                          {cp.critical && <span className="rv-crit">critical</span>}
                        </div>
                        <div className="rv-expect">คาดหวัง: {cp.expect}</div>
                        <div className="rv-status">
                          {STATUS.map((s) => (
                            <button
                              key={s.key}
                              type="button"
                              className={`rv-st ${st.status === s.key ? `on ${s.key}` : ''}`}
                              onClick={() => patch(cp.id, { status: s.key, done: false })}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                        <textarea
                          className="rv-comment"
                          placeholder="ผลจริง / comment (ถ้ามี)"
                          value={st.comment}
                          onChange={(e) => patch(cp.id, { comment: e.target.value, done: false })}
                        />
                        <button
                          type="button"
                          className={`btn sm ${st.done ? '' : 'primary'}`}
                          disabled={st.busy}
                          onClick={() => void send(cp)}
                        >
                          {st.done ? '✓ ส่งแล้ว (ส่งซ้ำได้)' : st.busy ? 'กำลังส่ง…' : 'ส่งรีวิว'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
