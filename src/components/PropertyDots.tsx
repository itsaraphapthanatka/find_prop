import { useEffect, useState } from 'react'
import { useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import type { Property } from '../types'
import { PROPERTY_STYLE as PIN_STYLE, TYPE_FALLBACK as PIN_FALLBACK } from '../lib/propertyStyle'

export type GeoProperty = Property & { lat: number; lng: number }

// ทรัพย์ทุกชิ้นเป็น "จุดสีตามประเภท" วาดบน canvas (แบบ Google My Maps) — เห็นครบทุกจุดโดยไม่ต้องจับกลุ่ม
// เดิมใช้หมุด DOM (DivIcon) หลายร้อยตัวจนหน่วง → แก้ด้วย cluster แต่ทีมขายบอกว่าต้องซูมทีละกลุ่ม ใช้งานลำบาก
// canvas วาดหลายพันจุดได้ลื่น — ใช้ renderer เดียวกับแผนที่ (MapContainer renderer=…) ห้ามสร้าง L.canvas แยก:
// canvas ใบที่สองจะซ้อนทับและแย่งคลิก ทำให้กดจุดไม่ติดหลังเปิด popup ครั้งแรก
export default function PropertyDots({ items, onPick }: { items: GeoProperty[]; onPick: (p: GeoProperty) => void }) {
  const map = useMap()
  const [zoom, setZoom] = useState(map.getZoom())
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) })
  const radius = zoom >= 15 ? 9 : zoom >= 13 ? 7 : zoom >= 11 ? 5.5 : 4.5 // ซูมใกล้ = จุดใหญ่ขึ้น · ซูมไกลจุดเล็กลงไม่ทับกัน
  useEffect(() => {
    const group = L.layerGroup()
    for (const p of items) {
      const { color } = PIN_STYLE[p.property_type ?? ''] ?? PIN_FALLBACK
      L.circleMarker([p.lat, p.lng], {
        radius, color: '#ffffff', weight: 2, fillColor: color, fillOpacity: 0.95,
        bubblingMouseEvents: false, // กดจุดแล้วไม่ทะลุไปเป็นการคลิกแผนที่ (โหมดวางหมุด)
      })
        .bindTooltip(p.code, { direction: 'top', offset: [0, -radius] })
        .on('click', (e) => { e.target.closeTooltip(); onPick(p) }) // ปิดป้ายชื่อ ไม่ให้ซ้อนใต้ popup
        .addTo(group)
    }
    group.addTo(map)
    return () => { group.remove() }
  }, [map, items, radius, onPick])
  return null
}
