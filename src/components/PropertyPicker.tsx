import { useMemo, useState } from 'react'
import type { Property } from '../types'
import { formatNumber } from '../labels'
import { photoThumb } from '../lib/photo'
import { ListingTag, TypeTag } from '../lib/propertyStyle'
import { IconHouse } from './icons'

// ตัวเลือกทรัพย์สำหรับหน้าเปรียบเทียบ — เดิมเป็นช่องพิมพ์ที่เห็นแค่ "รหัสทรัพย์"
// ทีมขายบอกว่าเลือกไม่ถูก (ไม่รู้ว่ารหัสไหนคือทรัพย์ไหน) และกรองไม่ได้
// → โชว์รูปย่อ + ประเภท + ทำเล + ราคา · ค้นได้ทั้งรหัส/โครงการ/ทำเล · กรองประเภทและเช่า/ขาย

const SHOW = 60 // แสดงสูงสุดต่อครั้ง (ค้นหา/กรองเพื่อเจาะต่อ) — กันรายการหลายร้อยแถวทำให้หน้าหน่วง

/** รูปย่อทรัพย์ (รองรับลิงก์ Google Drive จากข้อมูลเดิม) — โหลดไม่ได้/ไม่มีรูปแสดงไอคอนบ้าน */
export function PropThumb({ photo, alt }: { photo: string | null | undefined; alt: string }) {
  const [err, setErr] = useState(false)
  const src = photoThumb(photo, 200)
  if (!src || err) return <IconHouse size={20} />
  return <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setErr(true)} />
}

function priceText(p: Property): string {
  if (p.rent_per_month != null) return `${formatNumber(p.rent_per_month)} ฿/เดือน`
  if (p.sale_price != null) return `ขาย ${formatNumber(p.sale_price)} ฿`
  return ''
}

interface Props {
  items: Property[]
  picked: string[]
  max: number
  onToggle: (code: string) => void
}

export default function PropertyPicker({ items, picked, max, onToggle }: Props) {
  const [q, setQ] = useState('')
  const [fType, setFType] = useState<string | null>(null)
  const [fListing, setFListing] = useState<string | null>(null)

  // ชิปประเภท: เฉพาะประเภทที่มีทรัพย์จริง เรียงตามจำนวนมาก→น้อย
  const types = useMemo(() => {
    const n = new Map<string, number>()
    for (const p of items) if (p.property_type) n.set(p.property_type, (n.get(p.property_type) ?? 0) + 1)
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)
  }, [items])

  const results = useMemo(() => {
    const term = q.trim().toLowerCase()
    return items.filter((p) =>
      (!fType || p.property_type === fType)
      // "เช่า/ขาย" นับรวมทั้งตอนกรองเช่าและกรองขาย
      && (!fListing || p.listing_type === fListing || p.listing_type === 'เช่า/ขาย')
      && (!term || [p.code, p.project_name, p.subdistrict, p.district, p.province, p.nearby, p.property_type]
        .filter(Boolean).join(' ').toLowerCase().includes(term)))
  }, [items, q, fType, fListing])

  const full = picked.length >= max

  return (
    <div className="pp">
      <input
        type="search" className="pp-search" value={q}
        placeholder="ค้นหา: รหัส · โครงการ · ทำเล · ประเภท"
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="pp-filters">
        <div className="chip-select">
          {types.map((t) => (
            <button key={t} type="button" className={`chip-toggle${fType === t ? ' on' : ''}`}
              onClick={() => setFType(fType === t ? null : t)}>{t}</button>
          ))}
        </div>
        <div className="chip-select">
          {['เช่า', 'ขาย'].map((t) => (
            <button key={t} type="button" className={`chip-toggle${fListing === t ? ' on' : ''}`}
              onClick={() => setFListing(fListing === t ? null : t)}>{t}</button>
          ))}
        </div>
      </div>
      <div className="pp-meta">
        พบ {results.length} รายการ
        {results.length > SHOW && ` · แสดง ${SHOW} รายการแรก — ค้นหาหรือกรองเพื่อเจาะเพิ่ม`}
        {full && <b> · เลือกครบ {max} รายการแล้ว</b>}
      </div>
      <div className="pp-list">
        {results.slice(0, SHOW).map((p) => {
          const on = picked.includes(p.code)
          const disabled = !on && full
          const price = priceText(p)
          return (
            <button key={p.id} type="button" className={`pp-row${on ? ' on' : ''}`} disabled={disabled}
              onClick={() => onToggle(p.code)}>
              <span className="pp-thumb"><PropThumb photo={p.photo_url} alt={p.code} /></span>
              <span className="pp-info">
                <span className="pp-top"><b>{p.code}</b><TypeTag type={p.property_type} /><ListingTag type={p.listing_type} /></span>
                <span className="pp-sub">{[p.project_name, p.district, p.province].filter(Boolean).join(' · ') || '—'}</span>
                {price && <span className="pp-price">{price}</span>}
              </span>
              <span className="pp-act">
                <span className="pp-act-long">{on ? '✓ เลือกแล้ว' : disabled ? 'ครบแล้ว' : '+ เลือก'}</span>
                <span className="pp-act-short" aria-hidden>{on ? '✓' : disabled ? '–' : '+'}</span>
              </span>
            </button>
          )
        })}
        {results.length === 0 && <div className="pp-empty">ไม่พบทรัพย์ที่ตรงเงื่อนไข</div>}
      </div>
    </div>
  )
}
