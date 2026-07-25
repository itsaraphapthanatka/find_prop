import { useEffect, useState } from 'react'
import type { Property } from '../types'
import { LABELS, formatDate, formatNumber } from '../labels'
import { useAuth } from '../lib/auth'
import { usePlanAccess } from '../lib/plan'
import { supabase } from '../lib/supabase'
import { IconClose, IconPhone, IconSms } from './icons'
import LocationPicker from './LocationPicker'

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '' || value === '—') return null
  return (
    <div className="field">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  )
}

function ChipList({ label, values }: { label: string; values: string[] | null }) {
  if (!values || values.length === 0) return null
  return (
    <div className="field">
      <div className="label">{label}</div>
      <div className="chips">
        {values.map((v) => <span key={v} className="chip">{v}</span>)}
      </div>
    </div>
  )
}

interface FuRow {
  id: string
  title: string
  due_date: string
  status: 'pending' | 'done'
  note: string | null
}

/** นัดติดตามของทรัพย์แปลงนี้ — ลิสต์ + เพิ่มเร็ว + ติ๊กเสร็จ (ข้อมูลเต็มอยู่ที่เมนู "นัดติดตาม") */
function FollowUpSection({ propertyId }: { propertyId: string }) {
  const today = new Date().toISOString().slice(0, 10)
  const [rows, setRows] = useState<FuRow[]>([])
  const [installed, setInstalled] = useState(true) // false = ยังไม่ได้รัน follow-ups.sql
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState(today)
  const [busy, setBusy] = useState(false)

  async function reload() {
    const { data, error } = await supabase
      .from('follow_ups')
      .select('id, title, due_date, status, note')
      .eq('property_id', propertyId)
      .order('status')
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

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || busy) return
    setBusy(true)
    const { error } = await supabase
      .from('follow_ups')
      .insert({ title: title.trim(), due_date: dueDate, property_id: propertyId })
    setBusy(false)
    if (error) alert(`เพิ่มนัดไม่สำเร็จ: ${error.message}`)
    else {
      setTitle('')
      setDueDate(today)
      await reload()
    }
  }

  async function toggle(r: FuRow) {
    setBusy(true)
    const next = r.status === 'pending' ? 'done' : 'pending'
    const { error } = await supabase
      .from('follow_ups')
      .update({ status: next, done_at: next === 'done' ? new Date().toISOString() : null })
      .eq('id', r.id)
    setBusy(false)
    if (error) alert(`บันทึกไม่สำเร็จ: ${error.message}`)
    else await reload()
  }

  if (!installed) return null
  const done = rows.filter((r) => r.status === 'done')
  const pending = rows.filter((r) => r.status === 'pending')
  return (
    <>
      <div className="section-title">นัดติดตาม{pending.length > 0 && ` (${pending.length} รอทำ)`}</div>
      {[...pending, ...done.slice(0, 3)].map((r) => {
        const overdue = r.status === 'pending' && r.due_date < today
        return (
          <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
            <input
              type="checkbox"
              checked={r.status === 'done'}
              disabled={busy}
              onChange={() => void toggle(r)}
              style={{ marginTop: 3, flexShrink: 0 }}
              title={r.status === 'done' ? 'กลับมาติดตามต่อ' : 'ทำเสร็จแล้ว'}
            />
            <div style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>
              <span style={{ textDecoration: r.status === 'done' ? 'line-through' : 'none' }}>{r.title}</span>
              {r.note && <span style={{ color: 'var(--muted)' }}> — {r.note}</span>}
              <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 600, color: overdue ? 'var(--danger)' : 'var(--muted)' }}>
                {overdue ? `เกินกำหนด ${formatDate(r.due_date)}` : r.due_date === today && r.status === 'pending' ? 'วันนี้' : formatDate(r.due_date)}
              </span>
            </div>
          </div>
        )
      })}
      {rows.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--muted)', padding: '2px 0 6px' }}>ยังไม่มีนัดของทรัพย์นี้</div>
      )}
      <form onSubmit={(e) => void add(e)} style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="เพิ่มนัด เช่น โทรตามเจ้าของ"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ flex: '1 1 150px' }}
        />
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ flex: '0 1 140px' }} />
        <button type="submit" className="btn sm primary" disabled={busy || !title.trim()}>เพิ่ม</button>
      </form>
    </>
  )
}

interface Props {
  property: Property
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
}

export default function PropertyDetail({ property: p, onClose, onEdit, onDelete }: Props) {
  const { profile } = useAuth()
  const access = usePlanAccess()
  // ป้ายองค์กรเฉพาะ super โหมดภาพรวม — ตอนสวมสิทธิ์มุมมองเหมือนสมาชิกจริง
  const isSuper = Boolean(profile?.is_super && !profile?.impersonate_org_id)
  const pics = p.photos?.length ? p.photos : p.photo_url ? [p.photo_url] : []
  return (
    <>
      <div className="detail-overlay" onClick={onClose} />
      <aside className="detail-pane">
        <div className="pane-header">
          <h2>{p.code}</h2>
          {isSuper && p.org_name && <span className="tag org">{p.org_name}</span>}
          <button className="btn sm danger" onClick={onDelete}>ลบ</button>
          <button className="btn sm primary" onClick={onEdit}>แก้ไข</button>
          <button className="icon-btn" onClick={onClose} title="ปิด"><IconClose /></button>
        </div>
        <div className="detail-body">
          {pics.length > 0 && (
            <div className="detail-gallery">
              {pics.map((src, i) => <img key={i} src={src} alt={`${p.code} ${i + 1}`} />)}
            </div>
          )}

          <Field label={LABELS.record_date} value={formatDate(p.record_date)} />
          <Field label="ลงโดย" value={p.created_by_name} />

          <div className="section-title">ผู้ให้เช่า</div>
          <Field label={LABELS.lessor_status} value={p.lessor_status} />
          <Field label={LABELS.lessor_company} value={p.lessor_company} />
          <Field label={LABELS.lessor_name} value={p.lessor_name} />
          <Field
            label={LABELS.phone}
            value={p.phone && (
              <>
                {p.phone}{' '}
                <a className="icon-btn" href={`tel:${p.phone}`} title="โทร"><IconPhone size={16} /></a>
                <a className="icon-btn" href={`sms:${p.phone}`} title="SMS"><IconSms size={16} /></a>
              </>
            )}
          />
          <Field label={LABELS.deed_no} value={p.deed_no} />

          <div className="section-title">ประเภทและทำเล</div>
          <Field label={LABELS.property_type} value={p.property_type} />
          <Field label={LABELS.listing_type} value={p.listing_type} />
          <Field label={LABELS.subdistrict} value={p.subdistrict} />
          <Field label={LABELS.district} value={p.district} />
          <Field label={LABELS.province} value={p.province} />
          <Field label={LABELS.color_zone} value={p.color_zone} />
          <ChipList label={LABELS.zones} values={p.zones} />
          <Field label={LABELS.nearby} value={p.nearby} />

          <div className="section-title">ขนาดพื้นที่</div>
          <Field label={LABELS.land_wxd} value={p.land_wxd} />
          <Field label={LABELS.land_area} value={p.land_area} />
          <Field label={LABELS.building_area} value={formatNumber(p.building_area)} />
          <Field label={LABELS.building_wxd} value={p.building_wxd} />
          <Field label={LABELS.office_floors} value={p.office_floors} />
          <Field label={LABELS.office_area_fl1} value={formatNumber(p.office_area_fl1)} />
          <Field label={LABELS.office_area_total} value={formatNumber(p.office_area_total)} />
          <Field label={LABELS.building_area_total} value={formatNumber(p.building_area_total)} />

          <div className="section-title">ราคาและค่าใช้จ่าย</div>
          <Field label={LABELS.rent_per_month} value={formatNumber(p.rent_per_month)} />
          <Field label={LABELS.price_per_sqm} value={formatNumber(p.price_per_sqm)} />
          <Field label={LABELS.sale_price} value={formatNumber(p.sale_price)} />
          <Field label={LABELS.withholding_tax} value={p.withholding_tax} />
          <Field label={LABELS.land_building_tax} value={p.land_building_tax} />
          <Field label={LABELS.common_fee} value={p.common_fee} />
          <Field label={LABELS.electricity_rate} value={p.electricity_rate} />
          <Field label={LABELS.water_rate} value={p.water_rate} />

          <div className="section-title">สเปกอาคาร</div>
          <Field label={LABELS.door_count} value={formatNumber(p.door_count)} />
          <Field label={LABELS.door_wxh} value={p.door_wxh} />
          <Field label={LABELS.building_height} value={formatNumber(p.building_height)} />
          <Field label={LABELS.floor_load} value={p.floor_load} />
          <Field label={LABELS.power_system} value={p.power_system} />
          <Field label={LABELS.water_per_day} value={p.water_per_day} />

          <div className="section-title">เงื่อนไขสัญญา</div>
          <Field label={LABELS.contract_period} value={p.contract_period} />
          <Field label={LABELS.deposit} value={p.deposit} />
          <Field label={LABELS.advance_rent} value={p.advance_rent} />

          <div className="section-title">คุณสมบัติและการใช้งาน</div>
          <ChipList label={LABELS.features} values={p.features} />
          <ChipList label={LABELS.usages} values={p.usages} />

          <div className="section-title">ตำแหน่ง</div>
          {p.lat != null && p.lng != null && (
            <div style={{ margin: '4px 0 12px' }}>
              <LocationPicker lat={p.lat} lng={p.lng} />
            </div>
          )}
          <Field
            label="เลขพิกัด"
            value={p.lat != null && p.lng != null ? `${p.lat}, ${p.lng}` : null}
          />
          <Field
            label={LABELS.map_url}
            value={p.map_url && (
              <a href={p.map_url} target="_blank" rel="noreferrer">{p.map_url}</a>
            )}
          />
          <Field label={LABELS.notes} value={p.notes} />

          {/* นัดติดตาม = ฟีเจอร์ Pro — แพ็กเกจอื่นไม่โชว์ section นี้ (สอดคล้อง route /followups) */}
          {access.followUps && <FollowUpSection propertyId={p.id} />}
        </div>
      </aside>
    </>
  )
}
