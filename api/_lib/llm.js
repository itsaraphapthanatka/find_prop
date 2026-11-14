// เลือกผู้ให้บริการ LLM ให้ api/ai.js (และ deploy/ai-check.mjs ใช้ตัวเดียวกันเพื่อทดสอบให้ตรงกับของจริง)
//   ค่าเริ่ม           → เซิร์ฟเวอร์ aunjai แบบ OpenAI (AI_API_KEY · AI_API_URL · AI_MODEL)
//   AI_PROVIDER=gemini → Google Gemini API ตัวจริง (GEMINI_API_KEY · GEMINI_MODEL)
// สลับกลับ = ลบ AI_PROVIDER ออก (คีย์ของ aunjai ยังอยู่ ไม่ต้องตั้งใหม่)
//
// Gemini ใช้ endpoint generateContent + header x-goog-api-key ตามเอกสาร Google — ไม่ใช้ endpoint แบบ OpenAI
// เพราะ AI Studio ออกคีย์แบบใหม่ "AQ." (2026) ซึ่งใช้กับ Authorization: Bearer ไม่ได้ · คีย์เก่า "AIza" ก็ใช้แบบนี้ได้
export function llmConfig(env = process.env) {
  if ((env.AI_PROVIDER || '').trim().toLowerCase() === 'gemini') {
    return {
      name: 'Gemini',
      keyName: 'GEMINI_API_KEY',
      key: (env.GEMINI_API_KEY || '').trim(),
      base: (env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, ''),
      // flash-lite = รุ่นเสถียรที่เร็วและถูกที่สุด (เอกสาร Google 2026-11) — เปลี่ยนรุ่นได้ด้วย GEMINI_MODEL
      model: env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
      // Gemini 3 ปิดการคิดไม่ได้ — เผื่อเพดานให้ความคิด + คำตอบ (คำตอบ JSON ปกติ < 500 token)
      maxTokens: 2048,
    }
  }
  return {
    name: 'aunjai',
    keyName: 'AI_API_KEY',
    key: env.AI_API_KEY,
    url: env.AI_API_URL || 'https://consoletoken.aunjai.org/api/v1/chat/completions',
    model: env.AI_MODEL || 'gemma-4-12b',
    // เพดานความยาวคำตอบ — decode คือคอขวดของเซิร์ฟเวอร์ ถ้าปล่อยยาวไม่จำกัด
    // คำตอบเดียวที่เพี้ยนจะกินคิวของทุกคน
    maxTokens: 800,
  }
}

/** สร้างคำขอแชตตามรูปแบบของแต่ละเจ้า → { url, headers, body } (body เป็น object ยังไม่ stringify)
    messages = [{ role: 'system'|'user'|'assistant', content }] */
export function llmRequest(llm, messages, { temperature = 0.2, maxTokens = llm.maxTokens, extraBody } = {}) {
  const msgs = messages.map((m) => ({ role: m.role, content: String(m.content ?? '') }))
  if (llm.name === 'Gemini') {
    const system = msgs.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
    return {
      url: `${llm.base}/models/${encodeURIComponent(llm.model)}:generateContent`,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': llm.key },
      body: {
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: msgs
          .filter((m) => m.role !== 'system')
          .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        generationConfig: { temperature, maxOutputTokens: maxTokens },
        ...extraBody,
      },
    }
  }
  return {
    url: llm.url,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llm.key}` },
    body: { model: llm.model, messages: msgs, temperature, max_tokens: maxTokens, ...extraBody },
  }
}

/** อ่านคำตอบของแต่ละเจ้า → { content, finish, error, usage } (content = undefined ถ้าไม่มีคำตอบเลย) */
export function llmParse(llm, data) {
  // error: Gemini แบบ OpenAI ห่อเป็น array [{ error }] · แบบปกติเป็น { error }
  const e = (Array.isArray(data) ? data[0] : data)?.error
  const error = e ? e.message || e.status || JSON.stringify(e) : undefined
  if (llm.name === 'Gemini') {
    const cand = data?.candidates?.[0]
    // ตัดส่วน "ความคิด" (thought) ออก เหลือแต่คำตอบจริง
    const text = (cand?.content?.parts ?? []).filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('')
    return { content: cand ? text : undefined, finish: cand?.finishReason ?? data?.promptFeedback?.blockReason, error, usage: data?.usageMetadata }
  }
  const c = data?.choices?.[0]
  return { content: c?.message?.content, finish: c?.finish_reason, error, usage: data?.usage }
}
