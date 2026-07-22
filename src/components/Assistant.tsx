import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { deleteProperty, useProperties } from '../hooks/useProperties'
import { usePlans } from '../hooks/usePlans'
import { aiChat, extractJson, propertyBrief } from '../lib/ai'
import { logActivity } from '../lib/activityLog'
import { selectRelevant } from '../lib/relevance'
import { usePlanAccess } from '../lib/plan'
import type { Property } from '../types'
import PropertyDetail from './PropertyDetail'
import VoiceButton from './VoiceButton'
import {
  IconClose, IconHouse, IconSend, IconSparkles, IconTrash, IconVolume, IconVolumeOff,
} from './icons'

const MAX_CATALOG = 40 // คัดเฉพาะที่เกี่ยวกับบทสนทนา — prompt สั้น ตอบไว รับคนพร้อมกันได้มากขึ้น
const HISTORY_KEY = 'hob-assistant-chat'
const SPEAK_KEY = 'hob-assistant-speak'
const CONTEXT_MSGS = 6 // จำนวนข้อความย้อนหลังที่ส่งให้โมเดล

interface AssistantAction {
  type: 'add_stop' | 'remove_stop' | 'create_plan' | 'open_compare'
  plan?: string // อ้างแผนด้วยรหัสย่อ "P1" (กัน AI พิมพ์ uuid ผิด)
  codes?: string[]
  title?: string
  customer_name?: string | null
  visit_date?: string | null
  requirement?: string | null
}

interface ChatMsg {
  role: 'user' | 'assistant'
  text: string
  codes?: string[]
  action?: AssistantAction | null
  actionLabel?: string
  actionDone?: string | null
  raw?: string // JSON ดิบของ AI ไว้ส่งเป็นบริบทตาถัดไป
}

const SUGGESTIONS = [
  'มีทรัพย์อะไรว่างให้เช่าบ้างตอนนี้',
  'โกดังแถวบางพลี งบไม่เกิน 100,000 มีไหม',
  'ทรัพย์ไหนมีเครนบ้าง',
  'สรุปแผนเยี่ยมชมที่มีอยู่ให้หน่อย',
]

/** ประวัติจากเครื่อง — ตัด action ค้างทิ้ง (ข้อมูลแผน/ทรัพย์อาจเปลี่ยนไปแล้ว) */
function loadHistory(): ChatMsg[] {
  try {
    const arr = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as ChatMsg[]
    return arr.map((m) => ({ ...m, action: null, actionLabel: undefined }))
  } catch {
    return []
  }
}

/** ปุ่มลอย ✨ + แผงแชทผู้ช่วย — mount ครั้งเดียวใน App shell */
export default function Assistant() {
  const location = useLocation()
  const [open, setOpen] = useState(false)
  // ซ่อนปุ่มลอยในหน้าฟอร์ม (ชนแถบบันทึกที่ sticky อยู่ล่างจอมือถือ)
  const onForm = location.pathname.startsWith('/new') || location.pathname.startsWith('/edit')
  const access = usePlanAccess()
  return (
    <>
      {!open && !onForm && access.ai && (
        <button className="assist-fab" data-tour="assistant" onClick={() => setOpen(true)} title="ผู้ช่วย AI">
          <IconSparkles size={23} />
        </button>
      )}
      {open && <AssistantPanel onClose={() => setOpen(false)} />}
    </>
  )
}

function AssistantPanel({ onClose }: { onClose: () => void }) {
  const { items, reload: reloadProps } = useProperties()
  const { plans, reload: reloadPlans } = usePlans()
  const navigate = useNavigate()

  const [msgs, setMsgs] = useState<ChatMsg[]>(loadHistory)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [speakOn, setSpeakOn] = useState(() => localStorage.getItem(SPEAK_KEY) === '1')
  const [preview, setPreview] = useState<Property | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const byCode = useMemo(() => new Map(items.map((p) => [p.code, p])), [items])
  const byId = useMemo(() => new Map(items.map((p) => [p.id, p])), [items])
  const planByRef = (ref?: string) => {
    const m = ref?.match(/^P(\d+)$/i)
    return m ? (plans[Number(m[1]) - 1] ?? null) : null
  }

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(msgs.slice(-40)))
    bodyRef.current?.scrollTo(0, 9e9)
  }, [msgs])
  useEffect(() => {
    localStorage.setItem(SPEAK_KEY, speakOn ? '1' : '0')
    if (!speakOn) window.speechSynthesis?.cancel()
  }, [speakOn])
  useEffect(() => () => window.speechSynthesis?.cancel(), [])

  function speak(text: string) {
    if (!speakOn || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'th-TH'
    window.speechSynthesis.speak(u)
  }

  function systemPrompt(ctxText: string): string {
    const { picked, total, trimmed } = selectRelevant(items, ctxText, MAX_CATALOG)
    const catalog = picked.map(propertyBrief).join('\n') || '(ยังไม่มีทรัพย์ในระบบ)'
    const plansBrief =
      plans
        .map(
          (pl, i) =>
            `P${i + 1} | ${pl.title} | ลูกค้า ${pl.customer_name ?? '-'} | นัด ${pl.visit_date ?? '-'} | จุดแวะ: ${pl.stops.map((s) => byId.get(s.property_id)?.code).filter(Boolean).join(', ') || '-'} | req: ${pl.requirement ?? '-'}`,
        )
        .join('\n') || '(ยังไม่มีแผนเยี่ยมชม)'
    return `คุณคือ "ผู้ช่วย HOP" ผู้ช่วย AI ในแอปฐานข้อมูลทรัพย์ให้เช่า/ขายของทีมนายหน้าอสังหาริมทรัพย์
วันนี้: ${new Date().toISOString().slice(0, 10)}

ทรัพย์ในระบบ${trimmed ? ` — คัดมา ${picked.length} รายการที่เกี่ยวกับบทสนทนาที่สุด จากทั้งหมด ${total}` : ` (ทั้งหมด ${total} รายการ)`} (1 บรรทัด = 1 ทรัพย์ เริ่มด้วยรหัส):
${catalog}

แผนเยี่ยมชมลูกค้า (รหัสแผน | ชื่อแผน | ลูกค้า | วันนัด | จุดแวะ | requirement):
${plansBrief}

กติกาการตอบ (ต้องทำทุกข้อ):
1. ตอบเป็น JSON object เดียวเท่านั้น: {"reply":"ข้อความตอบ","properties":[],"action":null,"action_label":null}
2. reply ภาษาไทย สั้นกระชับ เป็นกันเอง ไม่ใช้ markdown
3. เรื่องทรัพย์/แผนตอบจากข้อมูลด้านบนเท่านั้น ห้ามแต่งข้อมูลเอง ถ้าไม่พบให้บอกตรงๆ
4. เมื่อพูดถึงทรัพย์ ใส่รหัสทรัพย์ลง properties (ไม่เกิน 6) เพื่อให้แอปแสดงการ์ดให้ผู้ใช้กด
5. ใส่ action เฉพาะเมื่อผู้ใช้สั่งให้ทำจริงๆ และใช้ได้ 4 แบบนี้เท่านั้น (ห้ามคิดแบบอื่น):
   {"type":"add_stop","plan":"P1","codes":["รหัสทรัพย์"]} = เพิ่มทรัพย์เข้ารูทของแผน
   {"type":"remove_stop","plan":"P1","codes":["รหัสทรัพย์"]} = เอาทรัพย์ออกจากรูท
   {"type":"create_plan","title":"ชื่อแผน","customer_name":null,"visit_date":"YYYY-MM-DD หรือ null","requirement":null,"codes":[]} = สร้างแผนเยี่ยมชมใหม่
   {"type":"open_compare","codes":["รหัส 2-4 ตัว"]} = เปิดหน้าเปรียบเทียบทรัพย์
   และใส่ action_label ข้อความสั้นๆ สำหรับปุ่มยืนยัน — ระบบจะให้ผู้ใช้กดยืนยันก่อนทำจริงเสมอ
6. คำถามความรู้ทั่วไปด้านอสังหาฯ ตอบได้ แต่เรื่องกฎหมาย/ภาษี ให้แนะนำตรวจกับผู้เชี่ยวชาญเพิ่มเติม${trimmed ? `
7. รายการทรัพย์ด้านบนถูกคัดมาเฉพาะที่เกี่ยวข้อง — ถ้าไม่พบสิ่งที่ผู้ใช้ถาม ห้ามสรุปว่า "ไม่มีในระบบ" ให้บอกว่าไม่พบในรายการที่คัดมา และแนะนำให้ระบุประเภท/ทำเล/รหัสให้ชัดขึ้น` : ''}`
  }

  /** ตรวจ action จาก AI: อ้างอิงต้องมีจริง ไม่งั้นตัดทิ้ง */
  function sanitizeAction(a: unknown, fallbackLabel?: string): { action: AssistantAction; label: string } | null {
    if (!a || typeof a !== 'object') return null
    const act = a as AssistantAction
    const codes = (act.codes ?? []).filter((c) => byCode.has(c))
    if (act.type === 'add_stop' || act.type === 'remove_stop') {
      const pl = planByRef(act.plan)
      if (!pl || codes.length === 0) return null
      const verb = act.type === 'add_stop' ? 'เพิ่ม' : 'เอา'
      const dir = act.type === 'add_stop' ? 'เข้ารูท' : 'ออกจากรูท'
      return { action: { ...act, codes }, label: fallbackLabel || `${verb} ${codes.join(', ')} ${dir} "${pl.title}"` }
    }
    if (act.type === 'create_plan') {
      if (!act.title?.trim()) return null
      return {
        action: { ...act, codes },
        label: fallbackLabel || `สร้างแผน "${act.title.trim()}"${codes.length ? ` พร้อม ${codes.length} จุดแวะ` : ''}`,
      }
    }
    if (act.type === 'open_compare') {
      if (codes.length < 2) return null
      return { action: { ...act, codes: codes.slice(0, 4) }, label: fallbackLabel || `เปิดเปรียบเทียบ ${codes.slice(0, 4).join(' · ')}` }
    }
    return null
  }

  async function send(text: string) {
    const q = text.trim()
    if (!q || busy) return
    setInput('')
    const history: ChatMsg[] = [...msgs, { role: 'user', text: q }]
    setMsgs(history)
    setBusy(true)
    try {
      const ctx = history.slice(-CONTEXT_MSGS).map((m) => ({
        role: m.role,
        content: m.role === 'assistant' ? (m.raw ?? m.text).slice(0, 900) : m.text,
      }))
      // ใช้ข้อความล่าสุดในบทสนทนา (รวมรหัสทรัพย์บนการ์ดที่ AI เคยแนบ) เป็นตัวคัดแคตตาล็อก
      const ctxText = history
        .slice(-CONTEXT_MSGS)
        .map((m) => [m.text, ...(m.codes ?? [])].join(' '))
        .join(' ')
      const raw = await aiChat([{ role: 'system', content: systemPrompt(ctxText) }, ...ctx], 0.2)
      const parsed = extractJson<{ reply?: string; properties?: string[]; action?: unknown; action_label?: string }>(raw)
      const reply =
        parsed?.reply?.trim() ||
        (raw.includes('{') ? 'ขอโทษครับ ตอบไม่สำเร็จ ลองถามใหม่อีกครั้ง' : raw.trim().slice(0, 600))
      const codes = (parsed?.properties ?? []).filter((c) => byCode.has(c)).slice(0, 6)
      const act = sanitizeAction(parsed?.action, parsed?.action_label?.trim())
      setMsgs((m) => [
        ...m,
        { role: 'assistant', text: reply, codes, action: act?.action ?? null, actionLabel: act?.label, raw: raw.slice(0, 900) },
      ])
      speak(reply)
    } catch (err) {
      setMsgs((m) => [...m, { role: 'assistant', text: `ขอโทษครับ ${err instanceof Error ? err.message : String(err)}` }])
    } finally {
      setBusy(false)
    }
  }

  /** ทำ action หลังผู้ใช้กดยืนยัน */
  async function runAction(idx: number) {
    const msg = msgs[idx]
    const a = msg.action
    if (!a || busy) return
    const done = (result: string) =>
      setMsgs((m) => m.map((x, i) => (i === idx ? { ...x, action: null, actionDone: result } : x)))
    try {
      if (a.type === 'open_compare') {
        navigate(`/compare?codes=${encodeURIComponent((a.codes ?? []).join(','))}`)
        logActivity('ai.assistant', (a.codes ?? []).join(', '), { type: a.type })
        done(`✅ เปิดหน้าเปรียบเทียบ ${(a.codes ?? []).join(', ')} แล้ว`)
        onClose()
        return
      }
      if (a.type === 'create_plan') {
        const dateOk = a.visit_date && /^\d{4}-\d{2}-\d{2}$/.test(a.visit_date) ? a.visit_date : null
        const { error } = await supabase.from('visit_plans').insert({
          title: a.title!.trim(),
          customer_name: a.customer_name?.trim() || null,
          visit_date: dateOk,
          requirement: a.requirement?.trim() || null,
          stops: (a.codes ?? []).map((c) => ({ property_id: byCode.get(c)!.id })),
        })
        if (error) throw new Error(error.message)
        await reloadPlans()
        logActivity('ai.assistant', a.title!.trim(), { type: a.type })
        done(`✅ สร้างแผน "${a.title!.trim()}" แล้ว — ดูได้ที่เมนูแผนเยี่ยมชม`)
        return
      }
      const pl = planByRef(a.plan)
      if (!pl) throw new Error('ไม่พบแผนที่อ้างถึงแล้ว (ข้อมูลอาจเปลี่ยน)')
      const ids = (a.codes ?? []).map((c) => byCode.get(c)!.id)
      const stops =
        a.type === 'add_stop'
          ? [...pl.stops, ...ids.filter((id) => !pl.stops.some((s) => s.property_id === id)).map((id) => ({ property_id: id }))]
          : pl.stops.filter((s) => !ids.includes(s.property_id))
      const { error } = await supabase.from('visit_plans').update({ stops }).eq('id', pl.id)
      if (error) throw new Error(error.message)
      await reloadPlans()
      logActivity('ai.assistant', (a.codes ?? []).join(', '), { type: a.type, plan: pl.title })
      done(`✅ ${a.type === 'add_stop' ? 'เพิ่ม' : 'เอา'} ${(a.codes ?? []).join(', ')} ${a.type === 'add_stop' ? 'เข้ารูท' : 'ออกจากรูท'} "${pl.title}" แล้ว`)
    } catch (err) {
      done(`⚠️ ทำไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  function clearChat() {
    if (msgs.length && !window.confirm('ล้างบทสนทนาทั้งหมด?')) return
    setMsgs([])
  }

  return (
    <>
      <div className="assist-overlay" onClick={onClose} />
      <aside className="assist-panel">
        <div className="assist-head">
          <span className="assist-title"><IconSparkles size={17} /> ผู้ช่วย HOP</span>
          <button
            className={`icon-btn ${speakOn ? 'on' : ''}`}
            title={speakOn ? 'ปิดเสียงอ่านคำตอบ' : 'เปิดเสียงอ่านคำตอบ'}
            onClick={() => setSpeakOn((v) => !v)}
          >
            {speakOn ? <IconVolume /> : <IconVolumeOff />}
          </button>
          <button className="icon-btn" title="ล้างบทสนทนา" onClick={clearChat}><IconTrash /></button>
          <button className="icon-btn" title="ปิด" onClick={onClose}><IconClose /></button>
        </div>

        <div className="assist-body" ref={bodyRef}>
          {msgs.length === 0 && (
            <div className="assist-welcome">
              <p>สวัสดีครับ ถามเรื่องทรัพย์ในระบบ แผนเยี่ยมชม หรือสั่งงานได้เลย
                เช่น "เพิ่ม JKP01 เข้ารูทคุณสมชาย"</p>
              <div className="assist-suggest">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="chip-toggle" onClick={() => void send(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`msg ${m.role === 'user' ? 'user' : 'ai'}`}>
              <div className="msg-text">{m.text}</div>
              {m.codes && m.codes.length > 0 && (
                <div className="assist-props">
                  {m.codes.map((c) => {
                    const p = byCode.get(c)
                    return p ? (
                      <button key={c} className="assist-prop" onClick={() => setPreview(p)}>
                        <IconHouse size={14} /> {c}
                      </button>
                    ) : null
                  })}
                </div>
              )}
              {m.action && (
                <button className="btn primary sm assist-action" onClick={() => void runAction(i)}>
                  ✓ {m.actionLabel}
                </button>
              )}
              {m.actionDone && <div className="assist-done">{m.actionDone}</div>}
            </div>
          ))}
          {busy && (
            <div className="msg ai typing"><span /><span /><span /></div>
          )}
        </div>

        <form
          className="assist-input"
          onSubmit={(e) => {
            e.preventDefault()
            void send(input)
          }}
        >
          <VoiceButton compact onText={(t) => setInput((d) => (d ? `${d} ` : '') + t)} />
          <input
            value={input}
            placeholder="ถามหรือสั่งงานผู้ช่วย…"
            onChange={(e) => setInput(e.target.value)}
          />
          <button type="submit" className="btn primary assist-send" disabled={busy || !input.trim()} title="ส่ง">
            <IconSend size={17} />
          </button>
        </form>
      </aside>

      {preview && (
        <PropertyDetail
          property={preview}
          onClose={() => setPreview(null)}
          onEdit={() => {
            setPreview(null)
            onClose()
            navigate(`/edit/${preview.id}`)
          }}
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
