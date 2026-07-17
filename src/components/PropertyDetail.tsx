import type { Property } from '../types'
import { LABELS, formatDate, formatNumber } from '../labels'

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

interface Props {
  property: Property
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
}

export default function PropertyDetail({ property: p, onClose, onEdit, onDelete }: Props) {
  return (
    <>
      <div className="detail-overlay" onClick={onClose} />
      <aside className="detail-pane">
        <div className="pane-header">
          <h2>{p.code}</h2>
          <button className="btn sm danger" onClick={onDelete}>ลบ</button>
          <button className="btn sm primary" onClick={onEdit}>✏️ แก้ไข</button>
          <button className="icon-btn" onClick={onClose} title="ปิด">✕</button>
        </div>
        <div className="detail-body">
          {p.photo_url && <img className="detail-photo" src={p.photo_url} alt={p.code} />}

          <Field label={LABELS.record_date} value={formatDate(p.record_date)} />
          <Field label={LABELS.pic} value={p.pic} />

          <div className="section-title">ผู้ให้เช่า</div>
          <Field label={LABELS.lessor_status} value={p.lessor_status} />
          <Field label={LABELS.lessor_company} value={p.lessor_company} />
          <Field label={LABELS.lessor_name} value={p.lessor_name} />
          <Field
            label={LABELS.phone}
            value={p.phone && (
              <>
                {p.phone}{' '}
                <a className="icon-btn" href={`tel:${p.phone}`} title="โทร">📞</a>
                <a className="icon-btn" href={`sms:${p.phone}`} title="SMS">💬</a>
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
        </div>
      </aside>
    </>
  )
}
