// ตรวจบริการ AI ต้นทางจากในคอนเทนเนอร์ api (ใช้คีย์ใน env โดยไม่แสดงคีย์ออกมา) — ข้อมูลทดสอบเป็นข้อมูลสมมติทั้งหมด
// ใช้บนเครื่อง:  cd ~/hop/deploy && docker compose exec -T api node --input-type=module < ai-check.mjs
// วัด: คำขอเล็ก · คำขอขนาดเท่าผู้ช่วย AI จริง · (aunjai: แบบปิดการ "คิด") · แบบ stream · ยิงพร้อมกัน 3 ครั้ง
// ใช้ตัวเลือกผู้ให้บริการตัวเดียวกับ api/ai.js ในคอนเทนเนอร์ (AI_PROVIDER) — ผลจึงตรงกับที่ผู้ใช้เจอจริง
const { llmConfig } = await import('/app/api/_lib/llm.js')
const llm = llmConfig()
const { url, model } = llm
if (!llm.key) { console.log(`❌ ไม่มี ${llm.keyName} ในคอนเทนเนอร์`); process.exit(1) }
const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + llm.key }
const LIMIT_MS = 150_000

const types = ['คอนโด เช่า', 'บ้านเดี่ยว ขาย', 'โกดัง เช่า', 'ออฟฟิศ เช่า', 'ที่ดินเปล่า ขาย']
const areas = ['บางนา กรุงเทพฯ', 'บางพลี สมุทรปราการ', 'ลาดกระบัง กรุงเทพฯ', 'เมืองชลบุรี ชลบุรี', 'ประเวศ กรุงเทพฯ']
const catalog = Array.from({ length: 40 }, (_, i) =>
  `DEMO${100 + i} | ${types[i % 5]} | ${areas[i % 5]} | ${(i + 1) * 3500} ฿/เดือน | ${30 + i * 4} ตร.ม. | ${i % 3} นอน | ใกล้รถไฟฟ้า ${(i % 4) + 1} กม. | ว่าง`,
).join('\n')
const system = `คุณคือผู้ช่วยนายหน้าอสังหาฯ ตอบภาษาไทยสั้นๆ แล้วตอบเป็น JSON {"reply":"...","properties":["รหัส"]}\nแคตตาล็อกทรัพย์:\n${catalog}`
const real = [{ role: 'system', content: system }, { role: 'user', content: 'หาคอนโดเช่าแถวบางนา งบไม่เกิน 20,000 ใกล้รถไฟฟ้า แนะนำ 3 ที่' }]

const sec = (t) => ((Date.now() - t) / 1000).toFixed(1) + 's'

async function call(tag, extra) {
  const t = Date.now()
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), LIMIT_MS)
  try {
    const r = await fetch(url, { method: 'POST', headers, signal: ctl.signal,
      body: JSON.stringify({ model, temperature: 0.2, max_tokens: llm.maxTokens, messages: real, ...extra }) })
    if (extra?.stream) {
      // stream: นับเวลาถึงชิ้นแรก + ความยาวคำตอบ/ความคิดที่ได้
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
    const c = j?.choices?.[0], m = c?.message || {}
    const reasoning = m.reasoning_content ?? m.reasoning ?? ''
    console.log(`${tag}: status ${r.status} · ${sec(t)} · หยุดเพราะ ${c?.finish_reason} · คำตอบ ${String(m.content ?? '').length} ตัวอักษร · ความคิด ${String(reasoning).length} ตัวอักษร · usage ${JSON.stringify(j?.usage ?? {})}`
      + (j ? (j.error ? ` · error ${JSON.stringify(j.error).slice(0, 160)}` : '') : ` · ตอบไม่ใช่ JSON: ${txt.slice(0, 160).replace(/\s+/g, ' ')}`))
  } catch (e) {
    console.log(`${tag}: ${e.name === 'AbortError' ? `ไม่ตอบเกิน ${LIMIT_MS / 1000}s` : 'เชื่อมต่อไม่ได้ · ' + e.message} · ${sec(t)}`)
  } finally { clearTimeout(timer) }
}

console.log(`ผู้ให้บริการ ${llm.name} · โมเดล ${model} · host ${new URL(url).host} · prompt ${system.length} ตัวอักษร`)
try {
  const r = await fetch(url.replace(/\/chat\/completions$/, '/models'), { headers })
  const j = await r.json()
  const ids = (j.data || []).map((m) => String(m.id).replace(/^models\//, ''))
  console.log(`0 รายชื่อโมเดล: status ${r.status} · ${ids.includes(model) ? '✅ มี' : '❌ ไม่พบ'} ${model} · ${ids.filter((i) => !/embed|image|tts|veo|imagen/.test(i)).slice(0, 12).join(', ')}`)
} catch (e) { console.log('0 รายชื่อโมเดล: ดูไม่ได้ ·', e.message) }
await call('1 คำขอเล็ก', { messages: [{ role: 'user', content: 'ตอบคำว่า ok' }], max_tokens: llm.name === 'Gemini' ? 200 : 50 })
await call('2 ขนาดจริง', {})
if (llm.name === 'aunjai') await call('3 ปิดการคิด', { chat_template_kwargs: { enable_thinking: false } })
await call('4 แบบ stream', { stream: true })
await Promise.all(['5A', '5B', '5C'].map((k) => call(`${k} พร้อมกัน`, {})))
console.log('เสร็จ')
