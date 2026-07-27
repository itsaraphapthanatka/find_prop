import { useEffect, useState } from 'react'
import type { Property } from '../types'
import { LABELS, formatDate, formatNumber } from '../labels'
import { useAuth } from '../lib/auth'
import { usePlanAccess } from '../lib/plan'
import { supabase } from '../lib/supabase'
import { ContractTag, DealTag, ZoneSwatch } from '../lib/propertyStyle'
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
  result: string | null // ผลการติดตาม เช่น "โทรไม่รับ" "เจ้าของยอมลด 5%"
  done_at: string | null
}

const DEAL_LABELS: Record<string, string> = { rented: 'มีคนเช่าแล้ว', sold: 'ขายแล้ว' }

/** นัดติดตามของทรัพย์แปลงนี้ — ตามต่อไปเรื่อยๆ จนกด "ปิดงาน" (มีคนเช่า/ขายแล้ว) */
function FollowUpSection({ property }: { property: Property }) {
  const propertyId = property.id
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
        {jobClosed ? (
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
              disabled={busy}
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
      {!jobClosed && (
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
          <DealTag status={p.deal_status} />
          <ContractTag end={p.contract_end} />
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

          <div className="section-title">เจ้าของทรัพย์</div>
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
          {(p.documents?.length ?? 0) > 0 && (
            <div className="field">
              <div className="label">{LABELS.documents}</div>
              <div className="value">
                {p.documents!.map((d) => (
                  <div key={d.url}>
                    📄 <a href={d.url} target="_blank" rel="noreferrer">{d.name || 'เอกสาร'}</a>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="section-title">ประเภทและทำเล</div>
          <Field label={LABELS.property_type} value={p.property_type} />
          <Field label={LABELS.sub_type} value={p.sub_type} />
          <Field label={LABELS.listing_type} value={p.listing_type} />
          <Field label={LABELS.project_name} value={p.project_name} />
          <Field label={LABELS.subdistrict} value={p.subdistrict} />
          <Field label={LABELS.district} value={p.district} />
          <Field label={LABELS.province} value={p.province} />
          <Field label={LABELS.color_zone} value={p.color_zone && <><ZoneSwatch zone={p.color_zone} />{p.color_zone}</>} />
          <Field label={LABELS.far_ratio} value={p.far_ratio} />
          <Field label={LABELS.osr_ratio} value={p.osr_ratio} />
          <Field label={LABELS.road_frontage} value={p.road_frontage} />
          <Field label={LABELS.road_width} value={formatNumber(p.road_width)} />
          <Field label={LABELS.utilities} value={p.utilities} />
          <ChipList label={LABELS.zones} values={p.zones} />
          <Field label={LABELS.nearby} value={p.nearby} />

          <div className="section-title">ขนาดพื้นที่</div>
          <Field label={LABELS.land_wxd} value={p.land_wxd} />
          <Field label={LABELS.land_area} value={p.land_area} />
          <Field label={LABELS.usable_area} value={formatNumber(p.usable_area)} />
          <Field label={LABELS.floors} value={p.floors} />
          <Field label={LABELS.building_area} value={formatNumber(p.building_area)} />
          <Field label={LABELS.building_wxd} value={p.building_wxd} />
          <Field label={LABELS.office_floors} value={p.office_floors} />
          <Field label={LABELS.office_area_fl1} value={formatNumber(p.office_area_fl1)} />
          <Field label={LABELS.office_area_total} value={formatNumber(p.office_area_total)} />
          <Field label={LABELS.building_area_total} value={formatNumber(p.building_area_total)} />

          {/* ห้องและการตกแต่ง — มีเฉพาะบ้าน/คอนโด · โชว์หัวข้อเมื่อมีข้อมูลจริงเท่านั้น */}
          {([p.bedrooms, p.bathrooms, p.kitchens, p.parking_spaces, p.tower_floors, p.tower_count].some((v) => v != null) ||
            [p.maid_room, p.furniture, p.balcony_direction, p.unit_building, p.unit_floor].some(Boolean) ||
            (p.appliances?.length ?? 0) > 0) && (
            <>
              <div className="section-title">ห้องและการตกแต่ง</div>
              <Field label={LABELS.bedrooms} value={formatNumber(p.bedrooms)} />
              <Field label={LABELS.bathrooms} value={formatNumber(p.bathrooms)} />
              <Field label={LABELS.kitchens} value={formatNumber(p.kitchens)} />
              <Field label={LABELS.maid_room} value={p.maid_room} />
              <Field label={LABELS.parking_spaces} value={formatNumber(p.parking_spaces)} />
              <Field label={LABELS.balcony_direction} value={p.balcony_direction} />
              <Field label={LABELS.unit_building} value={p.unit_building} />
              <Field label={LABELS.unit_floor} value={p.unit_floor} />
              <Field label={LABELS.tower_floors} value={formatNumber(p.tower_floors)} />
              <Field label={LABELS.tower_count} value={formatNumber(p.tower_count)} />
              <ChipList label={LABELS.appliances} values={p.appliances} />
              <Field label={LABELS.furniture} value={p.furniture} />
            </>
          )}

          <div className="section-title">ราคาและค่าใช้จ่าย</div>
          <Field label={LABELS.rent_per_month} value={formatNumber(p.rent_per_month)} />
          <Field label={LABELS.price_per_sqm} value={formatNumber(p.price_per_sqm)} />
          <Field label={LABELS.sale_price} value={formatNumber(p.sale_price)} />
          <Field label={LABELS.transfer_fee} value={p.transfer_fee} />
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
          <Field
            label={LABELS.video_url}
            value={p.video_url && (
              <a href={p.video_url} target="_blank" rel="noreferrer">{p.video_url}</a>
            )}
          />
          <Field label={LABELS.notes} value={p.notes} />

          {/* นัดติดตาม = ฟีเจอร์ Pro — แพ็กเกจอื่นไม่โชว์ section นี้ (สอดคล้อง route /followups) */}
          {access.followUps && <FollowUpSection property={p} />}
        </div>
      </aside>
    </>
  )
}
