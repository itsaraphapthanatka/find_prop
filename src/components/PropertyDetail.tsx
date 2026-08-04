import type { Property } from '../types'
import { LABELS, formatDate, formatNumber, houseNoLabel, kindOf } from '../labels'
import { useAuth } from '../lib/auth'
import { usePlanAccess } from '../lib/plan'
import { ContractTag, DealTag, ZoneSwatch } from '../lib/propertyStyle'
import { IconClose, IconPhone, IconSms } from './icons'
import LocationPicker from './LocationPicker'
import FollowUpSection from './FollowUpSection'

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '' || value === '—') return null
  return (
    <div className="field">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  )
}

// ฟิลด์สำคัญที่ทีมถามหาบ่อย (เจ้าของ/เบอร์โทร/คนลง/บ้านเลขที่) — ว่างก็ต้องเห็นว่า "ไม่ได้ระบุ"
// จะได้รู้ว่าข้อมูลไม่ได้ถูกกรอก ไม่ใช่ระบบซ่อน (ฟิลด์อื่นว่างแล้วซ่อนแถวตามเดิม)
const NotSpecified = <span style={{ color: 'var(--muted)' }}>ไม่ได้ระบุ</span>

/** ค่า ใช่/ไม่ — ไม่ระบุ (null) = ไม่โชว์แถว */
function BoolField({ label, value }: { label: string; value: boolean | null | undefined }) {
  if (value === null || value === undefined) return null
  return <Field label={label} value={value ? 'ใช่' : 'ไม่'} />
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

/** ขนาดที่ดินแบบไทย "2 ไร่ 1 งาน 50 ตร.วา" (ไม่มีค่าเลย = null → ไม่โชว์แถว) */
function landSizeText(p: Property): string | null {
  const parts = [
    p.land_rai != null ? `${formatNumber(p.land_rai)} ไร่` : null,
    p.land_ngan != null ? `${formatNumber(p.land_ngan)} งาน` : null,
    p.land_wa != null ? `${formatNumber(p.land_wa)} ตร.วา` : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' ') : null
}

/** เครื่องใช้ไฟฟ้า + จำนวนต่อชนิด เช่น "แอร์ ×3" */
function applianceChips(p: Property): string[] {
  const counts = p.appliance_counts ?? {}
  return (p.appliances ?? []).map((a) => (counts[a] != null ? `${a} ×${counts[a]}` : a))
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
          <Field label="ลงโดย" value={p.created_by_name || NotSpecified} />

          <div className="section-title">ผู้ติดต่อ</div>
          <Field label={LABELS.lessor_status} value={p.lessor_status} />
          <Field label={LABELS.contact_form} value={p.contact_form} />
          <Field label={LABELS.lessor_company} value={p.lessor_company} />
          <Field label={LABELS.lessor_name} value={p.lessor_name || NotSpecified} />
          <Field
            label={LABELS.phone}
            value={p.phone ? (
              <>
                {p.phone}{' '}
                <a className="icon-btn" href={`tel:${p.phone}`} title="โทร"><IconPhone size={16} /></a>
                <a className="icon-btn" href={`sms:${p.phone}`} title="SMS"><IconSms size={16} /></a>
              </>
            ) : NotSpecified}
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
          <Field label={LABELS.agreement_type} value={p.agreement_type} />
          {/* ที่ดินเปล่าไม่มีเลขที่ (ฟอร์มก็ไม่มีช่องนี้) — หมวดอื่นว่างให้เห็นว่า "ไม่ได้ระบุ" */}
          {kindOf(p.property_type) !== 'land' && (
            <Field label={houseNoLabel(kindOf(p.property_type))} value={p.house_no || NotSpecified} />
          )}
          <Field label={LABELS.project_name} value={p.project_name} />
          <Field label={LABELS.house_direction} value={p.house_direction} />
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
          {(p.nearby_places?.length ?? 0) > 0 && (
            <div className="field">
              <div className="label">{LABELS.nearby_places}</div>
              <div className="value">
                {p.nearby_places!.map((n, i) => (
                  <div key={i}>{n.name}{n.km != null ? ` — ${formatNumber(n.km)} กม.` : ''}</div>
                ))}
              </div>
            </div>
          )}

          <div className="section-title">ขนาดพื้นที่</div>
          <Field label="ขนาดที่ดิน" value={landSizeText(p)} />
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
          {([p.bedrooms, p.bathrooms, p.kitchens, p.parking_spaces, p.tower_floors, p.tower_count, p.rooms, p.ceiling_height].some((v) => v != null) ||
            [p.maid_room, p.furniture, p.balcony_direction, p.unit_building, p.unit_floor].some(Boolean) ||
            (p.appliances?.length ?? 0) > 0) && (
            <>
              <div className="section-title">ห้องและการตกแต่ง</div>
              <Field label={LABELS.rooms} value={formatNumber(p.rooms)} />
              <Field label={LABELS.bedrooms} value={formatNumber(p.bedrooms)} />
              <Field label={LABELS.bathrooms} value={formatNumber(p.bathrooms)} />
              <Field label={LABELS.kitchens} value={formatNumber(p.kitchens)} />
              <Field label={LABELS.maid_room} value={p.maid_room} />
              <Field label={LABELS.parking_spaces} value={formatNumber(p.parking_spaces)} />
              <Field label={LABELS.ceiling_height} value={formatNumber(p.ceiling_height)} />
              <Field label={LABELS.balcony_direction} value={p.balcony_direction} />
              <Field label={LABELS.unit_building} value={p.unit_building} />
              <Field label={LABELS.unit_floor} value={p.unit_floor} />
              <Field label={LABELS.tower_floors} value={formatNumber(p.tower_floors)} />
              <Field label={LABELS.tower_count} value={formatNumber(p.tower_count)} />
              <ChipList label={LABELS.appliances} values={applianceChips(p)} />
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
          <Field label={LABELS.vat} value={p.vat} />
          <Field label={LABELS.common_fee} value={p.common_fee} />
          <Field label={LABELS.common_fee_payee} value={p.common_fee_payee} />
          <Field label={LABELS.electricity_rate} value={p.electricity_rate} />
          <Field label={LABELS.power_payee} value={p.power_payee} />
          <Field label={LABELS.water_rate} value={p.water_rate} />
          <Field label={LABELS.water_payee} value={p.water_payee} />

          <div className="section-title">สเปกอาคาร</div>
          <Field label={LABELS.door_count} value={formatNumber(p.door_count)} />
          <Field label={LABELS.door_wxh} value={p.door_wxh} />
          <Field label={LABELS.building_height} value={formatNumber(p.building_height)} />
          <Field label={LABELS.floor_height} value={formatNumber(p.floor_height)} />
          <Field label={LABELS.floor_raise_cm} value={formatNumber(p.floor_raise_cm)} />
          <Field label={LABELS.floor_load} value={p.floor_load} />
          <Field label={LABELS.power_system} value={p.power_system} />
          <Field label={LABELS.water_per_day} value={p.water_per_day} />
          <Field label={LABELS.wastewater_pond} value={p.wastewater_pond} />
          <BoolField label={LABELS.has_crane} value={p.has_crane} />
          <BoolField label={LABELS.near_main_road} value={p.near_main_road} />
          <BoolField label={LABELS.standalone_building} value={p.standalone_building} />
          <BoolField label={LABELS.container_access} value={p.container_access} />

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
