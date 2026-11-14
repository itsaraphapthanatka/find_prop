// เลือกผู้ให้บริการ LLM ให้ api/ai.js (และ deploy/ai-check.mjs ใช้ตัวเดียวกันเพื่อทดสอบให้ตรงกับของจริง)
//   ค่าเริ่ม           → เซิร์ฟเวอร์ aunjai (AI_API_KEY · AI_API_URL · AI_MODEL)
//   AI_PROVIDER=gemini → Google Gemini ผ่าน endpoint แบบ OpenAI (GEMINI_API_KEY · GEMINI_MODEL)
// สลับกลับ = ลบ AI_PROVIDER ออก (คีย์ของ aunjai ยังอยู่ ไม่ต้องตั้งใหม่)
// ทั้งสองเจ้าพูดรูปแบบ OpenAI chat/completions + Authorization: Bearer
// (ยืนยัน 2026-11-14: คีย์ AI Studio แบบใหม่ "AQ.…" 53 ตัว ใช้กับ endpoint นี้ได้ — ตอบ ~1 วินาที)
export function llmConfig(env = process.env) {
  if ((env.AI_PROVIDER || '').trim().toLowerCase() === 'gemini') {
    const base = (env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '')
    return {
      name: 'Gemini',
      keyName: 'GEMINI_API_KEY',
      key: (env.GEMINI_API_KEY || '').trim(),
      url: `${base}/openai/chat/completions`,
      // flash-lite = รุ่นเสถียรที่เร็วและถูกที่สุด (เอกสาร Google 2026-11) — เปลี่ยนรุ่นได้ด้วย GEMINI_MODEL
      model: env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
      // Gemini 3 ปิดการคิดไม่ได้ — เผื่อเพดานให้ความคิด + คำตอบ (คำตอบ JSON ปกติ < 500 token)
      maxTokens: 2048,
    }
  }
  return {
    name: 'aunjai',
    keyName: 'AI_API_KEY',
    key: (env.AI_API_KEY || '').trim(),
    url: env.AI_API_URL || 'https://consoletoken.aunjai.org/api/v1/chat/completions',
    model: env.AI_MODEL || 'gemma-4-12b',
    // เพดานความยาวคำตอบ — decode คือคอขวดของเซิร์ฟเวอร์ ถ้าปล่อยยาวไม่จำกัด
    // คำตอบเดียวที่เพี้ยนจะกินคิวของทุกคน
    maxTokens: 800,
  }
}

/** สร้างคำขอแชต → { url, headers, body } (body เป็น object ยังไม่ stringify)
    messages = [{ role: 'system'|'user'|'assistant', content }] */
export function llmRequest(llm, messages, { temperature = 0.2, maxTokens = llm.maxTokens, extraBody } = {}) {
  return {
    url: llm.url,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llm.key}` },
    body: {
      model: llm.model,
      messages: messages.map((m) => ({ role: m.role, content: String(m.content ?? '') })),
      temperature,
      max_tokens: maxTokens,
      ...extraBody,
    },
  }
}

/** อ่านคำตอบ → { content, finish, error, usage } (content = undefined ถ้าไม่มีคำตอบเลย) */
export function llmParse(llm, data) {
  // error: Gemini ห่อเป็น array [{ error }] · เจ้าแบบ OpenAI ทั่วไปเป็น { error }
  const e = (Array.isArray(data) ? data[0] : data)?.error
  const error = e ? e.message || e.status || JSON.stringify(e) : undefined
  const c = data?.choices?.[0]
  return { content: c?.message?.content, finish: c?.finish_reason, error, usage: data?.usage }
}
