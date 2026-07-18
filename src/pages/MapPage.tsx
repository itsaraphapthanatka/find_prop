import { useEffect, useMemo, useRef, useState } from 'react'
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { deleteProperty, useProperties } from '../hooks/useProperties'
import type { Property } from '../types'
import { formatNumber } from '../labels'
import PropertyDetail from '../components/PropertyDetail'
import { IconClose, IconLocate, IconPin } from '../components/icons'

// ไอคอนหมุดเริ่มต้นของ Leaflet ต้องชี้ URL รูปเองเมื่อใช้ผ่าน bundler
const pinIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
})

// หมุดชั่วคราว (สีม่วงตาม design system) สำหรับตำแหน่งทรัพย์ใหม่
const draftIcon = L.divIcon({
  className: 'draft-pin-wrap',
  html: '<div class="draft-pin"></div>',
  iconSize: [26, 38],
  iconAnchor: [13, 36],
  popupAnchor: [0, -34],
})

// จุดตำแหน่งปัจจุบันของผู้ใช้ (สไตล์จุดฟ้าแบบแอปแผนที่)
const meIcon = L.divIcon({
  className: 'me-dot-wrap',
  html: '<div class="me-dot"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  popupAnchor: [0, -10],
})

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  const done = useRef(false)
  useEffect(() => {
    if (done.current || points.length === 0) return
    done.current = true
    if (points.length === 1) map.setView(points[0], 13)
    else map.fitBounds(L.latLngBounds(points).pad(0.2))
  }, [map, points])
  return null
}

function ClickCatcher({ enabled, onPick }: {
  enabled: boolean
  onPick: (latlng: [number, number]) => void
}) {
  useMapEvents({
    click(e) {
      if (enabled) onPick([e.latlng.lat, e.latlng.lng])
    },
  })
  return null
}

export default function MapPage() {
  const { items, loading, reload } = useProperties()
  const [selected, setSelected] = useState<Property | null>(null)
  const [picking, setPicking] = useState(false)
  const [draft, setDraft] = useState<[number, number] | null>(null)
  const [map, setMap] = useState<L.Map | null>(null)
  const [me, setMe] = useState<{ pos: [number, number]; accuracy: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const focusId = params.get('focus')

  const withCoords = useMemo(
    () => items.filter((p): p is Property & { lat: number; lng: number } =>
      p.lat != null && p.lng != null),
    [items],
  )
  const points = useMemo(
    () => withCoords.map((p) => [p.lat, p.lng] as [number, number]),
    [withCoords],
  )
  const focused = focusId ? withCoords.find((p) => p.id === focusId) : undefined

  async function handleDelete(p: Property) {
    if (!window.confirm(`ลบรายการ ${p.code}?`)) return
    const err = await deleteProperty(p.id, p.code)
    if (err) alert(`ลบไม่สำเร็จ: ${err}`)
    else {
      setSelected(null)
      await reload()
    }
  }

  function addAtDraft() {
    if (!draft) return
    const [lat, lng] = draft
    navigate(`/new?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}`)
  }

  function locateMe() {
    if (!('geolocation' in navigator)) {
      alert('เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p: [number, number] = [pos.coords.latitude, pos.coords.longitude]
        setMe({ pos: p, accuracy: pos.coords.accuracy })
        setLocating(false)
        map?.flyTo(p, Math.max(map.getZoom(), 15), { duration: 0.8 })
      },
      (err) => {
        setLocating(false)
        alert(
          err.code === err.PERMISSION_DENIED
            ? 'ยังไม่ได้อนุญาตให้เข้าถึงตำแหน่ง — เปิดสิทธิ์ Location ให้เบราว์เซอร์/แอปก่อน แล้วลองใหม่'
            : 'หาตำแหน่งไม่สำเร็จ ลองใหม่อีกครั้ง',
        )
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    )
  }

  return (
    <div className={`map-page ${picking ? 'picking' : ''}`}>
      <div className="view-header">
        <h1>แผนที่ <span className="count-badge">{withCoords.length}</span></h1>
        <div className="header-actions">
          <button
            className={`btn ${picking ? 'primary' : ''}`}
            onClick={() => {
              setPicking((v) => !v)
              if (picking) setDraft(null)
            }}
          >
            {picking ? <><IconClose size={16} /> ยกเลิกวางหมุด</> : <><IconPin size={16} /> วางหมุดเพิ่มทรัพย์</>}
          </button>
          <button className="btn primary" onClick={() => navigate('/new')}>+ เพิ่มทรัพย์</button>
        </div>
      </div>
      {picking && !draft && (
        <div className="map-hint">คลิกตำแหน่งบนแผนที่เพื่อวางหมุดทรัพย์ใหม่</div>
      )}
      <div className="leaflet-holder">
        {!loading && (
          <button
            className="locate-btn"
            title="ไปที่ตำแหน่งปัจจุบันของฉัน"
            disabled={locating}
            onClick={locateMe}
          >
            <IconLocate size={20} className={locating ? 'locating' : undefined} />
          </button>
        )}
        {!loading && (
          <MapContainer
            ref={setMap}
            center={focused ? [focused.lat, focused.lng] : [13.6, 100.7]}
            zoom={focused ? 15 : 10}
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {!focused && <FitBounds points={points} />}
            <ClickCatcher
              enabled={picking}
              onPick={(latlng) => {
                setDraft(latlng)
                setPicking(false)
              }}
            />
            {withCoords.map((p) => (
              <Marker key={p.id} position={[p.lat, p.lng]} icon={pinIcon}>
                <Popup>
                  <div className="map-popup">
                    <div className="title">{p.code}</div>
                    <div>{[p.property_type, p.listing_type].filter(Boolean).join(' · ')}</div>
                    <div>{[p.district, p.province].filter(Boolean).join(', ')}</div>
                    {p.rent_per_month != null && (
                      <div>ค่าเช่า {formatNumber(p.rent_per_month)} บ./เดือน</div>
                    )}
                    <button className="btn sm" style={{ marginTop: 6 }} onClick={() => setSelected(p)}>
                      ดูรายละเอียด
                    </button>
                  </div>
                </Popup>
              </Marker>
            ))}
            {me && (
              <>
                <Circle
                  center={me.pos}
                  radius={me.accuracy}
                  pathOptions={{ color: '#2a78d6', weight: 1, opacity: 0.35, fillColor: '#2a78d6', fillOpacity: 0.08 }}
                />
                <Marker position={me.pos} icon={meIcon}>
                  <Popup>
                    <div className="map-popup">
                      <div className="title">ตำแหน่งของคุณ</div>
                      <div className="hint">แม่นยำ ±{Math.round(me.accuracy).toLocaleString('th-TH')} ม.</div>
                    </div>
                  </Popup>
                </Marker>
              </>
            )}
            {draft && (
              <>
                <Marker
                  position={draft}
                  icon={draftIcon}
                  draggable
                  eventHandlers={{
                    dragend: (e) => {
                      const ll = (e.target as L.Marker).getLatLng()
                      setDraft([ll.lat, ll.lng])
                    },
                  }}
                />
                <Popup position={draft} offset={[0, -34]} closeOnClick={false}>
                  <div className="map-popup">
                    <div className="title">ทรัพย์ใหม่ที่จุดนี้</div>
                    <div className="coords">{draft[0].toFixed(6)}, {draft[1].toFixed(6)}</div>
                    <div className="hint">ลากหมุดเพื่อปรับตำแหน่งได้</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button className="btn sm primary" onClick={addAtDraft}>
                        + เพิ่มทรัพย์ที่จุดนี้
                      </button>
                      <button className="btn sm" onClick={() => setDraft(null)}>ยกเลิก</button>
                    </div>
                  </div>
                </Popup>
              </>
            )}
          </MapContainer>
        )}
      </div>
      {selected && (
        <PropertyDetail
          property={selected}
          onClose={() => setSelected(null)}
          onEdit={() => navigate(`/edit/${selected.id}`)}
          onDelete={() => void handleDelete(selected)}
        />
      )}
    </div>
  )
}
