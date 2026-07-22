import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useProperties } from '../hooks/useProperties'
import { aiChat, extractJson, propertyDetailText } from '../lib/ai'
import type { Property } from '../types'
import { formatNumber } from '../labels'
import Combo from '../components/Combo'
import VoiceButton from '../components/VoiceButton'
import { IconClose, IconHouse, IconPrint, IconSparkles } from '../components/icons'
import { printPage } from '../lib/native'

/** บทวิเคราะห์จาก AI ต่อชอร์ตลิสต์หนึ่งชุด */
interface CompareResult {
  intro?: string
  items?: { code: string; pros?: string[]; cons?: string[]; fit?: string }[]
  recommendation?: string
}

const MAX_PICK = 4

/** แถวสเปกในตารางเปรียบเทียบ — แสดงเฉพาะแถวที่มีข้อมูลอย่างน้อย 1 ทรัพย์ */
const SPEC_ROWS: { label: string; get: (p: Property) => string | null }[] = [
  { label: 'ประเภท', get: (p) => p.property_type },
  { label: 'เช่า/ขาย', get: (p) => p.listing_type },
  { label: 'ทำเล', get: (p) => [p.subdistrict, p.district, p.province].filter(Boolean).join(', ') || null },
  { label: 'ค่าเช่า/เดือน', get: (p) => (p.rent_per_month != null ? `${formatNumber(p.rent_per_month)} ฿` : null) },
  { label: 'ราคาขาย', get: (p) => (p.sale_price != null ? `${formatNumber(p.sale_price)} ฿` : null) },
  { label: 'ราคา/ตร.ม.', get: (p) => (p.price_per_sqm != null ? `${formatNumber(p.price_per_sqm)} ฿` : null) },
  { label: 'พื้นที่ที่ดิน', get: (p) => p.land_area },
  { label: 'พื้นที่อาคาร', get: (p) => (p.building_area != null ? `${formatNumber(p.building_area)} ตร.ม.` : null) },
  { label: 'ความสูงอาคาร', get: (p) => (p.building_height != null ? `${formatNumber(p.building_height)} ม.` : null) },
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

export default function ComparePage() {
  const { items } = useProperties()
  const [codes, setCodes] = useState<string[]>([])
  const [addCode, setAddCode] = useState<string | null>(null)
  const [customer, setCustomer] = useState('')
  const [requirement, setRequirement] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [ai, setAi] = useState<CompareResult | null>(null)

  const byCode = useMemo(() => new Map(items.map((p) => [p.code, p])), [items])
  const picked = codes.map((c) => byCode.get(c)).filter((p): p is Property => Boolean(p))

  // เปิดหน้าพร้อมเลือกทรัพย์ให้แล้ว (เช่นมาจากผู้ช่วย AI: /compare?codes=A,B) — ใช้ครั้งเดียวตอนข้อมูลพร้อม
  const [params] = useSearchParams()
  const appliedParam = useRef(false)
  useEffect(() => {
    if (appliedParam.current || items.length === 0) return
    appliedParam.current = true
    const q = params.get('codes')
    if (!q) return
    const valid = q.split(',').map((s) => s.trim()).filter((c) => byCode.has(c)).slice(0, MAX_PICK)
    if (valid.length) setCodes(valid)
  }, [items, params, byCode])
  const today = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })

  function addProp(code: string | null) {
    setAddCode(null)
    if (!code || codes.includes(code) || codes.length >= MAX_PICK || !byCode.has(code)) return
    setCodes([...codes, code])
    setAi(null)
  }
  function removeProp(code: string) {
    setCodes(codes.filter((c) => c !== code))
    setAi(null)
  }

  async function runAnalysis() {
    setAiBusy(true)
    setAiError(null)
    try {
      const details = picked.map(propertyDetailText).join('\n\n')
      const raw = await aiChat(
        [
          {
            role: 'system',
            content:
              'คุณเป็นนายหน้าอสังหาริมทรัพย์มืออาชีพ เขียนบทวิเคราะห์เปรียบเทียบทรัพย์เพื่อประกอบการตัดสินใจของลูกค้า อิงเฉพาะข้อมูลที่ให้ ห้ามแต่งตัวเลขหรือข้อมูลเพิ่ม ตอบเป็น JSON ล้วนตามโครงที่กำหนด',
          },
          {
            role: 'user',
            content: `${requirement.trim() ? `requirement ของลูกค้า: "${requirement.trim()}"\n\n` : ''}ข้อมูลทรัพย์ที่ต้องเปรียบเทียบ ${picked.length} รายการ:

${details}

ตอบ JSON โครงนี้เท่านั้น (ภาษาไทย กระชับ อ่านง่าย):
{"intro":"เกริ่น 1-2 ประโยคว่าเปรียบเทียบอะไร","items":[{"code":"รหัสทรัพย์","pros":["จุดเด่น 2-4 ข้อ"],"cons":["ข้อควรพิจารณา 1-3 ข้อ"],"fit":"${requirement.trim() ? 'ตรง requirement ลูกค้าแค่ไหน 1 ประโยค' : 'เหมาะกับลูกค้าแบบไหน 1 ประโยค'}"}],"recommendation":"คำแนะนำสรุป 2-3 ประโยค เลือกตัวไหนเพราะอะไร"}`,
          },
        ],
        0.2,
      )
      const parsed = extractJson<CompareResult>(raw)
      if (!parsed) throw new Error('อ่านคำตอบ AI ไม่ได้ ลองใหม่อีกครั้ง')
      setAi(parsed)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err))
    } finally {
      setAiBusy(false)
    }
  }

  const aiOf = (code: string) => ai?.items?.find((i) => i.code === code)

  return (
    <>
      <div className="view-header">
        <h1>เปรียบเทียบทรัพย์ {picked.length > 0 && <span className="count-badge">{picked.length}</span>}</h1>
        {picked.length >= 2 && (
          <button className="btn" onClick={() => void printPage()}><IconPrint size={16} /> พิมพ์ / บันทึก PDF</button>
        )}
      </div>

      <div className="team-wrap compare-wrap">
        <section className="form-card compare-controls">
          <h3>สร้างชอร์ตลิสต์เสนอลูกค้า</h3>
          <div className="form-grid-2">
            <div className="form-field">
              <label>เลือกทรัพย์ (2–{MAX_PICK} รายการ)</label>
              <Combo
                value={addCode}
                onChange={addProp}
                options={items.filter((p) => !codes.includes(p.code)).map((p) => p.code)}
                placeholder={codes.length >= MAX_PICK ? `ครบ ${MAX_PICK} รายการแล้ว` : '+ พิมพ์รหัสทรัพย์เพื่อเพิ่ม'}
              />
              {picked.length > 0 && (
                <div className="chips" style={{ marginTop: 8 }}>
                  {picked.map((p) => (
                    <span key={p.code} className="chip chip-x">
                      {p.code}
                      <button className="chip-remove" title="เอาออก" onClick={() => removeProp(p.code)}>
                        <IconClose size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="form-field">
              <label>ชื่อลูกค้า (แสดงบนเอกสาร)</label>
              <input type="text" value={customer} placeholder="เช่น คุณสมชาย ใจดี" onChange={(e) => setCustomer(e.target.value)} />
            </div>
          </div>
          <div className="form-field">
            <label>requirement ของลูกค้า (ให้ AI วิเคราะห์ความเหมาะสม — ไม่บังคับ)</label>
            <textarea value={requirement} placeholder="เช่น หาโกดังเก็บสินค้า 1,200 ตร.ม. ใกล้ท่าเรือ งบ 150,000/เดือน"
              onChange={(e) => setRequirement(e.target.value)} />
          </div>
          <div className="ai-actions">
            <VoiceButton onText={(t) => setRequirement((d) => (d ? `${d} ` : '') + t)} />
            <button className="btn primary" disabled={picked.length < 2 || aiBusy} onClick={() => void runAnalysis()}>
              <IconSparkles size={16} /> {aiBusy ? 'AI กำลังเขียนบทวิเคราะห์…' : 'สร้างบทวิเคราะห์ด้วย AI'}
            </button>
            {picked.length < 2 && <span className="stop-sub">เลือกทรัพย์อย่างน้อย 2 รายการก่อน</span>}
          </div>
          {aiError && <div className="auth-error" style={{ marginTop: 10 }}>{aiError}</div>}
        </section>

        {picked.length >= 2 && (
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
                  {customer.trim() && <>เรียน {customer.trim()} · </>}จัดทำวันที่ {today}
                </div>
                {requirement.trim() && <div className="sheet-req">ความต้องการ: {requirement.trim()}</div>}
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
              เอกสารนี้จัดทำจากข้อมูลในระบบ HOP เพื่อประกอบการตัดสินใจเบื้องต้น
              ข้อมูลอาจเปลี่ยนแปลงได้ กรุณาตรวจสอบหน้างานอีกครั้ง
            </footer>
          </div>
        )}

        {picked.length < 2 && (
          <div className="empty-state">เลือกทรัพย์อย่างน้อย 2 รายการ เพื่อสร้างตารางเปรียบเทียบ</div>
        )}
      </div>
    </>
  )
}
