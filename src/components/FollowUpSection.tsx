// แผงนัดติดตามของทรัพย์หนึ่งแปลง — ใช้ทั้งในแผงรายละเอียด (กดดู) และในหน้าแก้ไขทรัพย์
// ตาราง follow_ups (supabase/follow-ups.sql) · สถานะงานอยู่ที่ properties.deal_status
import { useEffect, useState } from 'react'
import type { Property } from '../types'
import { formatDate } from '../labels'
import { supabase } from '../lib/supabase'
import { usePerm } from '../hooks/usePerm'

interface FuRow {
  id: string
  title: string
  due_date: string
  status: 'pending' | 'done'
  note: string | null
  result: string | null // ผลการติดตาม เช่น "โทรไม่รับ" "เจ้าของยอมลด 5%"
  done_at: string | null
}

const DEAL_LABELS: Record<string, string> = { rented: 'มีคนเช่าแล้ว', sold: 'ขายแล้ว' }

/** นัดติดตามของทรัพย์แปลงนี้ — ตามต่อไปเรื่อยๆ จนกด "ปิดงาน" (มีคนเช่า/ขายแล้ว) */
export default function FollowUpSection({ property }: { property: Property }) {
  const propertyId = property.id
  // แก้ทรัพย์ชิ้นนี้ไม่ได้ = ปิดงาน/เพิ่มนัด/บันทึกผล ไม่ได้ด้วย (เหลือดูประวัติ)
  // ฐานข้อมูลปฏิเสธอยู่แล้ว (can_edit_property + policy ของ follow_ups) — ที่นี่กันกดแล้ว error
  const perm = usePerm()
  const canWrite = perm.canEdit(property)
  const today = new Date().toISOString().slice(0, 10)
  const [rows, setRows] = useState<FuRow[]>([])
  const [installed, setInstalled] = useState(true) // false = ยังไม่ได้รัน follow-ups.sql
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState(today)
  const [busy, setBusy] = useState(false)
  // สถานะงานของทรัพย์ (คอลัมน์ properties.deal_status — supabase/property-deal-status.sql)
  const [dealStatus, setDealStatus] = useState<string>(property.deal_status ?? 'open')
  useEffect(() => {
    setDealStatus(property.deal_status ?? 'open')
  }, [property.id, property.deal_status])

  async function reload() {
    const { data, error } = await supabase
      .from('follow_ups')
      .select('id, title, due_date, status, note, result, done_at')
      .eq('property_id', propertyId)
      .order('due_date')
    if (error) {
      if (error.message.includes('follow_ups')) setInstalled(false)
      return
    }
    setRows((data ?? []) as FuRow[])
  }
  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId])

  /** เพิ่มนัดล่วงหน้า (pending) หรือบันทึกสิ่งที่ทำไปแล้ว (done ทันที เช่น "โทรไม่รับ") */
  async function add(mode: 'pending' | 'done') {
    if (!title.trim() || busy) return
    setBusy(true)
    const { error } = await supabase.from('follow_ups').insert({
      title: title.trim(),
      due_date: mode === 'done' ? today : dueDate,
      property_id: propertyId,
      status: mode,
      done_at: mode === 'done' ? new Date().toISOString() : null,
    })
    setBusy(false)
    if (error) alert(`บันทึกไม่สำเร็จ: ${error.message}`)
    else {
      setTitle('')
      setDueDate(today)
      await reload()
    }
  }

  // แผงปิดนัดแบบ inline: พิมพ์ผลครั้งเดียว → เลือก "จบเรื่อง" หรือ "ตามต่อ" (ไม่มี popup)
  const tomorrow = new Date(Date.now() + 86400e3).toISOString().slice(0, 10)
  const [closing, setClosing] = useState<{ id: string; result: string; nextDate: string } | null>(null)

  /** บันทึกผลรอบนี้ลงประวัติ — withNext = สร้างนัดรอบถัดไปให้ด้วย (ประวัติเดิมคงอยู่เสมอ) */
  async function saveClose(r: FuRow, withNext: boolean) {
    if (!closing || closing.id !== r.id) return
    setBusy(true)
    const { error } = await supabase
      .from('follow_ups')
      .update({ status: 'done', result: closing.result.trim() || null, done_at: new Date().toISOString() })
      .eq('id', r.id)
    if (!error && withNext) {
      await supabase.from('follow_ups').insert({
        title: r.title,
        due_date: closing.nextDate || tomorrow,
        property_id: propertyId,
      })
    }
    setBusy(false)
    if (error) alert(`บันทึกไม่สำเร็จ: ${error.message}`)
    else {
      setClosing(null)
      await reload()
    }
  }

  /** ปิดงาน = ทรัพย์มีคนเช่า/ขายแล้ว — ปิดนัดค้างทั้งหมด + ลงประวัติ + อัปเดตสถานะทรัพย์ */
  async function closeJob(status: 'rented' | 'sold') {
    const label = DEAL_LABELS[status]
    if (!window.confirm(`ปิดงาน ${property.code} — ${label}?\nนัดค้างทั้งหมดของทรัพย์นี้จะถูกปิดพร้อมบันทึกผล "${label}"`)) return
    setBusy(true)
    const { error } = await supabase.from('properties').update({ deal_status: status }).eq('id', propertyId)
    if (!error) {
      const now = new Date().toISOString()
      await supabase
        .from('follow_ups')
        .update({ status: 'done', result: `ปิดงาน — ${label}`, done_at: now })
        .eq('property_id', propertyId)
        .eq('status', 'pending')
      // ลงประวัติเหตุการณ์ปิดงานไว้ 1 บรรทัดเสมอ (เผื่อไม่มีนัดค้าง)
      await supabase.from('follow_ups').insert({
        title: 'ปิดงาน',
        result: label,
        due_date: today,
        status: 'done',
        done_at: now,
        property_id: propertyId,
      })
    }
    setBusy(false)
    if (error) {
      alert(error.message.includes('deal_status')
        ? 'ยังไม่ได้ติดตั้งสถานะงาน — รัน supabase/property-deal-status.sql ก่อน'
        : `ปิดงานไม่สำเร็จ: ${error.message}`)
    } else {
      setDealStatus(status)
      await reload()
    }
  }

  /** เปิดงานอีกครั้ง (ดีลล่ม/กลับมาปล่อยใหม่) */
  async function reopenJob() {
    setBusy(true)
    const { error } = await supabase.from('properties').update({ deal_status: 'open' }).eq('id', propertyId)
    if (!error) {
      await supabase.from('follow_ups').insert({
        title: 'เปิดงานอีกครั้ง',
        due_date: today,
        status: 'done',
        done_at: new Date().toISOString(),
        property_id: propertyId,
      })
    }
    setBusy(false)
    if (error) alert(`เปิดงานไม่สำเร็จ: ${error.message}`)
    else {
      setDealStatus('open')
      await reload()
    }
  }


  if (!installed) return null
  const pending = rows.filter((r) => r.status === 'pending')
  const done = rows
    .filter((r) => r.status === 'done')
    .sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''))
  const jobClosed = dealStatus === 'rented' || dealStatus === 'sold'
  return (
    <>
      <div className="section-title">นัดติดตาม{!jobClosed && pending.length > 0 && ` (${pending.length} รอทำ)`}</div>

      {/* สถานะงาน: เปิด = ตามต่อได้เรื่อยๆ · ปิด = มีคนเช่า/ขายแล้ว (ซ่อนนัด/ฟอร์ม เหลือประวัติ) */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '2px 0 8px' }}>
        <span className={`status-pill ${!jobClosed ? 'on' : ''}`}>
          {jobClosed ? `ปิดงานแล้ว — ${DEAL_LABELS[dealStatus]}` : 'เปิดงานอยู่'}
        </span>
        {!canWrite ? (
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>🔒 ดูได้เท่านั้น (ตามสิทธิ์ของบทบาทคุณ)</span>
        ) : jobClosed ? (
          <button className="btn sm" disabled={busy} onClick={() => void reopenJob()}>เปิดงานอีกครั้ง</button>
        ) : (
          <>
            <button className="btn sm" disabled={busy} title="ปิดงาน: ทรัพย์นี้มีคนเช่าแล้ว" onClick={() => void closeJob('rented')}>
              ปิดงาน · มีคนเช่าแล้ว
            </button>
            <button className="btn sm" disabled={busy} title="ปิดงาน: ทรัพย์นี้ขายแล้ว" onClick={() => void closeJob('sold')}>
              ปิดงาน · ขายแล้ว
            </button>
          </>
        )}
      </div>

      {!jobClosed && pending.map((r) => {
        const overdue = r.due_date < today
        return (
          <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
            <input
              type="checkbox"
              checked={closing?.id === r.id}
              disabled={busy || !canWrite}
              onChange={() =>
                setClosing(closing?.id === r.id ? null : { id: r.id, result: '', nextDate: tomorrow })
              }
              style={{ marginTop: 3, flexShrink: 0 }}
              title="ทำเสร็จแล้ว (บันทึกผลด้านล่าง)"
            />
            <div style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>
              {r.title}
              {r.note && r.note !== r.result && <span style={{ color: 'var(--muted)' }}> — {r.note}</span>}
              <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 600, color: overdue ? 'var(--danger)' : 'var(--muted)' }}>
                {overdue ? `เกินกำหนด ${formatDate(r.due_date)}` : r.due_date === today ? 'วันนี้' : formatDate(r.due_date)}
              </span>
              {closing?.id === r.id && (
                <div
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8,
                    background: 'var(--purple-subtle)', borderRadius: 10, padding: '10px 12px',
                  }}
                >
                  <input
                    autoFocus
                    type="text"
                    className="date-input"
                    placeholder="ผลเป็นยังไง? เช่น โทรไม่รับ"
                    value={closing.result}
                    onChange={(e) => setClosing({ ...closing, result: e.target.value })}
                    style={{ width: '100%' }}
                  />
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button className="btn sm" disabled={busy} title="จดผลลงประวัติ ไม่สร้างนัดใหม่" onClick={() => void saveClose(r, false)}>
                      บันทึกผล
                    </button>
                    <button className="btn sm primary" disabled={busy} title="จดผลลงประวัติ + สร้างนัดรอบถัดไป" onClick={() => void saveClose(r, true)}>
                      บันทึกผล + ตามต่อวันที่
                    </button>
                    <input
                      type="date"
                      className="date-input"
                      value={closing.nextDate}
                      onChange={(e) => setClosing({ ...closing, nextDate: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })}
      {!jobClosed && pending.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--muted)', padding: '2px 0 6px' }}>ไม่มีนัดค้างของทรัพย์นี้</div>
      )}
      {!jobClosed && canWrite && (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void add('pending')
        }}
        style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}
      >
        <input
          type="text"
          className="date-input"
          placeholder="เช่น โทรตามเจ้าของเรื่องลดราคา"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ flex: '1 1 170px' }}
        />
        <input
          type="date"
          className="date-input"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
        <button type="submit" className="btn sm primary" disabled={busy || !title.trim()}>เพิ่มนัด</button>
        <button
          type="button"
          className="btn sm"
          disabled={busy || !title.trim()}
          title='บันทึกสิ่งที่ทำไปแล้วลงประวัติทันที เช่น "โทรไปไม่รับ" (ไม่ต้องตั้งนัด)'
          onClick={() => void add('done')}
        >
          บันทึกผลเลย
        </button>
      </form>
      )}

      {done.length > 0 && (
        <>
          <div className="section-title">ประวัติการติดตาม ({done.length})</div>
          {done.slice(0, 10).map((r) => (
            <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <span style={{ flexShrink: 0, fontSize: 12, color: 'var(--muted)', marginTop: 2, whiteSpace: 'nowrap' }}>
                {formatDate(r.done_at ?? r.due_date)}
              </span>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>
                {r.title}
                {r.result && <span style={{ color: 'var(--purple)', fontWeight: 600 }}> → {r.result}</span>}
                {r.note && r.note !== r.result && <span style={{ color: 'var(--muted)' }}> — {r.note}</span>}
              </div>
            </div>
          ))}
          {done.length > 10 && (
            <div style={{ fontSize: 12.5, color: 'var(--muted)', padding: '4px 0' }}>
              และอีก {done.length - 10} รายการก่อนหน้า
            </div>
          )}
        </>
      )}
    </>
  )
}
