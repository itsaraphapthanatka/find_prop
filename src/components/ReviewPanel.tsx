import { useState } from 'react'
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

/** ปุ่มรีวิวลอย — โผล่เฉพาะตอน super เปิดโหมดรีวิว (review_mode = on) */
export default function ReviewPanel() {
  const on = useReviewMode()
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<Record<string, ItemState>>({})

  if (!on) return null

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
      <button className="review-fab" onClick={() => setOpen(true)} title="รีวิว/ทดสอบระบบ">
        📝 รีวิว
      </button>
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
