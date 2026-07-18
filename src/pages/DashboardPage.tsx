import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteProperty, useProperties } from '../hooks/useProperties'
import { usePlans } from '../hooks/usePlans'
import { aiChat, extractJson, propertyBrief } from '../lib/ai'
import type { Property, VisitPlan } from '../types'
import { OPTIONS, formatDate, formatNumber } from '../labels'
import PropertyDetail from '../components/PropertyDetail'
import { IconHouse, IconPin, IconSparkles } from '../components/icons'

/* ชุดสี categorical ผ่าน validator ของ dataviz แล้ว (CVD ΔE ต่ำสุด 41.3, ลำดับตายตัวห้ามสลับ)
   สีอ่อน 3 ตัวมี WARN contrast — แก้ด้วย legend ตัวเลขกำกับทุกชิ้น (relief channel) */
const CAT = ['#7132f5', '#1baf7a', '#eda100', '#2a78d6', '#e87ba4']
const OTHER_COLOR = '#9ca3af'

const DAY = 24 * 3600 * 1000
const STALE_DAYS = 90
const INSIGHT_KEY = 'hob-dash-insight'

interface Insight {
  summary?: string
  strengths?: string[]
  gaps?: string[]
  actions?: { text: string; codes?: string[] }[]
}

/** นับจำนวนตามค่า (null → ป้ายที่กำหนด) */
function countBy(items: Property[], get: (p: Property) => string | null, nullLabel = 'ไม่ระบุ') {
  const m = new Map<string, number>()
  for (const p of items) {
    const k = get(p) || nullLabel
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

/** จัด segment ตามลำดับตัวเลือกมาตรฐาน แล้วพับที่เหลือเป็น "อื่นๆ" (สีเทา) */
function toSegments(counts: Map<string, number>, order: string[]) {
  const segs: { label: string; count: number; color: string }[] = []
  order.forEach((label, i) => {
    const c = counts.get(label)
    if (c) segs.push({ label, count: c, color: CAT[i % CAT.length] })
  })
  const other = [...counts.entries()].filter(([k]) => !order.includes(k)).reduce((n, [, c]) => n + c, 0)
  if (other > 0) segs.push({ label: 'อื่นๆ', count: other, color: OTHER_COLOR })
  return segs
}

/** แท่งส่วนแบ่งแนวนอน + legend ตัวเลขครบทุกชิ้น (ทำหน้าที่เป็น table view ไปในตัว) */
function StackBar({ segments, onPick }: {
  segments: { label: string; count: number; color: string }[]
  onPick?: (label: string) => void
}) {
  const total = segments.reduce((n, s) => n + s.count, 0)
  if (total === 0) return <div className="stop-sub">ยังไม่มีข้อมูล</div>
  return (
    <>
      <div className="stackbar">
        {segments.map((s) => (
          <div
            key={s.label}
            className="stackbar-seg"
            title={`${s.label} ${s.count} รายการ (${Math.round((s.count / total) * 100)}%)`}
            style={{ width: `${(s.count / total) * 100}%`, background: s.color }}
          />
        ))}
      </div>
      <div className="legend">
        {segments.map((s) => (
          <button
            key={s.label}
            className="legend-row"
            disabled={!onPick || s.label === 'อื่นๆ' || s.label === 'ไม่ระบุ'}
            onClick={() => onPick?.(s.label)}
            title={onPick ? `ดูรายการ${s.label}` : undefined}
          >
            <span className="legend-dot" style={{ background: s.color }} />
            <span className="legend-label">{s.label}</span>
            <span className="legend-val">{formatNumber(s.count)} · {Math.round((s.count / total) * 100)}%</span>
          </button>
        ))}
      </div>
    </>
  )
}

/** แท่งแนวนอนเทียบขนาด (ชุดเดียว — ใช้สีแบรนด์สีเดียวตามหลัก nominal bars) */
function HBars({ rows, unit }: { rows: { label: string; value: number }[]; unit?: string }) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <div className="hbars">
      {rows.map((r) => (
        <div key={r.label} className="hbar-row" title={`${r.label}: ${formatNumber(r.value)}${unit ?? ''}`}>
          <span className="hbar-label">{r.label}</span>
          <span className="hbar-track">
            <span className="hbar-fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="hbar-val">{formatNumber(r.value)}{unit}</span>
        </div>
      ))}
    </div>
  )
}

/** เส้น sparkline เล็กในการ์ดตัวเลข */
function Spark({ points }: { points: number[] }) {
  if (points.length < 2 || points.every((v) => v === 0)) return null
  const w = 72, h = 24, max = Math.max(...points, 1)
  const xy = points.map((v, i) => `${(i / (points.length - 1)) * w},${h - 3 - (v / max) * (h - 6)}`)
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={xy.join(' ')} fill="none" stroke="#7132f5" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function money(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)} ล้าน`
  return formatNumber(Math.round(n))
}

export default function DashboardPage() {
  const { items, reload } = useProperties()
  const { plans } = usePlans()
  const navigate = useNavigate()
  const [preview, setPreview] = useState<Property | null>(null)
  const [healthOpen, setHealthOpen] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)
  const byCode = useMemo(() => new Map(items.map((p) => [p.code, p])), [items])

  // ── 1) ตัวเลขหัวกระดาน ──
  const stats = useMemo(() => {
    const month = today.slice(0, 7)
    const dateOf = (p: Property) => p.record_date ?? p.created_at?.slice(0, 10) ?? null
    const newThisMonth = items.filter((p) => dateOf(p)?.startsWith(month)).length
    const rentTotal = items.reduce((n, p) => n + (p.rent_per_month ?? 0), 0)
    const saleTotal = items.reduce((n, p) => n + (p.sale_price ?? 0), 0)
    const in7 = new Date(Date.now() + 7 * DAY).toISOString().slice(0, 10)
    const weekPlans = plans.filter((pl) => pl.visit_date && pl.visit_date >= today && pl.visit_date <= in7)
    // ทรัพย์เข้าใหม่ย้อนหลัง 6 เดือน (sparkline)
    const months: string[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      months.push(d.toISOString().slice(0, 7))
    }
    const spark = months.map((m) => items.filter((p) => dateOf(p)?.startsWith(m)).length)
    return { newThisMonth, rentTotal, saleTotal, weekPlans: weekPlans.length, spark }
  }, [items, plans, today])

  // ── 2) นัดที่ใกล้ถึง ──
  const upcoming = useMemo(
    () =>
      plans
        .filter((pl) => pl.visit_date && pl.visit_date >= today)
        .sort((a, b) => (a.visit_date! < b.visit_date! ? -1 : 1))
        .slice(0, 5),
    [plans, today],
  )
  const undated = plans.filter((pl) => !pl.visit_date).length
  const tomorrow = new Date(Date.now() + DAY).toISOString().slice(0, 10)
  const dayTag = (d: string) => (d === today ? 'วันนี้' : d === tomorrow ? 'พรุ่งนี้' : formatDate(d))

  const routeUrl = (pl: VisitPlan) => {
    const pts = pl.stops
      .map((s) => items.find((p) => p.id === s.property_id))
      .filter((p): p is Property => Boolean(p && p.lat != null && p.lng != null))
      .map((p) => `${p.lat},${p.lng}`)
    if (!pts.length) return null
    return `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${pts[pts.length - 1]}${pts.length > 1 ? `&waypoints=${encodeURIComponent(pts.slice(0, -1).join('|'))}` : ''}`
  }

  // ── 3) พอร์ตแยกส่วน ──
  const typeSegs = useMemo(() => toSegments(countBy(items, (p) => p.property_type), OPTIONS.property_type), [items])
  const listingSegs = useMemo(() => toSegments(countBy(items, (p) => p.listing_type), OPTIONS.listing_type), [items])
  const topDistricts = useMemo(
    () =>
      [...countBy(items, (p) => p.district).entries()]
        .filter(([k]) => k !== 'ไม่ระบุ')
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([label, value]) => ({ label, value })),
    [items],
  )

  // ── 4) ราคา/ตร.ม. (เฉพาะฝั่งเช่าที่มีทั้งค่าเช่าและขนาดอาคาร) ──
  const ppsm = (p: Property) =>
    p.rent_per_month != null && p.building_area ? p.rent_per_month / p.building_area : null
  const priceByType = useMemo(() => {
    const groups = new Map<string, number[]>()
    for (const p of items) {
      const v = ppsm(p)
      if (v == null || !p.property_type) continue
      groups.set(p.property_type, [...(groups.get(p.property_type) ?? []), v])
    }
    return [...groups.entries()]
      .filter(([, arr]) => arr.length >= 2)
      .map(([label, arr]) => ({ label, value: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length), n: arr.length }))
      .sort((a, b) => b.value - a.value)
  }, [items])

  const valuePicks = useMemo(() => {
    const avgByType = new Map(priceByType.map((g) => [g.label, g.value]))
    const scored = items
      .map((p) => {
        const v = ppsm(p)
        const avg = p.property_type ? avgByType.get(p.property_type) : undefined
        return v != null && avg ? { p, diff: Math.round(((v - avg) / avg) * 100) } : null
      })
      .filter((x): x is { p: Property; diff: number } => x !== null)
    return {
      cheap: scored.filter((x) => x.diff <= -10).sort((a, b) => a.diff - b.diff).slice(0, 3),
      pricey: scored.filter((x) => x.diff >= 10).sort((a, b) => b.diff - a.diff).slice(0, 3),
    }
  }, [items, priceByType])

  // ── 5) สุขภาพข้อมูล ──
  const health = useMemo(() => {
    const staleBefore = new Date(Date.now() - STALE_DAYS * DAY).toISOString().slice(0, 10)
    return [
      { key: 'photo', label: 'ไม่มีรูป', list: items.filter((p) => !p.photo_url) },
      { key: 'coords', label: 'ไม่มีพิกัด', list: items.filter((p) => p.lat == null || p.lng == null) },
      { key: 'price', label: 'ไม่มีราคา', list: items.filter((p) => p.rent_per_month == null && p.sale_price == null) },
      { key: 'phone', label: 'ไม่มีเบอร์ติดต่อ', list: items.filter((p) => !p.phone) },
      { key: 'stale', label: `เก่ากว่า ${STALE_DAYS} วัน`, list: items.filter((p) => (p.record_date ?? '') < staleBefore && p.record_date) },
    ].filter((h) => h.list.length > 0)
  }, [items])

  // ── 6) AI วิเคราะห์พอร์ต ──
  const [insight, setInsight] = useState<Insight | null>(() => {
    try {
      const c = JSON.parse(localStorage.getItem(INSIGHT_KEY) ?? 'null') as { date: string; data: Insight } | null
      return c?.date === today ? c.data : null
    } catch {
      return null
    }
  })
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  async function runInsight() {
    setAiBusy(true)
    setAiError(null)
    try {
      const reqs = plans.filter((pl) => pl.requirement).map((pl) => `- ${pl.customer_name ?? pl.title}: ${pl.requirement}`).join('\n')
      const raw = await aiChat(
        [
          {
            role: 'system',
            content: 'คุณเป็นนักวิเคราะห์พอร์ตอสังหาริมทรัพย์ให้ทีมนายหน้า วิเคราะห์จากข้อมูลที่ให้เท่านั้น ตอบเป็น JSON ล้วน',
          },
          {
            role: 'user',
            content: `ภาพรวม: ทรัพย์ ${items.length} รายการ | แยกประเภท: ${typeSegs.map((s) => `${s.label} ${s.count}`).join(', ')} | ค่าเช่าเฉลี่ย/ตร.ม.: ${priceByType.map((g) => `${g.label} ${g.value} บ.`).join(', ') || '-'}

requirement ของลูกค้าที่ค้างอยู่ในแผนเยี่ยมชม:
${reqs || '(ไม่มี)'}

แคตตาล็อกทรัพย์:
${items.slice(0, 120).map(propertyBrief).join('\n')}

วิเคราะห์พอร์ตแล้วตอบ JSON โครงนี้ (ภาษาไทย สั้น ตรงประเด็น):
{"summary":"ภาพรวม 1-2 ประโยค","strengths":["จุดแข็งของพอร์ต 2-3 ข้อ"],"gaps":["ช่องว่าง/demand ของลูกค้าที่ยังไม่มีทรัพย์รองรับ 2-3 ข้อ"],"actions":[{"text":"สิ่งที่ควรทำ/ทรัพย์ที่ควรเร่งนำเสนอ","codes":["รหัสทรัพย์ที่เกี่ยว ถ้ามี"]}]}`,
          },
        ],
        0.2,
      )
      const parsed = extractJson<Insight>(raw)
      if (!parsed) throw new Error('อ่านคำตอบ AI ไม่ได้ ลองใหม่อีกครั้ง')
      parsed.actions = (parsed.actions ?? []).map((a) => ({ ...a, codes: (a.codes ?? []).filter((c) => byCode.has(c)) }))
      setInsight(parsed)
      localStorage.setItem(INSIGHT_KEY, JSON.stringify({ date: today, data: parsed }))
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err))
    } finally {
      setAiBusy(false)
    }
  }

  const goList = (params: string) => navigate(`/?${params}`)

  return (
    <>
      <div className="view-header">
        <h1>สรุปภาพรวม</h1>
      </div>
      <div className="team-wrap dash-wrap">

        {/* 1 ── ตัวเลขหัวกระดาน */}
        <div className="dash-tiles">
          <div className="stat-tile">
            <div className="stat-label">ทรัพย์ทั้งหมด</div>
            <div className="stat-value">{formatNumber(items.length)}</div>
            <div className="stat-sub">
              {stats.newThisMonth > 0 ? `+${stats.newThisMonth} เดือนนี้` : 'เดือนนี้ยังไม่มีเพิ่ม'}
            </div>
            <Spark points={stats.spark} />
          </div>
          <div className="stat-tile">
            <div className="stat-label">ค่าเช่ารวม/เดือน</div>
            <div className="stat-value">฿{money(stats.rentTotal)}</div>
            <div className="stat-sub">ถ้าปล่อยเช่าได้ทั้งพอร์ต</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">มูลค่าฝั่งขายรวม</div>
            <div className="stat-value">฿{money(stats.saleTotal)}</div>
            <div className="stat-sub">{formatNumber(items.filter((p) => p.sale_price != null).length)} รายการ</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">นัดใน 7 วัน</div>
            <div className="stat-value">{formatNumber(stats.weekPlans)}</div>
            <div className="stat-sub">{undated > 0 ? `${undated} แผนยังไม่นัดวัน` : 'ครบทุกแผนมีวันนัด'}</div>
          </div>
        </div>

        {/* 2 ── นัดที่ใกล้ถึง */}
        <section className="form-card">
          <h3>📅 นัดเยี่ยมชมที่ใกล้ถึง</h3>
          {upcoming.length === 0 && <div className="stop-sub">ยังไม่มีนัดข้างหน้า — สร้างได้ที่เมนูแผนเยี่ยมชม</div>}
          {upcoming.map((pl) => (
            <div key={pl.id} className="dash-visit">
              <span className={`visit-day ${pl.visit_date === today || pl.visit_date === tomorrow ? 'soon' : ''}`}>
                {dayTag(pl.visit_date!)}
              </span>
              <div className="stop-info">
                <div className="stop-title">{pl.title}</div>
                <div className="stop-sub">{pl.customer_name && `ลูกค้า ${pl.customer_name} · `}{pl.stops.length} จุดแวะ</div>
              </div>
              {routeUrl(pl) && (
                <a className="icon-btn" href={routeUrl(pl)!} target="_blank" rel="noreferrer" title="เปิดเส้นทางนำทาง">
                  <IconPin />
                </a>
              )}
            </div>
          ))}
          {upcoming.length > 0 && (
            <button className="link-btn" style={{ marginLeft: 0 }} onClick={() => navigate('/plans')}>ดูแผนทั้งหมด →</button>
          )}
        </section>

        {/* 3 ── พอร์ตแยกส่วน */}
        <div className="dash-cols">
          <section className="form-card">
            <h3>ประเภททรัพย์</h3>
            <StackBar segments={typeSegs} onPick={(t) => goList(`type=${encodeURIComponent(t)}`)} />
          </section>
          <section className="form-card">
            <h3>เช่า / ขาย</h3>
            <StackBar segments={listingSegs} onPick={(l) => goList(`listing=${encodeURIComponent(l)}`)} />
          </section>
        </div>
        {topDistricts.length > 0 && (
          <section className="form-card">
            <h3>ทำเลที่มีทรัพย์มากสุด</h3>
            <HBars rows={topDistricts} unit=" รายการ" />
          </section>
        )}

        {/* 4 ── Price intelligence */}
        {priceByType.length > 0 && (
          <section className="form-card">
            <h3>💰 ค่าเช่าเฉลี่ยต่อ ตร.ม. (ฝั่งเช่า)</h3>
            <HBars rows={priceByType.map((g) => ({ label: `${g.label} (${g.n})`, value: g.value }))} unit=" ฿" />
            {(valuePicks.cheap.length > 0 || valuePicks.pricey.length > 0) && (
              <div className="dash-picks">
                {valuePicks.cheap.length > 0 && (
                  <div>
                    <div className="ai-group-title">คุ้มกว่าค่าเฉลี่ยกลุ่ม — น่าดันนำเสนอ</div>
                    {valuePicks.cheap.map(({ p, diff }) => (
                      <button key={p.id} className="dash-pick" onClick={() => setPreview(p)}>
                        <IconHouse size={14} /> {p.code}
                        <span className="pick-diff good">{diff}%</span>
                      </button>
                    ))}
                  </div>
                )}
                {valuePicks.pricey.length > 0 && (
                  <div>
                    <div className="ai-group-title warn">สูงกว่าค่าเฉลี่ยกลุ่ม — เช็คราคา/จุดขาย</div>
                    {valuePicks.pricey.map(({ p, diff }) => (
                      <button key={p.id} className="dash-pick" onClick={() => setPreview(p)}>
                        <IconHouse size={14} /> {p.code}
                        <span className="pick-diff bad">+{diff}%</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* 5 ── สุขภาพข้อมูล */}
        {health.length > 0 && (
          <section className="form-card">
            <h3>🩺 สุขภาพข้อมูล — เก็บให้ครบ ขายง่ายขึ้น</h3>
            <div className="imp-stats">
              {health.map((h) => (
                <button
                  key={h.key}
                  className={`tag warn health-chip ${healthOpen === h.key ? 'open' : ''}`}
                  onClick={() => setHealthOpen(healthOpen === h.key ? null : h.key)}
                >
                  {h.label} ({h.list.length})
                </button>
              ))}
            </div>
            {healthOpen && (
              <div className="health-list">
                {health.find((h) => h.key === healthOpen)?.list.slice(0, 12).map((p) => (
                  <button key={p.id} className="dash-pick" onClick={() => setPreview(p)}>
                    <IconHouse size={14} /> {p.code}
                    <span className="stop-sub">{[p.district, p.province].filter(Boolean).join(', ')}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* 6 ── AI วิเคราะห์พอร์ต */}
        <section className="form-card ai-card">
          <h3><IconSparkles size={16} /> AI วิเคราะห์พอร์ตวันนี้</h3>
          {!insight && (
            <p className="ai-hint">
              ให้ AI อ่านพอร์ตทั้งหมด + requirement ลูกค้าทุกแผน แล้วสรุปจุดแข็ง ช่องว่าง
              และทรัพย์ที่ควรเร่งนำเสนอ (ผลค้างไว้ถึงสิ้นวัน)
            </p>
          )}
          <div className="ai-actions">
            <button className="btn primary" disabled={aiBusy || items.length === 0} onClick={() => void runInsight()}>
              <IconSparkles size={16} /> {aiBusy ? 'AI กำลังวิเคราะห์…' : insight ? 'วิเคราะห์ใหม่' : 'วิเคราะห์พอร์ต'}
            </button>
          </div>
          {aiError && <div className="auth-error" style={{ marginTop: 10 }}>{aiError}</div>}
          {insight && (
            <div className="ai-result">
              {insight.summary && <p className="ai-summary">{insight.summary}</p>}
              {(insight.strengths ?? []).length > 0 && (
                <>
                  <div className="ai-group-title">จุดแข็งของพอร์ต</div>
                  <ul className="insight-list">{insight.strengths!.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </>
              )}
              {(insight.gaps ?? []).length > 0 && (
                <>
                  <div className="ai-group-title warn">ช่องว่าง / demand ที่ยังไม่มีของ</div>
                  <ul className="insight-list">{insight.gaps!.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </>
              )}
              {(insight.actions ?? []).length > 0 && (
                <>
                  <div className="ai-group-title">ควรทำต่อ</div>
                  {insight.actions!.map((a, i) => (
                    <div key={i} className="insight-action">
                      <div>{a.text}</div>
                      {(a.codes ?? []).length > 0 && (
                        <div className="assist-props">
                          {a.codes!.map((c) => (
                            <button key={c} className="assist-prop" onClick={() => setPreview(byCode.get(c)!)}>
                              <IconHouse size={14} /> {c}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </section>
      </div>

      {preview && (
        <PropertyDetail
          property={preview}
          onClose={() => setPreview(null)}
          onEdit={() => navigate(`/edit/${preview.id}`)}
          onDelete={() => {
            if (!window.confirm(`ลบรายการ ${preview.code}?`)) return
            void deleteProperty(preview.id).then(async (err) => {
              if (err) alert(`ลบไม่สำเร็จ: ${err}`)
              else {
                setPreview(null)
                await reload()
              }
            })
          }}
        />
      )}
    </>
  )
}
