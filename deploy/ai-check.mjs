// ตรวจบริการ AI ต้นทางจากในคอนเทนเนอร์ api (ใช้คีย์ใน env โดยไม่แสดงคีย์ออกมา) — ข้อมูลทดสอบเป็นข้อมูลสมมติทั้งหมด
// ใช้บนเครื่อง:  cd ~/hop/deploy && docker compose exec -T api node --input-type=module < ai-check.mjs
// ใช้ตัวเลือกผู้ให้บริการ + รูปแบบคำขอ/คำตอบตัวเดียวกับ api/ai.js ในคอนเทนเนอร์ (AI_PROVIDER) — ผลจึงตรงกับที่ผู้ใช้เจอจริง
// วัด: รายชื่อโมเดล · คำขอเล็ก · คำขอขนาดเท่าผู้ช่วย AI จริง · (aunjai: ปิดการ "คิด" / stream) · ยิงพร้อมกัน 3 ครั้ง
const { llmConfig, llmRequest, llmParse } = await import('/app/api/_lib/llm.js')
const llm = llmConfig()
const LIMIT_MS = 150_000
if (!llm.key) { console.log(`❌ ไม่มี ${llm.keyName} ในคอนเทนเนอร์`); process.exit(1) }

// รูปร่างคีย์ (ไม่แสดงตัวคีย์) — ช่วยจับคีย์ที่วางเกิน/ขาด/ติดช่องว่างหรือเครื่องหมายคำพูด
const k = llm.key
const kind = k.startsWith('AQ.') ? 'แบบใหม่ AQ.' : k.startsWith('AIza') ? 'แบบเก่า AIza' : '⚠️ ไม่รู้จักรูปแบบ'
console.log(`คีย์ ${llm.keyName}: ยาว ${k.length} ตัว · ช่องว่าง/ขึ้นบรรทัด ${/\s/.test(k) ? '⚠️ มี' : 'ไม่มี'} · เครื่องหมายคำพูด ${/["'`]/.test(k) ? '⚠️ มี' : 'ไม่มี'}`
  + (llm.name === 'Gemini' ? ` · ${kind}` : ''))
const host = new URL(llm.url || llm.base).host

const types = ['คอนโด เช่า', 'บ้านเดี่ยว ขาย', 'โกดัง เช่า', 'ออฟฟิศ เช่า', 'ที่ดินเปล่า ขาย']
const areas = ['บางนา กรุงเทพฯ', 'บางพลี สมุทรปราการ', 'ลาดกระบัง กรุงเทพฯ', 'เมืองชลบุรี ชลบุรี', 'ประเวศ กรุงเทพฯ']
const catalog = Array.from({ length: 40 }, (_, i) =>
  `DEMO${100 + i} | ${types[i % 5]} | ${areas[i % 5]} | ${(i + 1) * 3500} ฿/เดือน | ${30 + i * 4} ตร.ม. | ${i % 3} นอน | ใกล้รถไฟฟ้า ${(i % 4) + 1} กม. | ว่าง`,
).join('\n')
const system = `คุณคือผู้ช่วยนายหน้าอสังหาฯ ตอบภาษาไทยสั้นๆ แล้วตอบเป็น JSON {"reply":"...","properties":["รหัส"]}\nแคตตาล็อกทรัพย์:\n${catalog}`
const real = [{ role: 'system', content: system }, { role: 'user', content: 'หาคอนโดเช่าแถวบางนา งบไม่เกิน 20,000 ใกล้รถไฟฟ้า แนะนำ 3 ที่' }]

const sec = (t) => ((Date.now() - t) / 1000).toFixed(1) + 's'

async function call(tag, { messages = real, maxTokens, extraBody, stream } = {}) {
  const t = Date.now()
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), LIMIT_MS)
  try {
    const rq = llmRequest(llm, messages, { temperature: 0.2, maxTokens, extraBody: stream ? { ...extraBody, stream: true } : extraBody })
    const r = await fetch(rq.url, { method: 'POST', headers: rq.headers, body: JSON.stringify(rq.body), signal: ctl.signal })
    if (stream) {
      // stream (เฉพาะแบบ OpenAI): นับเวลาถึงชิ้นแรก + ความยาวคำตอบ/ความคิดที่ได้
      let first = null, content = '', reasoning = '', finish = null, buf = ''
      const dec = new TextDecoder()
      for await (const chunk of r.body) {
        if (first === null) first = sec(t)
        buf += dec.decode(chunk, { stream: true })
        let nl
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1)
          if (!line.startsWith('data:') || line.includes('[DONE]')) continue
          try {
            const c = JSON.parse(line.slice(5)).choices?.[0]
            content += c?.delta?.content ?? ''
            reasoning += c?.delta?.reasoning_content ?? c?.delta?.reasoning ?? ''
            finish = c?.finish_reason ?? finish
          } catch {}
        }
      }
      console.log(`${tag}: status ${r.status} · ชิ้นแรก ${first} · จบ ${sec(t)} · หยุดเพราะ ${finish} · คำตอบ ${content.length} ตัวอักษร · ความคิด ${reasoning.length} ตัวอักษร`)
      return
    }
    const txt = await r.text()
    let j = null
    try { j = JSON.parse(txt) } catch {}
    const p = j ? llmParse(llm, j) : {}
    console.log(`${tag}: status ${r.status} · ${sec(t)} · หยุดเพราะ ${p.finish} · คำตอบ ${String(p.content ?? '').length} ตัวอักษร · usage ${JSON.stringify(p.usage ?? {})}`
      + (j ? (p.error ? ` · error ${String(p.error).slice(0, 220)}` : '') : ` · ตอบไม่ใช่ JSON: ${txt.slice(0, 160).replace(/\s+/g, ' ')}`)
      + (p.content ? ` · ตัวอย่าง: ${String(p.content).slice(0, 80).replace(/\s+/g, ' ')}` : ''))
  } catch (e) {
    console.log(`${tag}: ${e.name === 'AbortError' ? `ไม่ตอบเกิน ${LIMIT_MS / 1000}s` : 'เชื่อมต่อไม่ได้ · ' + e.message} · ${sec(t)}`)
  } finally { clearTimeout(timer) }
}

console.log(`ผู้ให้บริการ ${llm.name} · โมเดล ${llm.model} · host ${host} · prompt ${system.length} ตัวอักษร`)
try {
  const isGemini = llm.name === 'Gemini'
  const listUrl = isGemini ? `${llm.base}/models?pageSize=200` : llm.url.replace(/\/chat\/completions$/, '/models')
  const headers = isGemini ? { 'x-goog-api-key': llm.key } : { Authorization: 'Bearer ' + llm.key }
  const r = await fetch(listUrl, { headers })
  const j = await r.json().catch(() => null)
  const ids = (isGemini ? j?.models ?? [] : j?.data ?? []).map((m) => String(m.name ?? m.id).replace(/^models\//, ''))
  const err = llmParse(llm, j).error
  console.log(`0 รายชื่อโมเดล: status ${r.status} · ${ids.includes(llm.model) ? '✅ มี' : '❌ ไม่พบ'} ${llm.model}`
    + (ids.length ? ` · ${ids.filter((i) => !/embed|image|tts|veo|imagen|aqa|live|audio/.test(i)).slice(0, 12).join(', ')}` : '')
    + (err ? ` · error ${String(err).slice(0, 220)}` : ''))
  if (!r.ok) { console.log('หยุดตรงนี้ — แก้ปัญหาข้อ 0 ก่อน (ทดสอบต่อก็ได้ผลเดียวกัน)'); process.exit(1) }
} catch (e) { console.log('0 รายชื่อโมเดล: ดูไม่ได้ ·', e.message) }

await call('1 คำขอเล็ก', { messages: [{ role: 'user', content: 'ตอบคำว่า ok' }], maxTokens: llm.name === 'Gemini' ? 200 : 50 })
await call('2 ขนาดจริง')
if (llm.name === 'aunjai') {
  await call('3 ปิดการคิด', { extraBody: { chat_template_kwargs: { enable_thinking: false } } })
  await call('4 แบบ stream', { stream: true })
}
await Promise.all(['5A', '5B', '5C'].map((x) => call(`${x} พร้อมกัน`)))
console.log('เสร็จ')
