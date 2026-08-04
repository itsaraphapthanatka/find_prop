// พิกัดในฟอร์มใช้ช่องเดียว "ละติจูด, ลองจิจูด" (DB ยังเก็บแยก 2 คอลัมน์ lat/lng ตามเดิม)
// รองรับการวางจาก Google Maps ตรงๆ เพราะหน้างานนายหน้าก๊อปมาจากแอปแผนที่เกือบทุกครั้ง

export interface LatLng {
  lat: number
  lng: number
}

/** ช่วงพิกัดที่เป็นไปได้จริง (กันพิมพ์สลับ/ผิดตำแหน่ง) */
function valid(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

/**
 * แกะพิกัดจากข้อความที่ผู้ใช้พิมพ์/วาง — คืน null ถ้าอ่านไม่ได้
 * รับได้: "13.6, 100.6" · "13.6 100.6" · "13.6/100.6" · ลิงก์ Google Maps
 * (…/@13.6,100.6,17z · ?q=13.6,100.6 · !3d13.6!4d100.6 · goo.gl ที่มีพิกัดในข้อความ)
 */
export function parseLatLng(input: string | null | undefined): LatLng | null {
  if (!input) return null
  const s = String(input).trim()
  if (!s) return null

  // ลิงก์ Google Maps — เรียงตามความแม่น:
  // !3d/!4d = พิกัดของสถานที่จริง · @lat,lng = จุดกลางจอตอนก๊อป (คลาดจากตัวสถานที่ได้)
  // จับ !3d (lat) กับ !4d (lng) แยกกัน เพราะบางลิงก์สลับลำดับ
  const d3 = s.match(/!3d(-?\d+(?:\.\d+)?)/)
  const d4 = s.match(/!4d(-?\d+(?:\.\d+)?)/)
  if (d3 && d4) {
    const p = { lat: Number(d3[1]), lng: Number(d4[1]) }
    if (valid(p.lat, p.lng)) return p
  }
  const q = s.match(/[?&](?:q|query|ll|center|destination)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/)
  if (q) {
    const p = { lat: Number(q[1]), lng: Number(q[2]) }
    if (valid(p.lat, p.lng)) return p
  }
  const at = s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  if (at) {
    const p = { lat: Number(at[1]), lng: Number(at[2]) }
    if (valid(p.lat, p.lng)) return p
  }

  // ตัวเลข 2 ตัวคั่นด้วย , / ช่องว่าง — ต้องเป็นข้อความพิกัดล้วน ไม่ใช่ลิงก์ที่อ่านไม่ออก
  if (/^[^a-zA-Z]*$/.test(s.replace(/[NSEW]/gi, ''))) {
    const nums = s.match(/-?\d+(?:\.\d+)?/g)
    if (nums && nums.length === 2) {
      const p = { lat: Number(nums[0]), lng: Number(nums[1]) }
      if (valid(p.lat, p.lng)) return p
    }
  }
  return null
}

/** ข้อความที่โชว์ในช่องพิกัด (ยังไม่มีค่า = ว่าง) */
export function formatLatLng(lat: number | null | undefined, lng: number | null | undefined): string {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return ''
  return `${lat}, ${lng}`
}

/** ปัดทศนิยม 6 ตำแหน่ง (~0.1 ม.) — พอสำหรับปักหมุดและทำให้ข้อความไม่ยาวเกิน */
export function roundLatLng(p: LatLng): LatLng {
  return { lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) }
}
