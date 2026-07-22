import { useEffect } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'

// หมุดสีม่วงตาม design system (divIcon เพื่อเลี่ยงปัญหาไฟล์รูป marker เริ่มต้นของ Leaflet ใน bundler)
const pickPin = L.divIcon({
  className: 'pick-pin',
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40">
    <path d="M15 1.5C7.8 1.5 2 7.3 2 14.5 2 21.5 8.5 30 15 38.5 21.5 30 28 21.5 28 14.5 28 7.3 22.2 1.5 15 1.5Z" fill="#7132f5" stroke="#ffffff" stroke-width="2"/>
    <circle cx="15" cy="14.5" r="4.6" fill="#ffffff"/>
  </svg>`,
  iconSize: [30, 40],
  iconAnchor: [15, 38],
})

// แถวสมุทรปราการ/บางพลี — center เริ่มต้นตอนยังไม่มีพิกัด
const DEFAULT_CENTER: [number, number] = [13.6, 100.75]

function ClickCapture({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => onPick(+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)),
  })
  return null
}

function Controller({ lat, lng }: { lat: number | null; lng: number | null }) {
  const map = useMap()
  // แผนที่ในฟอร์มอาจคำนวณขนาดพลาดตอน mount (layout ยังไม่นิ่ง) — บังคับวัดใหม่
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 0)
    return () => clearTimeout(t)
  }, [map])
  // เลื่อนแผนที่ไปที่พิกัดปัจจุบันเมื่อมีการปัก/กรอก/ใช้ GPS (คงระดับซูมเดิม)
  useEffect(() => {
    if (lat != null && lng != null) map.setView([lat, lng])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng])
  return null
}

export default function LocationPicker({
  lat, lng, onPick,
}: {
  lat: number | null
  lng: number | null
  /** ใส่ = แก้ไขได้ (แตะปักหมุด) · ไม่ใส่ = ดูอย่างเดียว (เช่น หน้ารายละเอียด) */
  onPick?: (lat: number, lng: number) => void
}) {
  const has = lat != null && lng != null
  return (
    <MapContainer
      center={has ? [lat as number, lng as number] : DEFAULT_CENTER}
      zoom={has ? 15 : 10}
      scrollWheelZoom={!!onPick}
      className="pick-map"
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      {onPick && <ClickCapture onPick={onPick} />}
      <Controller lat={lat} lng={lng} />
      {has && <Marker position={[lat as number, lng as number]} icon={pickPin} />}
    </MapContainer>
  )
}
