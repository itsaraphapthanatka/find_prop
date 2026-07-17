import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteProperty, useProperties } from '../hooks/useProperties'
import type { Property } from '../types'
import { OPTIONS, formatDate, formatNumber } from '../labels'
import PropertyDetail from '../components/PropertyDetail'
import Combo from '../components/Combo'
import { IconEdit, IconHouse, IconLink, IconPhone, IconPin, IconSms, IconTrash } from '../components/icons'

function effectivePrice(p: Property): number | null {
  return p.rent_per_month ?? p.sale_price ?? null
}

function priceLabel(p: Property): string | null {
  if (p.rent_per_month != null) return `${formatNumber(p.rent_per_month)} ฿/เดือน`
  if (p.sale_price != null) return `ขาย ${formatNumber(p.sale_price)} ฿`
  return null
}

export default function ListPage({ search }: { search: string }) {
  const { items, loading, error, reload } = useProperties()
  const [selected, setSelected] = useState<Property | null>(null)
  const navigate = useNavigate()

  // ── ตัวกรอง ──
  const [fType, setFType] = useState<string | null>(null)
  const [fListing, setFListing] = useState<string | null>(null)
  const [fProvince, setFProvince] = useState<string | null>(null)
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')

  const provinces = useMemo(
    () => Array.from(new Set(items.map((p) => p.province).filter((v): v is string => Boolean(v)))).sort(),
    [items],
  )
  const hasFilter = Boolean(fType || fListing || fProvince || priceMin || priceMax)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const min = priceMin === '' ? null : Number(priceMin)
    const max = priceMax === '' ? null : Number(priceMax)
    return items.filter((p) => {
      if (q) {
        const hit = [
          p.code, p.property_type, p.listing_type, p.subdistrict, p.district,
          p.province, p.nearby, p.lessor_name, p.lessor_company, p.notes,
          ...(p.features ?? []), ...(p.usages ?? []),
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
        if (!hit) return false
      }
      if (fType && p.property_type !== fType) return false
      if (fListing && p.listing_type !== fListing) return false
      if (fProvince && p.province !== fProvince) return false
      if (min != null || max != null) {
        const price = effectivePrice(p)
        if (price == null) return false
        if (min != null && price < min) return false
        if (max != null && price > max) return false
      }
      return true
    })
  }, [items, search, fType, fListing, fProvince, priceMin, priceMax])

  function clearFilters() {
    setFType(null)
    setFListing(null)
    setFProvince(null)
    setPriceMin('')
    setPriceMax('')
  }

  async function handleDelete(p: Property) {
    if (!window.confirm(`ลบรายการ ${p.code}?`)) return
    const err = await deleteProperty(p.id)
    if (err) alert(`ลบไม่สำเร็จ: ${err}`)
    else {
      if (selected?.id === p.id) setSelected(null)
      await reload()
    }
  }

  return (
    <>
      <div className="view-header">
        <h1>รายการทรัพย์ <span className="count-badge">{filtered.length}</span></h1>
        <button className="btn primary" onClick={() => navigate('/new')}>+ เพิ่มทรัพย์</button>
      </div>

      <div className="filter-bar">
        <div className="filter-row">
          <span className="filter-label">ประเภท</span>
          <div className="chip-select">
            {OPTIONS.property_type.map((o) => (
              <button
                key={o}
                type="button"
                className={`chip-toggle ${fType === o ? 'on' : ''}`}
                onClick={() => setFType(fType === o ? null : o)}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-row">
          <span className="filter-label">เช่า/ขาย</span>
          <div className="chip-select">
            {OPTIONS.listing_type.map((o) => (
              <button
                key={o}
                type="button"
                className={`chip-toggle ${fListing === o ? 'on' : ''}`}
                onClick={() => setFListing(fListing === o ? null : o)}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-row wrap">
          <span className="filter-label">จังหวัด</span>
          <div className="filter-province">
            <Combo value={fProvince} onChange={setFProvince} options={provinces} placeholder="ทุกจังหวัด" />
          </div>
          <div className="price-range">
            <span className="filter-label">ราคา (฿)</span>
            <input
              className="filter-price"
              type="number"
              placeholder="ต่ำสุด"
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
            />
            <span className="filter-dash">–</span>
            <input
              className="filter-price"
              type="number"
              placeholder="สูงสุด"
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
            />
          </div>
          {hasFilter && (
            <button type="button" className="btn sm" onClick={clearFilters}>✕ ล้างตัวกรอง</button>
          )}
        </div>
      </div>

      {loading && <div className="loading">กำลังโหลด…</div>}
      {error && <div className="banner-warn">โหลดข้อมูลไม่สำเร็จ: {error}</div>}

      {!loading && filtered.length === 0 && (
        <div className="empty-state">
          {search || hasFilter
            ? 'ไม่พบทรัพย์ที่ตรงกับเงื่อนไข'
            : 'ยังไม่มีข้อมูลทรัพย์ — กด "เพิ่มทรัพย์" เพื่อเริ่มต้น'}
        </div>
      )}

      <div className="prop-list">
        {filtered.map((p) => (
          <div
            key={p.id}
            className={`prop-row ${selected?.id === p.id ? 'selected' : ''}`}
            onClick={() => setSelected(p)}
          >
            <div className="thumb">
              {p.photo_url ? <img src={p.photo_url} alt={p.code} /> : <IconHouse />}
            </div>
            <div className="info">
              <div className="title-line">
                <span className="title">{p.code}</span>
                {p.property_type && <span className="tag">{p.property_type}</span>}
                {p.listing_type && <span className="tag alt">{p.listing_type}</span>}
              </div>
              <div className="sub">
                {formatDate(p.record_date)}
                {p.district ? ` · ${p.district}` : ''}
                {p.province ? `, ${p.province}` : ''}
              </div>
              {priceLabel(p) && <div className="price">{priceLabel(p)}</div>}
            </div>
            <div className="row-actions" onClick={(e) => e.stopPropagation()}>
              {p.phone && (
                <>
                  <a className="icon-btn" href={`tel:${p.phone}`} title="โทร"><IconPhone /></a>
                  <a className="icon-btn" href={`sms:${p.phone}`} title="ส่งข้อความ"><IconSms /></a>
                </>
              )}
              {p.map_url && (
                <a className="icon-btn" href={p.map_url} target="_blank" rel="noreferrer" title="เปิดแผนที่ (ลิงก์)"><IconLink /></a>
              )}
              {p.lat != null && p.lng != null && (
                <button className="icon-btn" title="ดูบนแผนที่" onClick={() => navigate(`/map?focus=${p.id}`)}><IconPin /></button>
              )}
              <button className="icon-btn" title="แก้ไข" onClick={() => navigate(`/edit/${p.id}`)}><IconEdit /></button>
              <button className="icon-btn danger" title="ลบ" onClick={() => void handleDelete(p)}><IconTrash /></button>
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <PropertyDetail
          property={selected}
          onClose={() => setSelected(null)}
          onEdit={() => navigate(`/edit/${selected.id}`)}
          onDelete={() => void handleDelete(selected)}
        />
      )}
    </>
  )
}
