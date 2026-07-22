import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { deleteProperty, useProperties } from '../hooks/useProperties'
import { OrgFilterSelect, useOrgFilter } from '../hooks/useOrgFilter'
import { usePlans } from '../hooks/usePlans'
import { aiChat, extractJson, propertyBrief } from '../lib/ai'
import { logActivity } from '../lib/activityLog'
import { selectRelevant } from '../lib/relevance'
import type { Property, VisitPlan } from '../types'
import { formatDate } from '../labels'
import Combo from '../components/Combo'
import PropertyDetail from '../components/PropertyDetail'
import VoiceButton from '../components/VoiceButton'
import { IconClose, IconDown, IconHouse, IconPin, IconSparkles, IconTrash, IconUp } from '../components/icons'

/** ผลวิเคราะห์จาก AI เมื่อลูกค้าเปลี่ยน requirement */
interface MatchResult {
  summary?: string
  matches?: { code: string; reason: string }[]
  remove?: { code: string; reason: string }[]
}

const MAX_CATALOG = 80 // คัดตัวที่ใกล้ requirement ก่อนส่ง — ตอบไวขึ้นโดยไม่เสียความครอบคลุมมาก

export default function PlansPage() {
  const { items, reload: reloadProps } = useProperties()
  const { plans: allPlans, loading, error, reload } = usePlans()
  const navigate = useNavigate()
  // super โหมดภาพรวม: กรองแผนตามองค์กรที่เลือก (ตัวเลือกอิงจากรายการทรัพย์)
  const orgFilter = useOrgFilter(items)
  const plans = useMemo(
    () => allPlans.filter((pl) => orgFilter.matches(pl.org_id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allPlans, orgFilter.fOrg, orgFilter.superOverview],
  )

  const [preview, setPreview] = useState<Property | null>(null)
  const [selId, setSelId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newCustomer, setNewCustomer] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newReq, setNewReq] = useState('')

  const [addCode, setAddCode] = useState<string | null>(null)
  const [aiReq, setAiReq] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiResult, setAiResult] = useState<MatchResult | null>(null)

  const byId = useMemo(() => new Map(items.map((p) => [p.id, p])), [items])
  const byCode = useMemo(() => new Map(items.map((p) => [p.code, p])), [items])
  const sel = plans.find((pl) => pl.id === selId) ?? null

  function pickPlan(pl: VisitPlan) {
    setSelId(pl.id === selId ? null : pl.id)
    setAiReq(pl.requirement ?? '')
    setAiResult(null)
    setAiError(null)
  }

  async function createPlan(e: React.FormEvent) {
    e.preventDefault()
    const { data, error } = await supabase
      .from('visit_plans')
      .insert({
        title: newTitle.trim(),
        customer_name: newCustomer.trim() || null,
        visit_date: newDate || null,
        requirement: newReq.trim() || null,
      })
      .select()
      .single()
    if (error) {
      alert(
        error.code === '42501'
          ? 'สร้างแผนไม่สำเร็จ: สิทธิ์ไม่ผ่าน (RLS) — ถ้าใช้บัญชี super admin ให้รัน supabase/plans.sql เวอร์ชันล่าสุดใน SQL Editor อีกครั้ง หรือใช้บัญชีที่สังกัดองค์กร'
          : `สร้างแผนไม่สำเร็จ: ${error.message}`,
      )
    } else {
      logActivity('plan.create', newTitle.trim(), { customer: newCustomer.trim() || undefined })
      setShowNew(false)
      setNewTitle('')
      setNewCustomer('')
      setNewDate('')
      setNewReq('')
      await reload()
      if (data) pickPlan(data as VisitPlan)
    }
  }

  async function patchPlan(pl: VisitPlan, patch: Partial<VisitPlan>) {
    const { error } = await supabase.from('visit_plans').update(patch).eq('id', pl.id)
    if (error) alert(`บันทึกไม่สำเร็จ: ${error.message}`)
    else await reload()
  }

  async function deletePlan(pl: VisitPlan) {
    if (!window.confirm(`ลบแผน "${pl.title}"?`)) return
    const { error } = await supabase.from('visit_plans').delete().eq('id', pl.id)
    if (error) alert(`ลบไม่สำเร็จ: ${error.message}`)
    else {
      logActivity('plan.delete', pl.title)
      if (selId === pl.id) setSelId(null)
      await reload()
    }
  }

  // ── จัดการจุดแวะในรูท ──
  const addStop = (pl: VisitPlan, p: Property) =>
    patchPlan(pl, { stops: [...pl.stops, { property_id: p.id }] })
  const removeStop = (pl: VisitPlan, pid: string) =>
    patchPlan(pl, { stops: pl.stops.filter((s) => s.property_id !== pid) })
  const moveStop = (pl: VisitPlan, idx: number, dir: -1 | 1) => {
    const stops = [...pl.stops]
    const j = idx + dir
    if (j < 0 || j >= stops.length) return
    ;[stops[idx], stops[j]] = [stops[j], stops[idx]]
    void patchPlan(pl, { stops })
  }

  /** ลิงก์นำทาง Google Maps: เริ่มจากตำแหน่งปัจจุบันของผู้ใช้ → ไล่ตามลำดับจุดแวะ
      (ไม่ส่ง origin — Google Maps จะใช้ตำแหน่งปัจจุบันให้เอง ทั้งบนแอปมือถือและเว็บ) */
  function routeUrl(pl: VisitPlan): string | null {
    const pts = pl.stops
      .map((s) => byId.get(s.property_id))
      .filter((p): p is Property => Boolean(p && p.lat != null && p.lng != null))
      .map((p) => `${p.lat},${p.lng}`)
    if (pts.length === 0) return null
    const destination = pts[pts.length - 1]
    const waypoints = pts.slice(0, -1).join('|')
    return (
      `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${destination}` +
      (waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : '')
    )
  }

  // ── AI: ลูกค้าเปลี่ยน requirement → หาทรัพย์ที่ตรงจากทั้งระบบทันที ──
  async function runMatch(pl: VisitPlan) {
    if (!aiReq.trim()) return
    setAiBusy(true)
    setAiError(null)
    setAiResult(null)
    try {
      const inRoute = pl.stops
        .map((s) => byId.get(s.property_id)?.code)
        .filter(Boolean)
        .join(', ')
      const { picked, total, trimmed } = selectRelevant(items, `${aiReq} ${inRoute}`, MAX_CATALOG)
      const catalog = picked.map(propertyBrief).join('\n')
      const raw = await aiChat(
        [
          {
            role: 'system',
            content:
              'คุณเป็นผู้ช่วยนายหน้าอสังหาริมทรัพย์ วิเคราะห์จากข้อมูลในแคตตาล็อกที่ให้เท่านั้น ห้ามสมมุติทรัพย์ที่ไม่มีอยู่ ตอบเป็น JSON ล้วนตามโครงที่กำหนด ไม่มีข้อความอื่น',
          },
          {
            role: 'user',
            content: `requirement ใหม่ของลูกค้า: "${aiReq.trim()}"

ทรัพย์ที่อยู่ในรูทเยี่ยมชมปัจจุบัน (รหัส): ${inRoute || '(ยังไม่มี)'}

แคตตาล็อกทรัพย์${trimmed ? ` (คัดมา ${picked.length} รายการที่ใกล้ requirement ที่สุด จากทั้งหมด ${total})` : ''} (1 บรรทัด = 1 ทรัพย์ เริ่มด้วยรหัส):
${catalog}

ตอบ JSON โครงนี้เท่านั้น:
{"summary":"สรุป 1-2 ประโยคว่า requirement ใหม่ต้องการอะไรและพบทรัพย์ตรงกี่รายการ","matches":[{"code":"รหัสทรัพย์","reason":"เหตุผลสั้นๆ ว่าตรง requirement อย่างไร"}],"remove":[{"code":"รหัสทรัพย์ในรูทที่ไม่ตรง requirement ใหม่","reason":"เหตุผลสั้นๆ"}]}
กติกา: matches เลือกจากแคตตาล็อกเท่านั้น เรียงจากตรงมาก→น้อย ไม่เกิน 6 รายการ / remove พิจารณาเฉพาะทรัพย์ที่อยู่ในรูทปัจจุบัน / ใช้ภาษาไทย`,
          },
        ],
        0.1,
      )
      const parsed = extractJson<MatchResult>(raw)
      if (!parsed) throw new Error('อ่านคำตอบ AI ไม่ได้ ลองใหม่อีกครั้ง')
      // กันโมเดลอ้างรหัสที่ไม่มีจริง
      parsed.matches = (parsed.matches ?? []).filter((m) => byCode.has(m.code))
      parsed.remove = (parsed.remove ?? []).filter((m) => byCode.has(m.code))
      setAiResult(parsed)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err))
    } finally {
      setAiBusy(false)
    }
  }

  const inStops = (pl: VisitPlan, code: string) =>
    pl.stops.some((s) => byId.get(s.property_id)?.code === code)

  return (
    <>
      <div className="view-header">
        <h1>แผนเยี่ยมชม <span className="count-badge">{plans.length}</span></h1>
        <div className="header-actions">
          <OrgFilterSelect filter={orgFilter} />
          <button className="btn primary" onClick={() => setShowNew((v) => !v)}>+ สร้างแผน</button>
        </div>
      </div>

      <div className="team-wrap">
        {error && <div className="banner-warn" style={{ margin: '0 0 14px' }}>{error}</div>}

        {showNew && (
          <section className="form-card">
            <h3>สร้างแผนเยี่ยมชมใหม่</h3>
            <form onSubmit={(e) => void createPlan(e)}>
              <div className="form-grid-2">
                <div className="form-field">
                  <label>ชื่อแผน <span className="req">*</span></label>
                  <input type="text" required value={newTitle} placeholder="เช่น พาคุณสมชายดูโกดังบางพลี"
                    onChange={(e) => setNewTitle(e.target.value)} />
                </div>
                <div className="form-field">
                  <label>ชื่อลูกค้า</label>
                  <input type="text" value={newCustomer} onChange={(e) => setNewCustomer(e.target.value)} />
                </div>
              </div>
              <div className="form-grid-2">
                <div className="form-field">
                  <label>วันเข้าเยี่ยมชม</label>
                  <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                </div>
              </div>
              <div className="form-field">
                <label>requirement ของลูกค้า</label>
                <textarea value={newReq} placeholder="เช่น โกดัง 1,000-1,500 ตร.ม. ใกล้บางนา-ตราด งบไม่เกิน 150,000/เดือน"
                  onChange={(e) => setNewReq(e.target.value)} />
              </div>
              <div className="form-actions" style={{ paddingBottom: 6 }}>
                <button type="button" className="btn" onClick={() => setShowNew(false)}>ยกเลิก</button>
                <button type="submit" className="btn primary">สร้างแผน</button>
              </div>
            </form>
          </section>
        )}

        <section className="form-card">
          <h3>แผนทั้งหมด</h3>
          {loading && <div className="loading">กำลังโหลด…</div>}
          {!loading && plans.length === 0 && (
            <div className="empty-state" style={{ padding: '24px 0' }}>
              ยังไม่มีแผนเยี่ยมชม — กด "+ สร้างแผน" เพื่อเริ่มจัดรูทให้ลูกค้า
            </div>
          )}
          {plans.map((pl) => (
            <div key={pl.id} className={`plan-row ${selId === pl.id ? 'selected' : ''}`} onClick={() => pickPlan(pl)}>
              <div className="plan-info">
                <div className="plan-title">{pl.title}</div>
                <div className="plan-sub">
                  {pl.customer_name && <>ลูกค้า {pl.customer_name} · </>}
                  {pl.visit_date && <>{formatDate(pl.visit_date)} · </>}
                  {pl.stops.length} จุดแวะ
                </div>
              </div>
              <button className="icon-btn danger" title="ลบแผน"
                onClick={(e) => { e.stopPropagation(); void deletePlan(pl) }}><IconTrash /></button>
            </div>
          ))}
        </section>

        {sel && (
          <>
            <section className="form-card">
              <h3>รูทเยี่ยมชม · {sel.title}</h3>
              {sel.requirement && (
                <p className="plan-req">requirement ปัจจุบัน: {sel.requirement}</p>
              )}
              {sel.stops.length === 0 && (
                <div className="empty-state" style={{ padding: '18px 0' }}>ยังไม่มีจุดแวะ — เพิ่มทรัพย์เข้ารูทด้านล่าง</div>
              )}
              <ol className="stop-list">
                {sel.stops.map((s, i) => {
                  const p = byId.get(s.property_id)
                  return (
                    <li key={s.property_id} className="stop-row">
                      <span className="stop-no">{i + 1}</span>
                      <div className="stop-thumb">
                        {p?.photo_url ? <img src={p.photo_url} alt={p.code} /> : <IconHouse />}
                      </div>
                      <div className="stop-info">
                        <div className="stop-title">{p ? p.code : '(ทรัพย์ถูกลบไปแล้ว)'}</div>
                        {p && (
                          <div className="stop-sub">
                            {[p.property_type, [p.district, p.province].filter(Boolean).join(', ')]
                              .filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </div>
                      <div className="stop-actions">
                        <button className="icon-btn" title="เลื่อนขึ้น" disabled={i === 0}
                          onClick={() => moveStop(sel, i, -1)}><IconUp size={16} /></button>
                        <button className="icon-btn" title="เลื่อนลง" disabled={i === sel.stops.length - 1}
                          onClick={() => moveStop(sel, i, 1)}><IconDown size={16} /></button>
                        <button className="icon-btn danger" title="เอาออกจากรูท"
                          onClick={() => void removeStop(sel, s.property_id)}><IconClose size={16} /></button>
                      </div>
                    </li>
                  )
                })}
              </ol>
              <div className="stop-add">
                <div style={{ flex: 1 }}>
                  <Combo
                    value={addCode}
                    onChange={(v) => {
                      setAddCode(null)
                      const p = v ? byCode.get(v) : null
                      if (p && sel && !sel.stops.some((s) => s.property_id === p.id)) void addStop(sel, p)
                    }}
                    options={items.filter((p) => !sel.stops.some((s) => s.property_id === p.id)).map((p) => p.code)}
                    placeholder="+ เพิ่มทรัพย์เข้ารูท (พิมพ์รหัสค้นหา)"
                    renderOption={(code) => {
                      const p = byCode.get(code)
                      return (
                        <span className="combo-opt">
                          <span className="combo-opt-thumb">
                            {p?.photo_url ? <img src={p.photo_url} alt={code} /> : <IconHouse />}
                          </span>
                          <span className="combo-opt-text">
                            <span className="combo-opt-code">{code}</span>
                            {p && (
                              <span className="combo-opt-sub">
                                {[p.property_type, [p.district, p.province].filter(Boolean).join(', ')]
                                  .filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </span>
                        </span>
                      )
                    }}
                  />
                </div>
                {routeUrl(sel) && (
                  <a className="btn" href={routeUrl(sel)!} target="_blank" rel="noreferrer">
                    <IconPin size={16} /> เปิดเส้นทางใน Google Maps
                  </a>
                )}
              </div>
            </section>

            <section className="form-card ai-card">
              <h3><IconSparkles size={16} /> ลูกค้าเปลี่ยน requirement?</h3>
              <p className="ai-hint">
                ใส่ requirement ใหม่ แล้วให้ AI สแกนทรัพย์ทั้งหมดในระบบ หาตัวที่ตรงให้ทันที
                พร้อมชี้ว่าจุดแวะไหนในรูทเดิมไม่ตรงแล้ว
              </p>
              <div className="form-field">
                <textarea
                  value={aiReq}
                  placeholder="เช่น เปลี่ยนเป็นต้องการโรงงานพื้นที่สีม่วง มีเครน งบ 200,000/เดือน โซนบางปู"
                  onChange={(e) => setAiReq(e.target.value)}
                />
              </div>
              <div className="ai-actions">
                <VoiceButton onText={(t) => setAiReq((d) => (d ? `${d} ` : '') + t)} />
                <button className="btn primary" disabled={aiBusy || !aiReq.trim()} onClick={() => void runMatch(sel)}>
                  <IconSparkles size={16} /> {aiBusy ? 'AI กำลังวิเคราะห์…' : 'หาทรัพย์ที่ตรง requirement ใหม่'}
                </button>
                {aiReq.trim() && aiReq.trim() !== (sel.requirement ?? '') && (
                  <button className="btn" onClick={() => void patchPlan(sel, { requirement: aiReq.trim() })}>
                    บันทึกเป็น requirement ของแผน
                  </button>
                )}
              </div>
              {aiError && <div className="auth-error" style={{ marginTop: 10 }}>{aiError}</div>}
              {aiResult && (
                <div className="ai-result">
                  {aiResult.summary && <p className="ai-summary">{aiResult.summary}</p>}

                  {(aiResult.matches ?? []).length > 0 && (
                    <>
                      <div className="ai-group-title">ทรัพย์ที่ตรง requirement ใหม่</div>
                      {aiResult.matches!.map((m) => {
                        const p = byCode.get(m.code)!
                        const added = inStops(sel, m.code)
                        return (
                          <div key={m.code} className="ai-match">
                            <div className="stop-thumb">
                              {p?.photo_url ? <img src={p.photo_url} alt={m.code} /> : <IconHouse />}
                            </div>
                            <div className="ai-match-info">
                              <div className="stop-title">
                                {m.code}
                                <button className="link-btn" onClick={() => setPreview(p)}>ดูรายละเอียด</button>
                              </div>
                              <div className="stop-sub">{m.reason}</div>
                            </div>
                            {added
                              ? <span className="tag">อยู่ในรูทแล้ว</span>
                              : <button className="btn sm" onClick={() => void addStop(sel, p)}>+ เข้ารูท</button>}
                          </div>
                        )
                      })}
                    </>
                  )}
                  {(aiResult.matches ?? []).length === 0 && (
                    <p className="stop-sub">ไม่พบทรัพย์ในระบบที่ตรงกับ requirement ใหม่</p>
                  )}

                  {(aiResult.remove ?? []).length > 0 && (
                    <>
                      <div className="ai-group-title warn">จุดแวะเดิมที่ไม่ตรง requirement ใหม่</div>
                      {aiResult.remove!.map((m) => {
                        const p = byCode.get(m.code)!
                        const still = inStops(sel, m.code)
                        return (
                          <div key={m.code} className="ai-match">
                            <div className="stop-thumb">
                              {p?.photo_url ? <img src={p.photo_url} alt={m.code} /> : <IconHouse />}
                            </div>
                            <div className="ai-match-info">
                              <div className="stop-title">{m.code}</div>
                              <div className="stop-sub">{m.reason}</div>
                            </div>
                            {still && (
                              <button className="btn sm danger" onClick={() => void removeStop(sel, p.id)}>
                                เอาออกจากรูท
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </>
                  )}
                </div>
              )}
            </section>
          </>
        )}
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
                await reloadProps()
              }
            })
          }}
        />
      )}
    </>
  )
}
