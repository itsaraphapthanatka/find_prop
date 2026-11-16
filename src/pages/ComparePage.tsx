import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useProperties } from '../hooks/useProperties'
import { useShortlists } from '../hooks/useShortlists'
import { usePerm } from '../hooks/usePerm'
import { supabase } from '../lib/supabase'
import { aiChat, extractJson, propertyDetailText } from '../lib/ai'
import { daysLeft, priceDrift, shareShortlist, shareUrl, unshareShortlist, useShareSetting } from '../lib/share'
import type { CompareResult, Property, ProposalData, Shortlist } from '../types'
import { formatDate } from '../labels'
import PropertyPicker, { PropThumb } from '../components/PropertyPicker'
import CompareSheet from '../components/CompareSheet'
import ProposalSheet, { type ProposalAgent } from '../components/ProposalSheet'
import { useAuth } from '../lib/auth'
import VoiceButton from '../components/VoiceButton'
import { IconClose, IconLink, IconPrint, IconSparkles, IconTrash } from '../components/icons'
import { printPage } from '../lib/native'

const MAX_PICK = 4
// ข้อมูลติดต่อผู้เสนอบนเอกสารข้อเสนอ — จำไว้ในเครื่องนี้ (ความสะดวกของแต่ละคน ไม่ใช่ข้อมูลที่ต้องแชร์)
const AGENT_KEY = 'hop_proposal_agent_v1'
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
/** รูปแบบมาตรฐานของข้อมูลข้อเสนอ — ใช้ทั้งตอนบันทึกและเทียบว่ามีการแก้ (ค่าว่างตัดทิ้ง) */
function normProposal(p?: ProposalData | null): ProposalData {
  const t = (v?: string) => (v ?? '').trim() || undefined
  const agent = { name: t(p?.agent?.name), phone: t(p?.agent?.phone), line: t(p?.agent?.line), email: t(p?.agent?.email) }
  return JSON.parse(JSON.stringify({ agent, note: t(p?.note), valid_until: t(p?.valid_until) })) as ProposalData
}

export default function ComparePage() {
  const { items } = useProperties()
  const { lists, loading: listsLoading, error: listsError, reload: reloadLists } = useShortlists()
  const perm = usePerm()
  const { profile, org } = useAuth()
  const [codes, setCodes] = useState<string[]>([])
  // รูปแบบเอกสาร: ตารางเปรียบเทียบ (เดิม) หรือ ข้อเสนอ (Proposal) ส่งลูกค้า
  const [docMode, setDocMode] = useState<'compare' | 'proposal'>('compare')
  const [agent, setAgent] = useState<ProposalAgent>(() => {
    let saved: Partial<ProposalAgent> = {}
    try { saved = JSON.parse(localStorage.getItem(AGENT_KEY) || '{}') } catch { /* โหมดส่วนตัว/ไม่มีค่า */ }
    return { name: saved.name ?? '', phone: saved.phone ?? '', email: saved.email ?? '', line: saved.line ?? '' }
  })
  const [proposalNote, setProposalNote] = useState('')
  const [validUntil, setValidUntil] = useState(() => plusDays(30))
  // ค่าเริ่มของชื่อ/อีเมลผู้เสนอ = บัญชีที่ล็อกอิน (ถ้ายังไม่เคยกรอกเอง)
  const agentShown: ProposalAgent = {
    ...agent,
    name: agent.name || profile?.full_name || '',
    email: agent.email || profile?.email || '',
  }
  const proposalData = normProposal({ agent: agentShown, note: proposalNote, valid_until: validUntil })
  // ข้อเสนอเสนอทรัพย์รายการเดียวได้ · ตารางเปรียบเทียบต้อง 2 รายการขึ้นไป
  const minPick = docMode === 'proposal' ? 1 : 2
  function setAgentField(k: keyof ProposalAgent, v: string) {
    setAgent((a) => {
      const next = { ...a, [k]: v }
      try { localStorage.setItem(AGENT_KEY, JSON.stringify(next)) } catch { /* ไม่เป็นไร */ }
      return next
    })
  }
  const [customer, setCustomer] = useState('')
  const [requirement, setRequirement] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [ai, setAi] = useState<CompareResult | null>(null)
  // ชุดที่กำลังเปิดอยู่ (null = ยังไม่เคยบันทึก)
  const [curId, setCurId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  // ลิงก์แชร์: อายุลิงก์ที่เลือก (เพดานมาจาก super admin) · สถานะปุ่มคัดลอก
  const shareSet = useShareSetting()
  const [shareDays, setShareDays] = useState('')
  const [sharing, setSharing] = useState(false)
  const [copied, setCopied] = useState(false)

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
    if (!code || codes.includes(code) || codes.length >= MAX_PICK || !byCode.has(code)) return
    setCodes([...codes, code])
    setAi(null)
  }
  function removeProp(code: string) {
    setCodes(codes.filter((c) => c !== code))
    setAi(null)
  }
  // กดซ้ำที่แถวเดิม = เอาออก (ตัวเลือกแบบมีรูปเลือก/ยกเลิกได้ในที่เดียว)
  function toggleProp(code: string) {
    if (codes.includes(code)) removeProp(code)
    else addProp(code)
  }

  // ── บันทึก/เปิดชอร์ตลิสต์ที่เก็บไว้ ─────────────────────────
  const cur = lists.find((l) => l.id === curId) ?? null
  // ราคาปัจจุบันต่างจากที่ตรึงไว้ในลิงก์ไหม (เตือนนายหน้า ลูกค้ายังเห็นราคาที่เสนอ)
  const drift = useMemo(() => priceDrift(cur?.snapshot, items), [cur?.snapshot, items])
  /** มีอะไรเปลี่ยนจากที่บันทึกไว้ไหม (ยังไม่บันทึก = ถือว่าเปลี่ยนถ้ามีทรัพย์ครบ 2) */
  const dirty = cur
    ? cur.title !== title.trim()
      || (cur.customer_name ?? '') !== customer.trim()
      || (cur.requirement ?? '') !== requirement.trim()
      || cur.codes.join(',') !== codes.join(',')
      || JSON.stringify(cur.ai ?? null) !== JSON.stringify(ai ?? null)
      || (cur.doc_mode ?? 'compare') !== docMode
      || (docMode === 'proposal' && JSON.stringify(normProposal(cur.proposal)) !== JSON.stringify(proposalData))
    : picked.length >= minPick

  function openList(sl: Shortlist) {
    setCurId(sl.id)
    setTitle(sl.title)
    setCustomer(sl.customer_name ?? '')
    setRequirement(sl.requirement ?? '')
    // เก็บรหัสตามที่บันทึกไว้ (ไม่กรองด้วย byCode — ทรัพย์อาจยังโหลดไม่เสร็จ
    // ถ้ากรองตอนนี้แล้วผู้ใช้กดบันทึก รหัสที่ยังไม่โหลดจะหายไปเงียบๆ)
    // ตัวที่ถูกลบจริงจะไม่ขึ้นในตารางเปรียบเทียบเอง เพราะ picked กรองอีกชั้นตอน render
    setCodes(sl.codes.slice(0, MAX_PICK))
    setAi(sl.ai ?? null)
    setAiError(null)
    // รูปแบบเอกสาร + ข้อมูลข้อเสนอที่บันทึกไว้ (ลิงก์ที่ส่งลูกค้าไปแล้วจะตรงกับที่เห็นตรงนี้)
    setDocMode(sl.doc_mode === 'proposal' ? 'proposal' : 'compare')
    if (sl.proposal) {
      const sp = sl.proposal
      setAgent((a) => ({
        name: sp.agent?.name ?? a.name, phone: sp.agent?.phone ?? a.phone,
        line: sp.agent?.line ?? a.line, email: sp.agent?.email ?? a.email,
      }))
      setProposalNote(sp.note ?? '')
      setValidUntil(sp.valid_until ?? plusDays(30))
    }
    appliedParam.current = true // เปิดชุดที่บันทึกไว้แล้ว — อย่าให้ ?codes= มาทับ
  }

  function newList() {
    setCurId(null)
    setTitle('')
    setCustomer('')
    setRequirement('')
    setCodes([])
    setAi(null)
    setAiError(null)
    setDocMode('compare')
    setProposalNote('')
    setValidUntil(plusDays(30))
  }

  /** ชื่อชุดอัตโนมัติเมื่อผู้ใช้ไม่ได้ตั้งเอง */
  const autoTitle = () =>
    customer.trim() ? `เสนอ ${customer.trim()}` : `ชอร์ตลิสต์ ${codes.join(' · ')}`

  async function saveList(asNew = false) {
    if (picked.length < minPick) return
    setSaving(true)
    const base = {
      title: title.trim() || autoTitle(),
      customer_name: customer.trim() || null,
      requirement: requirement.trim() || null,
      codes,
      ai,
    }
    // ลิงก์ที่ส่งลูกค้าจะเปิดเป็นเอกสารแบบที่บันทึกไว้ · สลับกลับเป็นตารางไม่ลบข้อมูลข้อเสนอเดิม
    const withDoc = {
      ...base,
      doc_mode: docMode,
      ...(docMode === 'proposal' ? { proposal: proposalData } : {}),
    }
    const write = (payload: typeof base) => curId && !asNew
      ? supabase.from('shortlists').update(payload).eq('id', curId).select().single()
      : supabase.from('shortlists').insert(payload).select().single()
    let res = await write(withDoc)
    // ยังไม่ได้รัน supabase/proposal-share.sql (ไม่มีคอลัมน์ doc_mode/proposal) → บันทึกแบบเดิมไปก่อน
    let docColsMissing = false
    if (res.error && /doc_mode|proposal/.test(res.error.message)) {
      docColsMissing = true
      res = await write(base)
    }
    setSaving(false)
    if (res.error) {
      alert(
        res.error.code === '42501'
          ? 'บันทึกไม่สำเร็จ: สิทธิ์ไม่ผ่าน (RLS) — บทบาท "ดูได้อย่างเดียว" บันทึกชอร์ตลิสต์ไม่ได้'
          : res.error.message.includes('shortlists')
            ? 'ยังไม่ได้เปิดระบบบันทึกชอร์ตลิสต์ — รัน supabase/shortlists.sql ใน SQL Editor ก่อน'
            : `บันทึกไม่สำเร็จ: ${res.error.message}`,
      )
      return
    }
    const saved = res.data as Shortlist
    setCurId(saved.id)
    setTitle(saved.title)
    await reloadLists()
    if (docColsMissing && docMode === 'proposal') {
      alert('บันทึกชอร์ตลิสต์แล้ว แต่ลิงก์ยังเปิดเป็นตารางเปรียบเทียบ — ผู้ดูแลระบบต้องรัน supabase/proposal-share.sql ก่อน ลิงก์ถึงจะเปิดเป็นข้อเสนอ')
    }
  }

  async function deleteList(sl: Shortlist) {
    if (!window.confirm(`ลบชอร์ตลิสต์ "${sl.title}"?`)) return
    const { error } = await supabase.from('shortlists').delete().eq('id', sl.id)
    if (error) alert(`ลบไม่สำเร็จ: ${error.message}`)
    else {
      if (curId === sl.id) setCurId(null)
      await reloadLists()
    }
  }

  // ── ลิงก์แชร์ให้ลูกค้า (เปิดดูได้โดยไม่ต้องล็อกอิน) ──────────
  // ราคาในลิงก์ถูกตรึงไว้ตอนสร้าง — ต่ออายุไม่แตะราคา ต้องกด "อัปเดตราคา" แยก
  async function makeShare(refresh = false) {
    if (!curId) return
    setSharing(true)
    const { data, error } = await shareShortlist(curId, Number(shareDays) || undefined, refresh)
    setSharing(false)
    if (error || !data) {
      alert(error ?? 'สร้างลิงก์ไม่สำเร็จ')
      return
    }
    await reloadLists()
    // สร้างลิงก์ครั้งแรกเท่านั้นที่คัดลอกให้ (ต่ออายุ/อัปเดตราคาใช้ลิงก์เดิม ไม่ต้องส่งใหม่)
    if (!cur?.share_token) await copyShare(data.token)
  }

  async function refreshPrices() {
    if (!window.confirm(
      'อัปเดตราคาในลิงก์ให้ตรงกับข้อมูลปัจจุบัน?\n\n' +
      'ลูกค้าที่เปิดลิงก์เดิมจะเห็นราคาใหม่ (ลิงก์ไม่เปลี่ยน ไม่ต้องส่งใหม่)',
    )) return
    await makeShare(true)
  }

  async function copyShare(token: string) {
    const url = shareUrl(token)
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      // เบราว์เซอร์บล็อกคลิปบอร์ด (เช่นไม่ใช่ https) — ให้ผู้ใช้คัดลอกจากช่องเอง
      window.prompt('คัดลอกลิงก์นี้ส่งให้ลูกค้า', url)
    }
  }

  async function stopShare() {
    if (!curId || !window.confirm('ยกเลิกลิงก์นี้? ลูกค้าที่ได้ลิงก์ไปแล้วจะเปิดดูไม่ได้อีก')) return
    const err = await unshareShortlist(curId)
    if (err) alert(`ยกเลิกลิงก์ไม่สำเร็จ: ${err}`)
    else await reloadLists()
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

  return (
    <>
      <div className="view-header">
        <h1>เปรียบเทียบทรัพย์ {picked.length > 0 && <span className="count-badge">{picked.length}</span>}</h1>
        <div className="header-actions">
          {!perm.readOnly && picked.length >= minPick && (
            <>
              <button className="btn primary" disabled={saving || !dirty} onClick={() => void saveList()}>
                {saving ? 'กำลังบันทึก…' : curId ? 'บันทึกการแก้ไข' : 'บันทึกชอร์ตลิสต์'}
              </button>
              {curId && (
                <button className="btn" disabled={saving} onClick={() => void saveList(true)}>บันทึกเป็นชุดใหม่</button>
              )}
            </>
          )}
          {(picked.length >= 2 || (docMode === 'proposal' && picked.length >= 1)) && (
            <button className="btn" onClick={() => void printPage()}>
              <IconPrint size={16} /> {docMode === 'proposal' ? 'พิมพ์ข้อเสนอ / PDF' : 'พิมพ์ / บันทึก PDF'}
            </button>
          )}
        </div>
      </div>

      <div className="team-wrap compare-wrap">
        {listsError && <div className="banner-warn" style={{ margin: '0 0 14px' }}>{listsError}</div>}

        {!listsLoading && lists.length > 0 && (
          <section className="form-card compare-saved">
            <h3>ชอร์ตลิสต์ที่บันทึกไว้ <span className="count-badge">{lists.length}</span></h3>
            {lists.map((sl) => (
              <div key={sl.id} className={`plan-row ${curId === sl.id ? 'selected' : ''}`} onClick={() => openList(sl)}>
                <div className="plan-info">
                  <div className="plan-title">{sl.title}</div>
                  <div className="plan-sub">
                    {sl.customer_name && <>ลูกค้า {sl.customer_name} · </>}
                    {sl.codes.length} รายการ ({sl.codes.join(', ')})
                    {sl.ai && <> · มีบทวิเคราะห์ AI</>}
                    {sl.updated_at && <> · แก้ไข {formatDate(sl.updated_at.slice(0, 10))}</>}
                  </div>
                </div>
                {perm.canDelete({ created_by: sl.created_by ?? null }) && (
                  <button className="icon-btn danger" title="ลบชอร์ตลิสต์"
                    onClick={(e) => { e.stopPropagation(); void deleteList(sl) }}><IconTrash /></button>
                )}
              </div>
            ))}
          </section>
        )}

        <section className="form-card compare-controls">
          <h3>
            {curId ? 'แก้ชอร์ตลิสต์' : 'สร้างชอร์ตลิสต์เสนอลูกค้า'}
            {curId && (
              <button type="button" className="link-btn" style={{ marginLeft: 10 }} onClick={newList}>
                + เริ่มชุดใหม่
              </button>
            )}
          </h3>
          {curId && dirty && (
            <p className="stop-sub" style={{ marginTop: -4 }}>มีการแก้ไขที่ยังไม่บันทึก</p>
          )}
          <div className="form-grid-2">
            <div className="form-field">
              <label>ชื่อชุด (สำหรับค้นหาภายหลัง)</label>
              <input type="text" value={title} placeholder={picked.length >= 2 ? autoTitle() : 'เช่น โกดังบางพลี ให้คุณสมชาย'}
                onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="form-field">
              <label>ชื่อลูกค้า (แสดงบนเอกสาร)</label>
              <input type="text" value={customer} placeholder="เช่น คุณสมชาย ใจดี" onChange={(e) => setCustomer(e.target.value)} />
            </div>
          </div>
          <div className="form-field">
            <label>เลือกทรัพย์ (2–{MAX_PICK} รายการ) · เลือกแล้ว {picked.length}</label>
            {picked.length > 0 && (
              <div className="pp-picked">
                {picked.map((p) => (
                  <span key={p.code} className="pp-chip">
                    <span className="pp-chip-img"><PropThumb photo={p.photo_url} alt={p.code} /></span>
                    <span className="pp-chip-txt"><b>{p.code}</b><small>{[p.property_type, p.district].filter(Boolean).join(' · ')}</small></span>
                    <button type="button" className="chip-remove" title="เอาออก" onClick={() => removeProp(p.code)}>
                      <IconClose size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <PropertyPicker items={items} picked={codes} max={MAX_PICK} onToggle={toggleProp} />
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
            {ai && dirty && !perm.readOnly && (
              <span className="stop-sub">กด "{curId ? 'บันทึกการแก้ไข' : 'บันทึกชอร์ตลิสต์'}" ด้านบนเพื่อเก็บบทวิเคราะห์นี้ไว้ใช้ซ้ำ</span>
            )}
          </div>
          {aiError && <div className="auth-error" style={{ marginTop: 10 }}>{aiError}</div>}
        </section>

        {/* ลิงก์แชร์ให้ลูกค้า — ต้องบันทึกชุดก่อน (ลิงก์ชี้ไปที่ชุดที่บันทึกไว้) */}
        {!perm.readOnly && (curId || picked.length >= minPick) && (
          <section className="form-card compare-share">
            <h3><IconLink size={16} /> ส่งลิงก์ให้ลูกค้าดู</h3>
            {shareSet.maxDays <= 0 ? (
              <p className="stop-sub">ผู้ดูแลระบบปิดการแชร์ลิงก์ไว้</p>
            ) : !curId ? (
              <p className="stop-sub">บันทึกชอร์ตลิสต์ก่อน แล้วจะสร้างลิงก์ได้</p>
            ) : (
              <>
                <p className="ai-hint" style={{ marginBottom: 6 }}>
                  ลิงก์เปิดเป็น <b>{(cur?.doc_mode ?? 'compare') === 'proposal' ? 'ข้อเสนอ (Proposal)' : 'ตารางเปรียบเทียบ'}</b> ตามที่บันทึกไว้
                  {dirty && ' · มีการแก้ไขที่ยังไม่บันทึก — กดบันทึกก่อน ลูกค้าถึงจะเห็นของใหม่'}
                </p>
                <p className="ai-hint">
                  ลูกค้าเปิดดูได้เลยไม่ต้องล็อกอิน · เห็นเท่าที่อยู่ในเอกสารที่พิมพ์ให้
                  (<b>ไม่เห็น</b>ชื่อ/เบอร์เจ้าของทรัพย์ · บ้านเลขที่ · พิกัดแผนที่)
                </p>
                {cur?.share_token ? (
                  <>
                    {/* กดตรงไหนของแถบก็คัดลอก (เป้ากดใหญ่ ใช้บนมือถือสะดวก) */}
                    <button
                      type="button"
                      className={`share-link ${copied ? 'copied' : ''}`}
                      title={`คลิกเพื่อคัดลอก · ${shareUrl(cur.share_token)}`}
                      onClick={() => void copyShare(cur.share_token!)}
                    >
                      <IconLink size={15} className="share-link-icon" />
                      <span className="share-link-url">{shareUrl(cur.share_token)}</span>
                      <span className="share-link-copy">{copied ? 'คัดลอกแล้ว ✓' : 'คัดลอก'}</span>
                    </button>
                    {cur.snapshot_at && (
                      <p className="stop-sub" style={{ margin: '0 0 8px' }}>
                        💰 ราคาในลิงก์ตรึงไว้ ณ วันที่เสนอ ({formatDate(cur.snapshot_at.slice(0, 10))}) —
                        แก้ราคาทรัพย์ในระบบทีหลัง ลูกค้าที่ถือลิงก์นี้ยังเห็นราคาเดิม
                      </p>
                    )}
                    {drift.length > 0 && (
                      <div className="banner-warn" style={{ margin: '0 0 10px' }}>
                        ราคาปัจจุบันของ <b>{drift.join(', ')}</b> ไม่ตรงกับราคาที่ตรึงไว้ในลิงก์ —
                        ลูกค้ายังเห็นราคาที่เสนอไว้เดิม{' '}
                        <button className="link-btn" disabled={sharing} onClick={() => void refreshPrices()}>
                          อัปเดตราคาในลิงก์
                        </button>
                      </div>
                    )}
                    <div className="ai-actions">
                      <span className="stop-sub">
                        {(() => {
                          const left = daysLeft(cur.share_expires_at)
                          if (left == null) return 'ไม่มีวันหมดอายุ'
                          return left > 0
                            ? `หมดอายุ ${formatDate(cur.share_expires_at!.slice(0, 10))} (อีก ${left} วัน)`
                            : `⚠️ ลิงก์หมดอายุแล้ว — กด "ต่ออายุลิงก์" เพื่อเปิดใช้ใหม่`
                        })()}
                        {(cur.share_views ?? 0) > 0 && ` · ลูกค้าเปิดดู ${cur.share_views} ครั้ง`}
                      </span>
                      <button className="btn sm" disabled={sharing} onClick={() => void makeShare()}>
                        {sharing ? 'กำลังต่ออายุ…' : 'ต่ออายุลิงก์ (ราคาเดิม)'}
                      </button>
                      {drift.length === 0 && (
                        <button className="btn sm" disabled={sharing} onClick={() => void refreshPrices()}>
                          อัปเดตข้อมูลในลิงก์
                        </button>
                      )}
                      <button className="btn sm danger" onClick={() => void stopShare()}>ยกเลิกลิงก์</button>
                    </div>
                  </>
                ) : (
                  <div className="ai-actions">
                    <label style={{ fontSize: 14 }}>
                      ลิงก์ใช้ได้{' '}
                      <input type="number" className="date-input" style={{ width: 80 }}
                        min={1} max={shareSet.maxDays} value={shareDays}
                        placeholder={String(shareSet.days)}
                        onChange={(e) => setShareDays(e.target.value)} />{' '}
                      วัน
                    </label>
                    <button className="btn primary" disabled={sharing || dirty} onClick={() => void makeShare()}>
                      <IconLink size={16} /> {sharing ? 'กำลังสร้างลิงก์…' : 'สร้างลิงก์ + คัดลอก'}
                    </button>
                    <span className="stop-sub">
                      {dirty
                        ? 'บันทึกการแก้ไขก่อน แล้วจะสร้างลิงก์ได้'
                        : `สูงสุด ${shareSet.maxDays} วัน (ผู้ดูแลระบบกำหนด)`}
                    </span>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {picked.length >= 1 && (
          <div className="doc-mode" role="group" aria-label="รูปแบบเอกสาร">
            <button type="button" className={`chip-toggle ${docMode === 'compare' ? 'on' : ''}`}
              aria-pressed={docMode === 'compare'} onClick={() => setDocMode('compare')}>
              ตารางเปรียบเทียบ
            </button>
            <button type="button" className={`chip-toggle ${docMode === 'proposal' ? 'on' : ''}`}
              aria-pressed={docMode === 'proposal'} onClick={() => setDocMode('proposal')}>
              ข้อเสนอ (Proposal)
            </button>
            <span className="stop-sub">
              {docMode === 'proposal'
                ? 'เอกสารเสนอลูกค้าแบบเต็ม: หน้าปก · สรุป · หน้าละ 1 ทรัพย์ · ตารางเปรียบเทียบ · ช่องทางติดต่อ'
                : 'ตารางเปรียบเทียบหน้าเดียว (ส่งลิงก์ให้ลูกค้าเปิดดูได้)'}
            </span>
          </div>
        )}

        {docMode === 'proposal' && picked.length >= 1 && (
          <section className="form-card proposal-controls">
            <h3>ข้อมูลบนข้อเสนอ</h3>
            <div className="form-grid-2">
              <div className="form-field">
                <label>ชื่อผู้เสนอ</label>
                <input type="text" value={agentShown.name} placeholder="ชื่อ-นามสกุล" onChange={(e) => setAgentField('name', e.target.value)} />
              </div>
              <div className="form-field">
                <label>เบอร์โทร</label>
                <input type="tel" value={agent.phone} placeholder="เช่น 081-234-5678" onChange={(e) => setAgentField('phone', e.target.value)} />
              </div>
              <div className="form-field">
                <label>LINE ID (ไม่บังคับ)</label>
                <input type="text" value={agent.line} placeholder="เช่น @hopproperty" onChange={(e) => setAgentField('line', e.target.value)} />
              </div>
              <div className="form-field">
                <label>อีเมล</label>
                <input type="email" value={agentShown.email} onChange={(e) => setAgentField('email', e.target.value)} />
              </div>
              <div className="form-field">
                <label>ข้อเสนอมีผลถึง</label>
                <input type="date" className="date-input" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </div>
            </div>
            <div className="form-field">
              <label>ข้อความถึงลูกค้า (ไม่บังคับ — ว่างไว้จะใช้บทเกริ่นจาก AI)</label>
              <textarea value={proposalNote} placeholder={ai?.intro || 'เช่น ตามที่คุยกันไว้ ทีมงานคัดทรัพย์ที่ตรงความต้องการมาให้พิจารณา 3 รายการ'}
                onChange={(e) => setProposalNote(e.target.value)} />
            </div>
            <p className="stop-sub" style={{ margin: 0 }}>
              ชื่อ เบอร์ LINE อีเมล จำไว้ในเครื่องนี้ ครั้งหน้าไม่ต้องกรอกใหม่ ·
              {ai ? ' ใส่จุดเด่น/คำแนะนำจากบทวิเคราะห์ AI ให้แล้ว' : ' กด "สร้างบทวิเคราะห์ด้วย AI" ด้านบน เพื่อใส่จุดเด่นและคำแนะนำในข้อเสนอ'}
            </p>
          </section>
        )}

        {docMode === 'proposal' && picked.length >= 1 && (
          <ProposalSheet
            picked={picked} orgName={org?.name} customer={customer} requirement={requirement} ai={ai}
            agent={agentShown} note={proposalNote} validUntil={validUntil}
          />
        )}

        {docMode === 'compare' && picked.length >= 2 && (
          <CompareSheet picked={picked} customer={customer} requirement={requirement} ai={ai} dateText={today} />
        )}

        {picked.length === 0 && (
          <div className="empty-state">เลือกทรัพย์อย่างน้อย 1 รายการเพื่อทำข้อเสนอ หรือ 2 รายการขึ้นไปเพื่อเปรียบเทียบ</div>
        )}
        {docMode === 'compare' && picked.length === 1 && (
          <div className="empty-state">เลือกอีกอย่างน้อย 1 รายการเพื่อเปรียบเทียบ — หรือกด "ข้อเสนอ (Proposal)" เพื่อเสนอทรัพย์นี้รายการเดียว</div>
        )}
      </div>
    </>
  )
}
