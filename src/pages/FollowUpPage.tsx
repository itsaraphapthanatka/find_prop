import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// นัดติดตาม (follow-up) — ติดตามลูกค้า/เจ้าของทรัพย์ ครบกำหนดวันไหน เสร็จหรือยัง
// ตาราง follow_ups (supabase/follow-ups.sql) · แจ้งเตือน push ตอน 07:00 โดย api/push-cron.js

interface FollowUp {
  id: string
  property_id: string | null
  title: string
  note: string | null
  due_date: string
  status: 'pending' | 'done'
  result: string | null // ผลการติดตาม เช่น "โทรไม่รับ"
  done_at: string | null
  created_by: string | null
  created_at: string
}
interface PropLite {
  id: string
  code: string
  district: string | null
  property_type: string | null
}

type Tab = 'due' | 'upcoming' | 'done'

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })

export default function FollowUpPage() {
  const today = new Date().toISOString().slice(0, 10)
  const [rows, setRows] = useState<FollowUp[]>([])
  const [props, setProps] = useState<PropLite[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('due')
  const [busyId, setBusyId] = useState<string | null>(null)
  // แผงปิดนัดแบบ inline: พิมพ์ผลครั้งเดียว → เลือก "จบเรื่อง" หรือ "ตามต่อ" (ไม่มี popup)
  const tomorrow = new Date(Date.now() + 86400e3).toISOString().slice(0, 10)
  const [closing, setClosing] = useState<{ id: string; result: string; nextDate: string } | null>(null)

  // ฟอร์มเพิ่มนัดใหม่
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState(today)
  const [propertyId, setPropertyId] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function reload() {
    setLoading(true)
    const [fuRes, pRes, mRes] = await Promise.all([
      supabase.from('follow_ups').select('*').order('due_date').order('created_at'),
      supabase.from('properties').select('id, code, district, property_type'),
      supabase.rpc('org_member_names'),
    ])
    if (fuRes.error) {
      setError(
        fuRes.error.message.includes('follow_ups')
          ? 'ยังไม่ได้ติดตั้งระบบนัดติดตาม — รัน supabase/follow-ups.sql ใน SQL Editor ก่อน'
          : fuRes.error.message,
      )
    } else {
      setError(null)
      setRows((fuRes.data ?? []) as FollowUp[])
    }
    setProps(((pRes.data ?? []) as PropLite[]).sort((a, b) => a.code.localeCompare(b.code, 'th')))
    // RPC ยังไม่ติดตั้งก็แค่ไม่โชว์ชื่อผู้สร้าง — ไม่ทำให้หน้าพัง
    setNames(new Map(((mRes.data ?? []) as { id: string; name: string }[]).map((m) => [m.id, m.name])))
    setLoading(false)
  }
  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const propById = useMemo(() => new Map(props.map((p) => [p.id, p])), [props])

  const due = rows.filter((r) => r.status === 'pending' && r.due_date <= today)
  const upcoming = rows.filter((r) => r.status === 'pending' && r.due_date > today)
  const done = rows
    .filter((r) => r.status === 'done')
    .sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''))
  const shown = tab === 'due' ? due : tab === 'upcoming' ? upcoming : done

  /** เพิ่มนัดล่วงหน้า (pending) หรือบันทึกสิ่งที่ทำไปแล้วลงประวัติทันที (done) */
  async function addFollowUp(mode: 'pending' | 'done') {
    if (!title.trim()) return
    setSaving(true)
    // "บันทึกผลเลย" = ลงประวัติทันที — ช่องโน้ตกลายเป็น "ผลที่ได้" · เพิ่มนัดปกติ = โน้ตแนบนัด
    const { error } = await supabase.from('follow_ups').insert({
      title: title.trim(),
      due_date: mode === 'done' ? today : dueDate,
      property_id: propertyId || null,
      note: mode === 'pending' ? note.trim() || null : null,
      result: mode === 'done' ? note.trim() || null : null,
      status: mode,
      done_at: mode === 'done' ? new Date().toISOString() : null,
    })
    setSaving(false)
    if (error) {
      alert(`เพิ่มนัดไม่สำเร็จ: ${error.message}`)
      return
    }
    setTitle('')
    setNote('')
    setPropertyId('')
    setDueDate(today)
    await reload()
  }

  /** ปิดนัดด้วยผลที่พิมพ์ไว้ — mode 'again' = สร้างนัดรอบถัดไปให้ด้วย (ประวัติเดิมคงอยู่เสมอ) */
  async function saveClose(r: FollowUp, mode: 'end' | 'again') {
    if (!closing || closing.id !== r.id) return
    setBusyId(r.id)
    const { error } = await supabase
      .from('follow_ups')
      .update({ status: 'done', result: closing.result.trim() || null, done_at: new Date().toISOString() })
      .eq('id', r.id)
    if (!error && mode === 'again') {
      await supabase.from('follow_ups').insert({
        title: r.title,
        due_date: closing.nextDate || tomorrow,
        property_id: r.property_id,
      })
    }
    setBusyId(null)
    if (error) alert(`บันทึกไม่สำเร็จ: ${error.message}`)
    else {
      setClosing(null)
      await reload()
    }
  }

  /** ตามต่อจากประวัติ = คลิกเดียว สร้างนัดใหม่ครบกำหนดพรุ่งนี้ — รายการเดิมไม่ถูกแตะ */
  async function followAgain(r: FollowUp) {
    setBusyId(r.id)
    const { error } = await supabase.from('follow_ups').insert({
      title: r.title,
      due_date: tomorrow,
      property_id: r.property_id,
    })
    setBusyId(null)
    if (error) alert(`สร้างนัดตามต่อไม่สำเร็จ: ${error.message}`)
    else {
      setTab('upcoming')
      await reload()
    }
  }

  async function remove(r: FollowUp) {
    if (!window.confirm(`ลบนัด "${r.title}"?`)) return
    setBusyId(r.id)
    const { error } = await supabase.from('follow_ups').delete().eq('id', r.id)
    setBusyId(null)
    if (error) alert(`ลบไม่สำเร็จ: ${error.message}`)
    else await reload()
  }

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: 'due', label: `ต้องทำ (${due.length})`, count: due.length },
    { key: 'upcoming', label: `ที่จะถึง (${upcoming.length})`, count: upcoming.length },
    { key: 'done', label: `เสร็จแล้ว (${done.length})`, count: done.length },
  ]

  return (
    <>
      <div className="view-header">
        <h1>นัดติดตาม {due.length > 0 && <span className="count-badge">{due.length} รอทำ</span>}</h1>
      </div>
      <div className="team-wrap">
        <section className="form-card">
          <h3>เพิ่มนัดติดตาม</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void addFollowUp('pending')
            }}
          >
            <div className="org-row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="form-field" style={{ flex: '2 1 220px', marginBottom: 0 }}>
                <label>เรื่องที่ต้องติดตาม *</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น โทรตามเจ้าของเรื่องลดราคา"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="form-field" style={{ flex: '0 1 150px', marginBottom: 0 }}>
                <label>ครบกำหนด *</label>
                <input type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div className="form-field" style={{ flex: '1 1 160px', marginBottom: 0 }}>
                <label>ผูกกับทรัพย์</label>
                <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
                  <option value="">— ไม่ผูกทรัพย์ —</option>
                  {props.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code}{p.district ? ` · ${p.district}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field" style={{ flex: '2 1 200px', marginBottom: 0 }}>
                <label>โน้ต / ผลที่ได้ (เมื่อกดบันทึกผลเลย)</label>
                <input
                  type="text"
                  placeholder="เช่น โทรไม่รับ"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
              <button className="btn primary" type="submit" disabled={saving}>
                {saving ? 'กำลังเพิ่ม…' : 'เพิ่มนัด'}
              </button>
              <button
                className="btn"
                type="button"
                disabled={saving || !title.trim()}
                title='บันทึกสิ่งที่ทำไปแล้วลงประวัติทันที เช่น "โทรไปไม่รับ" (ไม่ต้องตั้งนัด)'
                onClick={() => void addFollowUp('done')}
              >
                บันทึกผลเลย
              </button>
            </div>
          </form>
          <p className="plan-line" style={{ marginTop: 10 }}>
            ระบบส่งแจ้งเตือนถึงมือถือทั้งทีมตอน 07:00 น. ของวันครบกำหนด (ต้องเปิดรับแจ้งเตือนในแอป)
          </p>
        </section>

        <section className="form-card">
          <div style={{ display: 'inline-flex', gap: 4, padding: 4, border: '1px solid var(--line)', borderRadius: 999, marginBottom: 14 }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className="btn sm"
                style={{
                  border: 'none', boxShadow: 'none',
                  background: tab === t.key ? 'var(--purple)' : 'transparent',
                  color: tab === t.key ? '#fff' : 'var(--muted)',
                }}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {error && <div className="auth-error">{error}</div>}
          {loading && <div className="loading">กำลังโหลด…</div>}
          {!loading && !error && shown.length === 0 && (
            <div className="empty-state">
              {tab === 'due' ? 'ไม่มีนัดค้าง 🎉' : tab === 'upcoming' ? 'ยังไม่มีนัดล่วงหน้า' : 'ยังไม่มีนัดที่ทำเสร็จ'}
            </div>
          )}
          {!loading && shown.length > 0 && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
              {shown.map((r) => {
                const p = r.property_id ? propById.get(r.property_id) : null
                const overdue = r.status === 'pending' && r.due_date < today
                const dueToday = r.status === 'pending' && r.due_date === today
                return (
                  <li
                    key={r.id}
                    style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '11px 2px', borderTop: '1px solid var(--line)' }}
                  >
                    <span
                      style={{
                        flexShrink: 0, fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', marginTop: 2,
                        color: overdue ? 'var(--danger)' : dueToday ? 'var(--purple)' : 'var(--muted)',
                      }}
                    >
                      {r.status === 'done'
                        ? fmtDate(r.done_at ?? r.due_date)
                        : overdue ? `เกินกำหนด · ${fmtDate(r.due_date)}` : dueToday ? 'วันนี้' : fmtDate(r.due_date)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>
                        {r.title}
                        {r.result && <span style={{ color: 'var(--purple)' }}> → {r.result}</span>}
                        {p && (
                          <Link to={`/edit/${p.id}`} className="role-badge" style={{ marginLeft: 8, textDecoration: 'none' }}>
                            {p.code}
                          </Link>
                        )}
                      </div>
                      {r.note && r.note !== r.result && (
                        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{r.note}</div>
                      )}
                      {r.created_by && names.get(r.created_by) && (
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{names.get(r.created_by)}</div>
                      )}
                      {closing?.id === r.id && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                          <input
                            autoFocus
                            type="text"
                            placeholder="ผลเป็นยังไง? เช่น โทรไม่รับ / เจ้าของยอมลด"
                            value={closing.result}
                            onChange={(e) => setClosing({ ...closing, result: e.target.value })}
                            style={{ flex: '1 1 220px' }}
                          />
                          <button className="btn sm primary" disabled={busyId === r.id} onClick={() => void saveClose(r, 'end')}>
                            จบเรื่อง
                          </button>
                          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>หรือตามต่อวันที่</span>
                          <input
                            type="date"
                            value={closing.nextDate}
                            onChange={(e) => setClosing({ ...closing, nextDate: e.target.value })}
                            style={{ width: 140 }}
                          />
                          <button className="btn sm" disabled={busyId === r.id} onClick={() => void saveClose(r, 'again')}>
                            ตามต่อ
                          </button>
                          <button className="btn sm" onClick={() => setClosing(null)}>ยกเลิก</button>
                        </div>
                      )}
                    </div>
                    <div className="row-btns" style={{ flexShrink: 0 }}>
                      {r.status === 'pending' ? (
                        closing?.id !== r.id && (
                          <button
                            className="btn sm primary"
                            disabled={busyId === r.id}
                            onClick={() => setClosing({ id: r.id, result: '', nextDate: tomorrow })}
                          >
                            ✓ เสร็จ
                          </button>
                        )
                      ) : (
                        <button
                          className="btn sm"
                          disabled={busyId === r.id}
                          title="สร้างนัดใหม่ครบกำหนดพรุ่งนี้ทันที — ประวัติรายการนี้คงอยู่"
                          onClick={() => void followAgain(r)}
                        >
                          ↩ ตามต่อ
                        </button>
                      )}
                      <button className="btn sm danger" disabled={busyId === r.id} onClick={() => void remove(r)}>
                        ลบ
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
