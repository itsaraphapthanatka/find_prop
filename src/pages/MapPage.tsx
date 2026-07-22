import { useEffect, useMemo, useRef, useState } from 'react'
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { deleteProperty, useProperties } from '../hooks/useProperties'
import { OrgFilterSelect, useOrgFilter } from '../hooks/useOrgFilter'
import { useAuth } from '../lib/auth'
import type { Property } from '../types'
import { formatNumber } from '../labels'
import PropertyDetail from '../components/PropertyDetail'
import { IconClose, IconLocate, IconPin } from '../components/icons'
import { getPosition } from '../lib/native'
import { PROPERTY_STYLE as PIN_STYLE, TYPE_FALLBACK as PIN_FALLBACK } from '../lib/propertyStyle'

// PIN_STYLE / PIN_FALLBACK (สี + glyph ต่อประเภท) ย้ายไปใช้ร่วมกันที่ src/lib/propertyStyle
// (import ด้านบน) — ปุ่มเลือกประเภทในฟอร์มใช้ชุดเดียวกัน สี/ไอคอนจึงตรงกับหมุดเสมอ

const pinSvg = (color: string, glyph: string) => `
<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44">
  <path d="M17 1.5C9 1.5 2.5 8 2.5 15.8 2.5 23.2 10 33.2 17 42.5 24 33.2 31.5 23.2 31.5 15.8 31.5 8 25 1.5 17 1.5Z" fill="${color}" stroke="#ffffff" stroke-width="2.2"/>
  <g transform="translate(9 7.5) scale(0.667)" fill="#ffffff">${glyph}</g>
</svg>`

// สร้างไอคอนครั้งเดียวต่อประเภทแล้วใช้ซ้ำ — หมุดหลักร้อยตัวไม่ต้องสร้าง DOM string ใหม่ทุก render
const pinCache = new Map<string, L.DivIcon>()
function pinFor(type: string | null | undefined): L.DivIcon {
  const key = type && PIN_STYLE[type] ? type : ''
  let icon = pinCache.get(key)
  if (!icon) {
    const { color, glyph } = PIN_STYLE[key] ?? PIN_FALLBACK
    icon = L.divIcon({
      className: 'type-pin',
      html: pinSvg(color, glyph),
      iconSize: [34, 44],
      iconAnchor: [17, 42],
      popupAnchor: [0, -38],
    })
    pinCache.set(key, icon)
  }
  return icon
}

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
  const { profile } = useAuth()
  // ชื่อองค์กรใน popup เฉพาะ super โหมดภาพรวม — ตอนสวมสิทธิ์มุมมองเหมือนสมาชิกจริง
  const isSuper = Boolean(profile?.is_super && !profile?.impersonate_org_id)
  const [selected, setSelected] = useState<Property | null>(null)
  const [picking, setPicking] = useState(false)
  const [draft, setDraft] = useState<[number, number] | null>(null)
  const [map, setMap] = useState<L.Map | null>(null)
  const [me, setMe] = useState<{ pos: [number, number]; accuracy: number } | null>(null)
  const [locating, setLocating] = useState(false)
  // เลเยอร์ฐาน: แผนที่ (OSM) หรือ ภาพดาวเทียม (Esri) — ทั้งคู่ฟรี ไม่มี key
  const [baseLayer, setBaseLayer] = useState<'map' | 'satellite'>('map')
  // ค้นหาที่อยู่/สถานที่ ด้วย geocoder ฟรี (OSM Nominatim)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<{ label: string; lat: number; lng: number }[]>([])
  const [searching, setSearching] = useState(false)
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const focusId = params.get('focus')

  const orgFilter = useOrgFilter(items)
  // กรองจากชิพ legend ('' = กลุ่มอื่นๆ, null = แสดงทุกประเภท)
  const [fType, setFType] = useState<string | null>(null)
  const base = useMemo(
    () => items.filter((p): p is Property & { lat: number; lng: number } =>
      p.lat != null && p.lng != null && orgFilter.matches(p.org_id)),
    // matches เปลี่ยนตามค่าที่เลือกใน dropdown (fOrg)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, orgFilter.fOrg, orgFilter.superOverview],
  )
  // ชิพ legend ล่างแผนที่: เฉพาะประเภทที่มีหมุดจริง + จำนวน (เรียงตาม PIN_STYLE, อื่นๆ ท้ายสุด)
  const legend = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of base) {
      const key = p.property_type && PIN_STYLE[p.property_type] ? p.property_type : ''
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return [...Object.keys(PIN_STYLE), ''].filter((k) => counts.has(k)).map((k) => ({
      key: k,
      label: k || 'อื่นๆ',
      color: (PIN_STYLE[k] ?? PIN_FALLBACK).color,
      glyph: (PIN_STYLE[k] ?? PIN_FALLBACK).glyph,
      count: counts.get(k) ?? 0,
    }))
  }, [base])
  const withCoords = useMemo(
    () => base.filter((p) =>
      fType == null || (p.property_type && PIN_STYLE[p.property_type] ? p.property_type : '') === fType),
    [base, fType],
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

  function addAtMe() {
    if (!me) return
    const [lat, lng] = me.pos
    navigate(`/new?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}`)
  }

  async function locateMe() {
    setLocating(true)
    const r = await getPosition()
    setLocating(false)
    if (!r.ok) {
      alert(
        r.reason === 'unsupported'
          ? 'เครื่องนี้ไม่รองรับการระบุตำแหน่ง'
          : r.reason === 'denied'
            ? 'ยังไม่ได้อนุญาตให้เข้าถึงตำแหน่ง — เปิดสิทธิ์ Location ให้เบราว์เซอร์/แอปก่อน แล้วลองใหม่'
            : 'หาตำแหน่งไม่สำเร็จ ลองใหม่อีกครั้ง',
      )
      return
    }
    const p: [number, number] = [r.lat, r.lng]
    setMe({ pos: p, accuracy: r.accuracy })
    map?.flyTo(p, Math.max(map.getZoom(), 15), { duration: 0.8 })
  }

  // ค้นหาที่อยู่: หน่วง 450ms + อย่างน้อย 3 ตัวอักษร (มารยาทต่อ Nominatim) · ยกเลิกคำค้นเก่าเมื่อพิมพ์ต่อ
  useEffect(() => {
    const term = q.trim()
    if (term.length < 3) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=th&accept-language=th&q=${encodeURIComponent(term)}`,
          { signal: ctrl.signal, headers: { Accept: 'application/json' } },
        )
        const data = (await res.json()) as { display_name: string; lat: string; lon: string }[]
        setResults(data.map((d) => ({ label: d.display_name, lat: parseFloat(d.lat), lng: parseFloat(d.lon) })))
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) setResults([])
      } finally {
        setSearching(false)
      }
    }, 450)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [q])

  // เลือกผลค้นหา → เด้งแผนที่ไปจุดนั้น + ปักหมุดชั่วคราว (กด "+ เพิ่มทรัพย์ที่จุดนี้" ต่อได้เลย)
  function pickResult(r: { label: string; lat: number; lng: number }) {
    map?.flyTo([r.lat, r.lng], 16, { duration: 0.8 })
    setDraft([r.lat, r.lng])
    setPicking(false)
    setResults([])
    setQ('')
  }

  return (
    <div className={`map-page ${picking ? 'picking' : ''}`}>
      <div className="view-header">
        <h1>แผนที่ <span className="count-badge">{withCoords.length}</span></h1>
        <div className="header-actions">
          <OrgFilterSelect filter={orgFilter} />
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
        {/* ค้นหาที่อยู่/สถานที่ (geocoder ฟรี) — เลือกผลแล้วเด้งไป + ปักหมุด */}
        {!loading && (
          <div className="map-search">
            <input
              type="text"
              placeholder="ค้นหาที่อยู่ / สถานที่…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {q.trim().length >= 3 && (
              <div className="map-search-results">
                {searching && <div className="map-search-empty">กำลังค้นหา…</div>}
                {!searching && results.length === 0 && <div className="map-search-empty">ไม่พบผลลัพธ์</div>}
                {results.map((r, i) => (
                  <button key={i} type="button" className="map-search-item" onClick={() => pickResult(r)}>
                    {r.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {/* สลับ แผนที่ ↔ ภาพดาวเทียม */}
        {!loading && (
          <button
            type="button"
            className="map-layer-toggle"
            onClick={() => setBaseLayer((v) => (v === 'map' ? 'satellite' : 'map'))}
            title={baseLayer === 'map' ? 'สลับเป็นภาพดาวเทียม' : 'สลับเป็นแผนที่'}
          >
            {baseLayer === 'map' ? '🛰 ดาวเทียม' : '🗺 แผนที่'}
          </button>
        )}
        {/* legend สีตามประเภททรัพย์ — แตะเพื่อดูเฉพาะประเภทนั้น แตะซ้ำกลับมาทั้งหมด */}
        {!loading && legend.length > 0 && (
          <div className="map-legend">
            {legend.length > 1 && (
              <button
                type="button"
                className={`legend-chip ${fType == null ? 'active' : ''}`}
                title="แสดงทุกประเภท"
                onClick={() => setFType(null)}
              >
                <span className="legend-dot legend-dot-all">
                  <span style={{ background: '#2563eb' }} />
                  <span style={{ background: '#d97706' }} />
                  <span style={{ background: '#db2777' }} />
                  <span style={{ background: '#0d9488' }} />
                </span>
                ทั้งหมด
                <span className="legend-count">{base.length}</span>
              </button>
            )}
            {legend.map((t) => (
              <button
                key={t.key || 'other'}
                type="button"
                className={`legend-chip ${fType === t.key ? 'active' : ''}`}
                title={fType === t.key ? 'แตะอีกครั้งเพื่อแสดงทุกประเภท' : `ดูเฉพาะ${t.label}`}
                onClick={() => setFType((v) => (v === t.key ? null : t.key))}
              >
                <span className="legend-dot" style={{ background: t.color }}>
                  {/* ไอคอนชุดเดียวกับบนหมุด — glyph เป็นค่าคงที่ในไฟล์นี้ ไม่ใช่ข้อมูลผู้ใช้ */}
                  <svg viewBox="0 0 24 24" fill="#ffffff" dangerouslySetInnerHTML={{ __html: t.glyph }} />
                </span>
                {t.label}
                <span className="legend-count">{t.count}</span>
              </button>
            ))}
          </div>
        )}
        {!loading && (
          <MapContainer
            ref={setMap}
            center={focused ? [focused.lat, focused.lng] : [13.6, 100.7]}
            zoom={focused ? 15 : 10}
            scrollWheelZoom
          >
            {baseLayer === 'satellite' ? (
              <>
                <TileLayer
                  key="sat"
                  attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics'
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={19}
                />
                {/* ป้ายชื่อสถานที่ + ถนน โปร่งใสทับบนภาพดาวเทียม (hybrid) — ฟรี ไม่มี key */}
                <TileLayer
                  key="sat-places"
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={19}
                />
                <TileLayer
                  key="sat-roads"
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={19}
                />
              </>
            ) : (
              <TileLayer
                key="osm"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
            )}
            {!focused && <FitBounds points={points} />}
            <ClickCatcher
              enabled={picking}
              onPick={(latlng) => {
                setDraft(latlng)
                setPicking(false)
              }}
            />
            {withCoords.map((p) => (
              <Marker key={p.id} position={[p.lat, p.lng]} icon={pinFor(p.property_type)}>
                <Popup>
                  <div className="map-popup">
                    {p.photo_url && <img className="map-popup-img" src={p.photo_url} alt={p.code} />}
                    <div className="title">{p.code}</div>
                    {isSuper && p.org_name && <div className="hint">องค์กร: {p.org_name}</div>}
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
                      <div className="coords">{me.pos[0].toFixed(6)}, {me.pos[1].toFixed(6)}</div>
                      <div className="hint">แม่นยำ ±{Math.round(me.accuracy).toLocaleString('th-TH')} ม.</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <button className="btn sm primary" onClick={addAtMe}>
                          + เพิ่มทรัพย์ที่นี่
                        </button>
                      </div>
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
