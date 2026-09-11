// แกะ/กางพิกัดจากลิงก์แผนที่ (ฝั่งเซิร์ฟเวอร์) — ใช้โดย api/backfill-latlng.js
// พอร์ตจาก src/lib/latlng.ts + เพิ่มตัว "กางลิงก์ย่อ" (maps.app.goo.gl) ที่ browser ทำเองไม่ได้

function valid(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

/** แกะพิกัดจากข้อความ/ลิงก์ Google Maps ที่ "มีตัวเลขพิกัดอยู่แล้ว" — คืน null ถ้าไม่มี */
export function parseLatLng(input) {
  if (!input) return null
  const s = String(input).trim()
  if (!s) return null
  // !3d/!4d = พิกัดสถานที่จริง (แม่นสุด) · จับแยกเพราะบางลิงก์สลับลำดับ
  const d3 = s.match(/!3d(-?\d+(?:\.\d+)?)/)
  const d4 = s.match(/!4d(-?\d+(?:\.\d+)?)/)
  if (d3 && d4) { const p = { lat: Number(d3[1]), lng: Number(d4[1]) }; if (valid(p.lat, p.lng)) return p }
  const q = s.match(/[?&](?:q|query|ll|center|destination)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/)
  if (q) { const p = { lat: Number(q[1]), lng: Number(q[2]) }; if (valid(p.lat, p.lng)) return p }
  const at = s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  if (at) { const p = { lat: Number(at[1]), lng: Number(at[2]) }; if (valid(p.lat, p.lng)) return p }
  // ข้อความพิกัดล้วน "13.6, 100.6"
  if (/^[^a-zA-Z]*$/.test(s.replace(/[NSEW]/gi, ''))) {
    const nums = s.match(/-?\d+(?:\.\d+)?/g)
    if (nums && nums.length === 2) { const p = { lat: Number(nums[0]), lng: Number(nums[1]) }; if (valid(p.lat, p.lng)) return p }
  }
  return null
}

/** ปัดทศนิยม 6 ตำแหน่ง (~0.1 ม.) */
export function round6(p) { return { lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) } }

const SHORT_LINK = /^https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.com\/maps\?)/i
export function isShortLink(u) { return SHORT_LINK.test(String(u || '').trim()) }

// ⚠️ กุญแจสำคัญ: ต้องใช้ User-Agent ที่ "ไม่ใช่เบราว์เซอร์" (เช่น curl) —
// ถ้าใช้ UA เบราว์เซอร์ Google จะเสิร์ฟหน้า app-deeplink (HTTP 200, ไม่มีพิกัด) แทนที่จะ 302
async function expandRedirect(u) {
  let url = u
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, {
      redirect: 'manual',
      headers: { 'User-Agent': 'curl/8.4.0', Accept: '*/*' },
    })
    const loc = res.headers.get('location')
    if (!loc) return url                 // ไม่ redirect ต่อ = URL สุดท้าย
    if (parseLatLng(loc)) return loc      // Location มีพิกัดแล้ว — พอ
    url = new URL(loc, url).toString()    // relative → absolute แล้วตามต่อ
  }
  return url
}

// ลิงก์แบบ place/ftid (…/?q=ชื่อสถานที่&ftid=…) ไม่มีพิกัดใน URL —
// พิกัดฝังอยู่ในหน้าเว็บ: window.APP_INITIALIZATION_STATE=[[[<ระยะ>,<lng>,<lat>],…] (Google เก็บ lng ก่อน lat)
async function fromMapsHtml(finalUrl) {
  try {
    const res = await fetch(finalUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'curl/8.4.0', Accept: 'text/html' },
    })
    if (!res.ok) return null
    const html = await res.text()
    const m = html.match(/APP_INITIALIZATION_STATE=\[\[\[-?\d+(?:\.\d+)?,(-?\d+\.\d+),(-?\d+\.\d+)\]/)
    if (m) {
      const p = { lat: Number(m[2]), lng: Number(m[1]) } // m[1]=lng, m[2]=lat
      if (valid(p.lat, p.lng)) return p
    }
    return null
  } catch {
    return null
  }
}

/** แกะพิกัดจาก map_url — ตรงๆ ก่อน · ลิงก์ย่อ→กาง redirect แล้วแกะ · ลิงก์ place/ftid→ดึงจากหน้าเว็บ (คืน null ถ้าไม่ได้) */
export async function resolveToLatLng(mapUrl) {
  const direct = parseLatLng(mapUrl)
  if (direct) return direct
  if (!isShortLink(mapUrl)) return null
  try {
    const finalUrl = await expandRedirect(String(mapUrl).trim())
    return parseLatLng(finalUrl) || (await fromMapsHtml(finalUrl))
  } catch {
    return null
  }
}
