// เลือกผู้ให้บริการ LLM ให้ api/ai.js (และ deploy/ai-check.mjs ใช้ตัวเดียวกันเพื่อทดสอบให้ตรงกับของจริง)
//   ค่าเริ่ม           → เซิร์ฟเวอร์ aunjai (AI_API_KEY · AI_API_URL · AI_MODEL)
//   AI_PROVIDER=gemini → Google Gemini ผ่าน endpoint แบบ OpenAI (GEMINI_API_KEY · GEMINI_MODEL)
// สลับกลับ = ลบ AI_PROVIDER ออก (คีย์ของ aunjai ยังอยู่ ไม่ต้องตั้งใหม่)
export function llmConfig(env = process.env) {
  if ((env.AI_PROVIDER || '').trim().toLowerCase() === 'gemini') {
    return {
      name: 'Gemini',
      keyName: 'GEMINI_API_KEY',
      key: env.GEMINI_API_KEY,
      url: env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
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
