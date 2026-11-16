// เอกสาร "ข้อเสนอทรัพย์" (Proposal) สำหรับส่งลูกค้า — ออกจากหน้าเปรียบเทียบได้ทันที (พิมพ์/บันทึก PDF)
// โครง: หน้าปก → สรุปข้อเสนอ → หน้าละ 1 ทรัพย์ (รูป + ข้อมูล + จุดเด่นจาก AI) → ตารางเปรียบเทียบ → ขั้นตอนถัดไป
// ⚠️ เอกสารนี้ไปถึงมือลูกค้า: ใช้เฉพาะฟิลด์ใน SPEC_ROWS (ขอบเขตเดียวกับเอกสารเปรียบเทียบ/ลิงก์แชร์) + รูปทรัพย์
//    ห้ามเพิ่มชื่อ/เบอร์เจ้าของ บ้านเลขที่ พิกัด หรือโน้ตภายใน
import type { CompareResult, Property } from '../types'
import { formatNumber } from '../labels'
import { photoList, photoThumb } from '../lib/photo'
import { CompareTable, SPEC_ROWS } from './CompareSheet'
import { IconHouse, IconSparkles } from './icons'

export interface ProposalAgent {
  name: string
  phone: string
  email: string
  line: string
}

interface Props {
  picked: Property[]
  orgName?: string | null
  /** โลโก้องค์กร (https) — ไม่มี = แสดงชื่อองค์กรอย่างเดียว */
  logoUrl?: string | null
  customer?: string | null
  requirement?: string | null
  ai?: CompareResult | null
  agent: ProposalAgent
  /** ข้อความถึงลูกค้าบนหน้าสรุป (ว่าง = ใช้บทเกริ่นจาก AI ถ้ามี) */
  note?: string
  /** วันที่ข้อเสนอสิ้นสุด (YYYY-MM-DD) · ว่าง = ไม่ระบุ */
  validUntil?: string
  /** วันที่จัดทำบนเอกสาร (ไม่ส่ง = วันนี้) — ลิงก์แชร์ใช้วันที่เสนอ (ราคาตรึงไว้วันนั้น) */
  issuedAt?: Date
}

const thaiDate = (d: Date) => d.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })

/** ราคาหลักของทรัพย์ 1 บรรทัด (เช่า/ขาย/ทั้งสอง) */
export function priceLine(p: Property): string {
  const rent = p.rent_per_month != null ? `เช่า ${formatNumber(p.rent_per_month)} ฿/เดือน` : null
  const sale = p.sale_price != null ? `ขาย ${formatNumber(p.sale_price)} ฿` : null
  return [rent, sale].filter(Boolean).join(' · ') || 'สอบถามราคา'
}

/** พื้นที่หลัก 1 บรรทัด — ใช้สอย > อาคาร > ที่ดิน */
function areaLine(p: Property): string | null {
  if (p.usable_area != null) return `${formatNumber(p.usable_area)} ตร.ม.`
  if (p.building_area != null) return `${formatNumber(p.building_area)} ตร.ม.`
  const land = [
    p.land_rai != null ? `${formatNumber(p.land_rai)} ไร่` : null,
    p.land_ngan != null ? `${formatNumber(p.land_ngan)} งาน` : null,
    p.land_wa != null ? `${formatNumber(p.land_wa)} ตร.วา` : null,
  ].filter(Boolean).join(' ')
  return land || p.land_area || null
}

const placeOf = (p: Property) => [p.subdistrict, p.district, p.province].filter(Boolean).join(', ')

/** รูปของทรัพย์ (แกลเลอรีก่อน ไม่มีค่อยใช้รูปปก) — แปลงลิงก์ Google Drive ให้แสดงได้ */
function photosOf(p: Property, max: number): string[] {
  const raw = p.photos?.length ? p.photos : photoList(p.photo_url)
  return raw.map((u) => photoThumb(u, 1280)).filter((u): u is string => Boolean(u)).slice(0, max)
}

function AgentCard({ agent, orgName }: { agent: ProposalAgent; orgName?: string | null }) {
  const rows = [
    agent.phone && ['โทร', agent.phone],
    agent.line && ['LINE', agent.line],
    agent.email && ['อีเมล', agent.email],
  ].filter(Boolean) as [string, string][]
  return (
    <div className="pp-agent">
      <div className="pp-agent-label">ผู้เสนอ</div>
      <div className="pp-agent-name">{agent.name || 'ทีมงาน'}</div>
      {orgName && <div className="pp-agent-org">{orgName}</div>}
      {rows.length > 0 && (
        <dl className="pp-agent-rows">
          {rows.map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
      )}
    </div>
  )
}

export default function ProposalSheet({ picked, orgName, logoUrl, customer, requirement, ai, agent, note, validUntil, issuedAt }: Props) {
  const cust = (customer ?? '').trim()
  const req = (requirement ?? '').trim()
  const intro = (note ?? '').trim() || ai?.intro?.trim() || ''
  const today = thaiDate(issuedAt ?? new Date())
  const valid = validUntil ? thaiDate(new Date(`${validUntil}T00:00:00`)) : null
  const hero = picked.map((p) => photosOf(p, 1)[0]).find(Boolean)
  const aiOf = (code: string) => ai?.items?.find((i) => i.code === code)
  const brand = (orgName ?? '').trim() || 'HOP'

  return (
    <div className="proposal-sheet">
      {/* ── หน้าปก ── */}
      <section className="pp-page pp-cover">
        <div className="pp-cover-top">
          <span className="pp-brand">
            {logoUrl && <img className="pp-logo" src={logoUrl} alt={brand} />}
            <span>{brand}</span>
          </span>
          <span className="pp-date">{today}</span>
        </div>
        <div className="pp-hero">
          {hero ? <img src={hero} alt="" /> : <IconHouse size={56} />}
        </div>
        <div className="pp-cover-body">
          <div className="pp-kicker">ข้อเสนอทรัพย์</div>
          <h1 className="pp-cover-title">{cust ? `สำหรับ ${cust}` : 'ทรัพย์ที่คัดมาให้คุณ'}</h1>
          {req && <p className="pp-cover-req">ตามความต้องการ: {req}</p>}
          <p className="pp-cover-meta">
            ทรัพย์ที่เสนอ {picked.length} รายการ
            {valid && <> · ข้อเสนอนี้มีผลถึง {valid}</>}
          </p>
        </div>
        <AgentCard agent={agent} orgName={orgName} />
      </section>

      {/* ── สรุปข้อเสนอ ── */}
      <section className="pp-page">
        <h2 className="pp-h2">สรุปข้อเสนอ</h2>
        {intro && <p className="pp-intro">{intro}</p>}
        <table className="pp-summary">
          <thead>
            <tr><th>ทรัพย์</th><th>ทำเล</th><th>พื้นที่</th><th>ราคา</th></tr>
          </thead>
          <tbody>
            {picked.map((p) => (
              <tr key={p.code}>
                <td>
                  <b>{p.code}</b>
                  <div className="pp-muted">{[p.property_type, p.listing_type].filter(Boolean).join(' · ')}</div>
                </td>
                <td>{placeOf(p) || '—'}</td>
                <td>{areaLine(p) ?? '—'}</td>
                <td className="pp-price">{priceLine(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {ai?.recommendation && (
          <div className="sheet-reco">
            <div className="sheet-reco-title"><IconSparkles size={15} /> คำแนะนำของเรา</div>
            <p>{ai.recommendation}</p>
          </div>
        )}
      </section>

      {/* ── หน้าละ 1 ทรัพย์ ── */}
      {picked.map((p, i) => {
        const pics = photosOf(p, 4)
        const a = aiOf(p.code)
        const specs = SPEC_ROWS.map((r) => [r.label, r.get(p)] as const).filter(([, v]) => v)
        const hasAi = Boolean(a && (a.pros?.length || a.cons?.length || a.fit))
        return (
          <section key={p.code} className="pp-page pp-prop">
            <div className="pp-prop-head">
              <span className="pp-prop-no">{i + 1}/{picked.length}</span>
              <div>
                <h2 className="pp-h2">{p.code}</h2>
                <div className="pp-muted">{[p.property_type, p.listing_type, placeOf(p)].filter(Boolean).join(' · ')}</div>
              </div>
              <div className="pp-prop-price">{priceLine(p)}</div>
            </div>
            <div className={`pp-gallery n${Math.max(1, pics.length)}`}>
              {pics.length === 0
                ? <div className="pp-noimg"><IconHouse size={40} /></div>
                : pics.map((u, k) => <img key={k} src={u} alt={`${p.code} รูปที่ ${k + 1}`} />)}
            </div>
            {/* ไม่มีบทวิเคราะห์ AI → ข้อมูลแผ่เต็มหน้า 2 คอลัมน์ (ไม่เหลือฝั่งขวาว่าง) */}
            <div className={`pp-prop-body ${hasAi ? '' : 'no-ai'}`}>
              <dl className="pp-specs">
                {specs.map(([k, v]) => (
                  <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
                ))}
              </dl>
              {a && hasAi ? (
                <div className="pp-ai">
                  {a.pros?.length ? (
                    <>
                      <div className="pp-ai-title">จุดเด่น</div>
                      <ul>{a.pros.map((x, k) => <li key={k}>{x}</li>)}</ul>
                    </>
                  ) : null}
                  {a.cons?.length ? (
                    <>
                      <div className="pp-ai-title">ข้อควรพิจารณา</div>
                      <ul>{a.cons.map((x, k) => <li key={k}>{x}</li>)}</ul>
                    </>
                  ) : null}
                  {a.fit && (
                    <>
                      <div className="pp-ai-title">ความเหมาะสม</div>
                      <p>{a.fit}</p>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </section>
        )
      })}

      {/* ── ตารางเปรียบเทียบ (2 รายการขึ้นไป) ── */}
      {picked.length >= 2 && (
        <section className="pp-page">
          <h2 className="pp-h2">เปรียบเทียบทรัพย์</h2>
          <CompareTable picked={picked} ai={ai} />
        </section>
      )}

      {/* ── ขั้นตอนถัดไป ── */}
      <section className="pp-page pp-next">
        <h2 className="pp-h2">ขั้นตอนถัดไป</h2>
        <ol className="pp-steps">
          <li>เลือกทรัพย์ที่สนใจ แล้วแจ้งผู้เสนอเพื่อนัดเข้าชมสถานที่จริง</li>
          <li>เข้าชมทรัพย์พร้อมผู้เสนอ และสอบถามเงื่อนไขกับเจ้าของ</li>
          <li>ตกลงเงื่อนไข ทำสัญญา และส่งมอบทรัพย์</li>
        </ol>
        <AgentCard agent={agent} orgName={orgName} />
        <p className="sheet-foot">
          {valid && <>ข้อเสนอนี้มีผลถึง {valid} · </>}
          ราคาและเงื่อนไขอาจเปลี่ยนแปลงตามเจ้าของทรัพย์ กรุณาตรวจสอบหน้างานอีกครั้ง · จัดทำวันที่ {today}
        </p>
      </section>
    </div>
  )
}
