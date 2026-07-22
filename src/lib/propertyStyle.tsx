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
  'ครัวกลาง': {
    color: '#dc2626', // แดง
    glyph: '<path d="M3.5 10h17v1.5c0 3-1.7 5.6-4.5 6.9v1.1c0 .8-.7 1.5-1.5 1.5h-5c-.8 0-1.5-.7-1.5-1.5v-1.1C5.2 17.1 3.5 14.5 3.5 11.5V10z"/><path d="M8 8c0-1.8 1-1.8 1-3.3M12 8c0-1.8 1-1.8 1-3.3M16 8c0-1.8 1-1.8 1-3.3" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/>',
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
