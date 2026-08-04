// สี + ไอคอน (glyph SVG path, viewBox 0 0 24 24) ประจำประเภททรัพย์
// ใช้ร่วมกัน: หมุดแผนที่ (MapPage) + ปุ่มเลือกประเภทในฟอร์ม (FormPage)
// เพิ่มประเภทใหม่ที่นี่ที่เดียว — ให้ตรงกับ OPTIONS.property_type

export interface TypeStyle {
  color: string
  glyph: string
}

export const PROPERTY_STYLE: Record<string, TypeStyle> = {
  'โรงงาน': {
    color: '#2563eb', // น้ำเงิน
    glyph: '<path d="M2 21V9.5l6 3.2V9.5l6 3.2V9.5l6 3.2V21H2z"/><path d="M17 3h4v8h-4z"/>',
  },
  'โชว์รูม': {
    color: '#db2777', // ชมพูบานเย็น
    glyph: '<path d="M3.5 8 5 3h14l1.5 5c0 1.5-1.2 2.7-2.7 2.7-1.2 0-2.2-.7-2.6-1.8-.4 1.1-1.4 1.8-2.6 1.8s-2.2-.7-2.6-1.8c-.4 1.1-1.4 1.8-2.6 1.8C4.7 10.7 3.5 9.5 3.5 8z"/><path d="M5 12.5h14V21h-4.5v-5h-5v5H5z"/>',
  },
  'โกดัง': {
    color: '#d97706', // ส้มอำพัน
    glyph: '<path d="M3 21V9l9-5 9 5v12h-5v-7H8v7H3z"/>',
  },
  'ออฟฟิศ': {
    color: '#0d9488', // เขียวหัวเป็ด
    glyph: '<path fill-rule="evenodd" d="M5 21V4.5A1.5 1.5 0 0 1 6.5 3h11A1.5 1.5 0 0 1 19 4.5V21h-4v-4h-6v4H5zm3-14h3v3H8V7zm5 0h3v3h-3V7zm-5 5h3v3H8v-3zm5 0h3v3h-3v-3z"/>',
  },
  'โฮมออฟฟิศ': {
    color: '#0891b2', // ฟ้าเทอร์ควอยซ์ (คู่กับออฟฟิศแต่แยกออกจากกันได้)
    glyph: '<path fill-rule="evenodd" d="M12 3.5 2.5 11v10h19V11L12 3.5zM7 12.5h3.2v3H7v-3zm6.8 0H17v3h-3.2v-3zM10.4 17h3.2v4h-3.2v-4z"/>',
  },
  'บ้าน': {
    color: '#16a34a', // เขียว
    glyph: '<path d="M4 21v-9l8-7 8 7v9h-5.5v-5.5h-5V21H4z"/>',
  },
  'คอนโด': {
    color: '#6366f1', // คราม
    glyph: '<path fill-rule="evenodd" d="M7 21V3.8c0-.4.4-.8.8-.8h8.4c.4 0 .8.4.8.8V21h-3.5v-3.5h-3V21H7zm2.5-15h2v2h-2V6zm4 0h2v2h-2V6zm-4 4h2v2h-2v-2zm4 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm4 0h2v2h-2v-2z"/><path d="M4 21h16v.01H4z" stroke="#fff"/>',
  },
  'ที่ดินเปล่า': {
    color: '#a16207', // น้ำตาลดิน
    glyph: '<path d="M2.5 19 8.5 8l4.2 7 2.3-3.5 6.5 7.5H2.5z"/><circle cx="17.5" cy="6" r="2.2"/>',
  },
}

// ประเภทที่ไม่รู้จัก/ว่าง → บ้านสีเทา
export const TYPE_FALLBACK: TypeStyle = {
  color: '#64748b',
  glyph: '<path d="M4 21v-9l8-7 8 7v9h-5.5v-5.5h-5V21H4z"/>',
}

/** สีประจำประเภท (undefined ถ้าไม่รู้จัก — ใช้ตัดสินว่าจะลงสีปุ่มไหม) */
export const typeColor = (type?: string | null): string | undefined =>
  type ? PROPERTY_STYLE[type]?.color : undefined

/** ป้ายประเภททรัพย์: พื้นสีอ่อน + ตัวอักษรสีประจำประเภท (ประเภทไม่รู้จัก/ว่าง → ป้ายเริ่มต้น) */
export function TypeTag({ type }: { type?: string | null }) {
  if (!type) return null
  const c = typeColor(type)
  return (
    <span className="tag" style={c ? { background: `${c}22`, color: c } : undefined}>
      {type}
    </span>
  )
}

// ── สีผังเมือง (color_zone) → ตัวอย่างสีแบบตาราง legend ผังเมือง ──
// ลายจุดขาว = radial-gradient · เส้นแยง = repeating-linear-gradient (เลียนแบบผังจริง)
export const COLOR_ZONE_STYLE: Record<string, React.CSSProperties> = {
  'เหลือง': { background: '#fde047' },
  'เหลืองอ่อน': { background: '#fef9c3' },
  'เหลืองมีเส้นแยงเขียว': { background: 'repeating-linear-gradient(45deg, #fde047 0 5px, #16a34a 5px 8px)' },
  'ส้ม': { background: '#f97316' },
  'ส้มอ่อนมีจุดขาว': { background: 'radial-gradient(circle, #fff 1.3px, transparent 1.4px) 0 0 / 6px 6px, #fdba74' },
  'น้ำตาล': { background: '#78350f' },
  'น้ำตาลอ่อน': { background: '#eac9bd' },
  'แดง': { background: '#dc2626' },
  'ชมพู': { background: '#f472b6' },
  'ม่วง': { background: '#7e22ce' },
  'ม่วงอ่อนมีจุดขาว': { background: 'radial-gradient(circle, #fff 1.3px, transparent 1.4px) 0 0 / 6px 6px, #d8b4fe' },
  'เม็ดมะปราง': { background: '#c9aca6' },
  'เขียว': { background: '#16a34a' },
  'เขียวอ่อน': { background: '#d9f99d' },
  'เขียวมีเส้นแยงฟ้า': { background: 'repeating-linear-gradient(45deg, #16a34a 0 5px, #7dd3fc 5px 8px)' },
  'เขียวอ่อนมีเส้นแยงขาว': { background: 'repeating-linear-gradient(45deg, #bef264 0 5px, #fff 5px 8px)' },
  'ขาวมีกรอบเส้นแยงเขียว': { background: 'repeating-linear-gradient(45deg, #fff 0 5px, #86efac 5px 8px)', boxShadow: 'inset 0 0 0 1.5px #16a34a' },
  'น้ำเงิน': { background: '#2563eb' },
}

/** แถบสีตัวอย่างหน้าชื่อสีผังเมือง (สีที่พิมพ์เพิ่มเอง/ไม่รู้จัก = ไม่โชว์แถบ) */
export function ZoneSwatch({ zone }: { zone?: string | null }) {
  const st = zone ? COLOR_ZONE_STYLE[zone] : undefined
  if (!st) return null
  return (
    <span
      style={{
        display: 'inline-block', width: 24, height: 14, borderRadius: 3,
        border: '1px solid rgba(0,0,0,.2)', verticalAlign: '-2px', marginRight: 8,
        flex: 'none', ...st,
      }}
    />
  )
}

// สีป้าย "เช่า/ขาย" (listing_type) — คนละแกนกับประเภททรัพย์
export const LISTING_COLOR: Record<string, string> = {
  'เช่า': '#149e61',      // เขียว = เช่า (ต่อเนื่อง)
  'ขาย': '#2563eb',       // น้ำเงิน = ขาย (ขายขาด)
  'เช่า/ขาย': '#7c3aed',  // ม่วง = ได้ทั้งเช่าและขาย
}

/** ป้ายเช่า/ขาย: พื้นสีอ่อน + ตัวอักษรสีประจำค่า (ค่าไม่รู้จัก/ว่าง → ป้ายเริ่มต้น) */
/** ป้ายสถานะงาน — โชว์เฉพาะตอนปิดงานแล้ว (มีคนเช่า/ขายแล้ว) · เปิดงานอยู่ = ไม่มีป้าย */
export function DealTag({ status }: { status?: string | null }) {
  if (status !== 'rented' && status !== 'sold') return null
  return (
    <span className="tag" style={{ background: '#374151', color: '#fff' }}>
      {status === 'rented' ? 'เช่าแล้ว' : 'ขายแล้ว'}
    </span>
  )
}

/** ป้ายสัญญาเช่าใกล้หมด — โชว์เมื่อเหลือ ≤60 วันหรือหมดแล้ว (เตือนให้ต่อสัญญา/หาผู้เช่าใหม่) */
export function ContractTag({ end }: { end?: string | null }) {
  if (!end) return null
  const days = Math.ceil((new Date(`${end}T00:00:00`).getTime() - Date.now()) / 86400e3)
  if (days > 60) return null
  const expired = days < 0
  const c = expired ? '#dc2626' : '#d97706' // แดง = หมดแล้ว · ส้ม = ใกล้หมด
  return (
    <span className="tag" style={{ background: `${c}22`, color: c }}>
      {expired ? 'สัญญาหมดแล้ว' : days === 0 ? 'สัญญาหมดวันนี้' : `สัญญาเหลือ ${days} วัน`}
    </span>
  )
}

export function ListingTag({ type }: { type?: string | null }) {
  if (!type) return null
  const c = LISTING_COLOR[type]
  return (
    <span className="tag" style={c ? { background: `${c}22`, color: c } : undefined}>
      {type}
    </span>
  )
}

/** ไอคอนประเภท: กล่องสีประจำประเภท + glyph สีขาว (สไตล์เดียวกับหัวหมุดแผนที่) */
export function TypeIcon({ type, size = 22 }: { type?: string | null; size?: number }) {
  const { color, glyph } = (type && PROPERTY_STYLE[type]) || TYPE_FALLBACK
  return (
    <span className="type-ico" style={{ background: color, width: size, height: size }}>
      <svg
        width={Math.round(size * 0.64)}
        height={Math.round(size * 0.64)}
        viewBox="0 0 24 24"
        fill="#fff"
        dangerouslySetInnerHTML={{ __html: glyph }}
      />
    </span>
  )
}
