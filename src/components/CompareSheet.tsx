// เอกสารเปรียบเทียบทรัพย์ (หัวกระดาษ HOP) — ใช้ 3 ที่ด้วยตัวเดียวกัน:
//   1) หน้า /compare ของนายหน้า   2) พิมพ์/บันทึก PDF   3) ลิงก์แชร์ให้ลูกค้า (/share/:token)
// ⚠️ ตารางนี้คือ "ขอบเขตข้อมูลที่ลูกค้าเห็นได้" — ห้ามเพิ่มแถวข้อมูลติดต่อเจ้าของ
// บ้านเลขที่ พิกัด หรือโน้ตภายใน เพราะเอกสารเดียวกันนี้ถูกแชร์ออกไปนอกองค์กร
// (ฝั่งฐานข้อมูลก็ไม่ส่งฟิลด์พวกนั้นมาให้ — ดู public_shortlist ใน supabase/shortlist-share.sql)
import type { CompareResult, Property } from '../types'
import { formatNumber } from '../labels'
import { IconHouse, IconSparkles } from './icons'

/** แถวสเปกในตารางเปรียบเทียบ — แสดงเฉพาะแถวที่มีข้อมูลอย่างน้อย 1 ทรัพย์ */
export const SPEC_ROWS: { label: string; get: (p: Property) => string | null }[] = [
  { label: 'ประเภท', get: (p) => p.property_type },
  { label: 'เช่า/ขาย', get: (p) => p.listing_type },
  { label: 'ทำเล', get: (p) => [p.subdistrict, p.district, p.province].filter(Boolean).join(', ') || null },
  { label: 'ค่าเช่า/เดือน', get: (p) => (p.rent_per_month != null ? `${formatNumber(p.rent_per_month)} ฿` : null) },
  { label: 'ราคาขาย', get: (p) => (p.sale_price != null ? `${formatNumber(p.sale_price)} ฿` : null) },
  { label: 'ราคา/ตร.ม.', get: (p) => (p.price_per_sqm != null ? `${formatNumber(p.price_per_sqm)} ฿` : null) },
  {
    label: 'พื้นที่ที่ดิน',
    get: (p) => [
      p.land_rai != null ? `${formatNumber(p.land_rai)} ไร่` : null,
      p.land_ngan != null ? `${formatNumber(p.land_ngan)} งาน` : null,
      p.land_wa != null ? `${formatNumber(p.land_wa)} ตร.วา` : null,
    ].filter(Boolean).join(' ') || p.land_area,
  },
  { label: 'พื้นที่ใช้สอย', get: (p) => (p.usable_area != null ? `${formatNumber(p.usable_area)} ตร.ม.` : null) },
  { label: 'พื้นที่อาคาร', get: (p) => (p.building_area != null ? `${formatNumber(p.building_area)} ตร.ม.` : null) },
  { label: 'ความสูงอาคาร', get: (p) => (p.building_height != null ? `${formatNumber(p.building_height)} ม.` : null) },
  { label: 'ความสูงเพดาน', get: (p) => (p.ceiling_height != null ? `${formatNumber(p.ceiling_height)} ม.` : null) },
  { label: 'พื้นรับน้ำหนัก', get: (p) => p.floor_load },
  { label: 'ระบบไฟฟ้า', get: (p) => p.power_system },
  { label: 'พื้นที่สีผังเมือง', get: (p) => p.color_zone },
  { label: 'โซน', get: (p) => p.zones?.join(', ') || null },
  { label: 'คุณสมบัติ', get: (p) => p.features?.join(', ') || null },
  { label: 'เหมาะกับ', get: (p) => p.usages?.join(', ') || null },
  { label: 'สัญญา', get: (p) => p.contract_period },
  { label: 'มัดจำ', get: (p) => p.deposit },
  { label: 'ใกล้เคียง', get: (p) => p.nearby },
]

interface Props {
  picked: Property[]
  customer?: string | null
  requirement?: string | null
  ai?: CompareResult | null
  /** วันที่บนหัวเอกสาร (ไม่ส่ง = วันนี้) — ลิงก์แชร์ใช้ "วันที่เสนอ" ที่ตรึงราคาไว้ */
  dateText?: string
  /** หมายเหตุท้ายเอกสารว่าข้อมูลเป็นของวันไหน (ใช้กับลิงก์ที่ตรึงราคา) */
  asOfNote?: string
}

export default function CompareSheet({ picked, customer, requirement, ai, dateText, asOfNote }: Props) {
  const cust = (customer ?? '').trim()
  const req = (requirement ?? '').trim()
  const today = dateText ?? new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
  const aiOf = (code: string) => ai?.items?.find((i) => i.code === code)

  return (
    <div className="compare-sheet">
      <header className="sheet-head">
        <div className="brand">
          <svg width="30" height="30" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="7" fill="#7132f5" />
            <path d="M6 24V14l10-6 10 6v10h-7v-6h-6v6H6z" fill="#fff" />
          </svg>
          <span>H<span className="brand-accent">OP</span></span>
        </div>
        <div className="sheet-title">
          <h2>ชอร์ตลิสต์เปรียบเทียบทรัพย์</h2>
          <div className="sheet-sub">
            {cust && <>เรียน {cust} · </>}จัดทำวันที่ {today}
          </div>
          {req && <div className="sheet-req">ความต้องการ: {req}</div>}
        </div>
      </header>

      {ai?.intro && <p className="sheet-intro">{ai.intro}</p>}

      <div className="compare-scroll">
        <table className="compare-table">
          <thead>
            <tr>
              <th className="spec-col"></th>
              {picked.map((p) => (
                <th key={p.code}>
                  <div className="cmp-photo">
                    {p.photo_url ? <img src={p.photo_url} alt={p.code} /> : <IconHouse size={30} />}
                  </div>
                  <div className="cmp-code">{p.code}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SPEC_ROWS.filter((row) => picked.some((p) => row.get(p))).map((row) => (
              <tr key={row.label}>
                <td className="spec-col">{row.label}</td>
                {picked.map((p) => <td key={p.code}>{row.get(p) ?? '—'}</td>)}
              </tr>
            ))}
            {ai && (
              <>
                <tr className="ai-row">
                  <td className="spec-col"><IconSparkles size={13} /> จุดเด่น</td>
                  {picked.map((p) => (
                    <td key={p.code}>
                      <ul className="cmp-list">
                        {(aiOf(p.code)?.pros ?? []).map((x, i) => <li key={i}>{x}</li>)}
                      </ul>
                    </td>
                  ))}
                </tr>
                <tr className="ai-row">
                  <td className="spec-col"><IconSparkles size={13} /> ข้อควรพิจารณา</td>
                  {picked.map((p) => (
                    <td key={p.code}>
                      <ul className="cmp-list">
                        {(aiOf(p.code)?.cons ?? []).map((x, i) => <li key={i}>{x}</li>)}
                      </ul>
                    </td>
                  ))}
                </tr>
                <tr className="ai-row">
                  <td className="spec-col"><IconSparkles size={13} /> ความเหมาะสม</td>
                  {picked.map((p) => <td key={p.code}>{aiOf(p.code)?.fit ?? '—'}</td>)}
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {ai?.recommendation && (
        <div className="sheet-reco">
          <div className="sheet-reco-title"><IconSparkles size={15} /> คำแนะนำ</div>
          <p>{ai.recommendation}</p>
        </div>
      )}

      <footer className="sheet-foot">
        {asOfNote && <>{asOfNote} · </>}
        เอกสารนี้จัดทำจากข้อมูลในระบบ HOP เพื่อประกอบการตัดสินใจเบื้องต้น
        ข้อมูลอาจเปลี่ยนแปลงได้ กรุณาตรวจสอบหน้างานอีกครั้ง
      </footer>
    </div>
  )
}
