import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { deleteProperty, useProperties } from '../hooks/useProperties'
import { usePerm } from '../hooks/usePerm'
import type { Property } from '../types'
import { OPTIONS, formatDate, formatNumber } from '../labels'
import PropertyDetail from '../components/PropertyDetail'
import Combo from '../components/Combo'
import { IconCompare, IconDownload, IconEdit, IconHouse, IconLink, IconPhone, IconPin, IconSms, IconTrash, IconUpload } from '../components/icons'
import { ContractTag, DealTag, ListingTag, TypeTag } from '../lib/propertyStyle'
import { usePlanAccess } from '../lib/plan'
import { buildPropertiesCsv } from '../lib/importProps'
import { isStaleClientError, reloadLatestVersion } from '../lib/staleClient'

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
  const { profile } = useAuth()
  const access = usePlanAccess()
  const perm = usePerm()

  function addProperty() {
    // โควตาทรัพย์ตามแพ็กเกจ: Free 5 · Basic/Pro ตามระดับ (100/250/500) · Enterprise ไม่จำกัด
    // (ฝั่งเซิร์ฟเวอร์บังคับซ้ำใน supabase/plan-tiers.sql — ตรงนี้แค่บอกก่อนถึงหน้าฟอร์ม)
    if (access.maxProperties !== null && items.length >= access.maxProperties) {
      alert(
        access.maxProperties <= 5
          ? `แพ็กเกจ Free เพิ่มทรัพย์ได้สูงสุด ${access.maxProperties} รายการ\n\nเลือกแพ็กเกจ Basic/Pro (เมนู "อัปเกรด") เพื่อเพิ่มโควตา หรือชวนเพื่อนรับ Pro ฟรี (เมนู "ทีม")`
          : `ทรัพย์เต็มโควตาระดับปัจจุบัน (${access.maxProperties} รายการ)\n\nอัปเกรดระดับแพ็กเกจในเมนู "อัปเกรด" เพื่อเพิ่มทรัพย์ได้อีก`,
      )
      return
    }
    navigate('/new')
  }
  // ป้าย/ตัวกรององค์กรมีเฉพาะ super "โหมดภาพรวม" (เห็นหลายองค์กรปนกัน) —
  // ตอนสวมสิทธิ์ให้มุมมองเหมือนสมาชิกองค์กรจริงทุกประการ
  const isSuper = Boolean(profile?.is_super && !profile?.impersonate_org_id)

  // ── ตัวกรอง ──
  const [fType, setFType] = useState<string | null>(null)
  const [fListing, setFListing] = useState<string | null>(null)
  const [fDeal, setFDeal] = useState<string | null>(null)
  const [fProvince, setFProvince] = useState<string | null>(null)
  const [fOrg, setFOrg] = useState<string | null>(null)
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')

  // เปิดหน้าพร้อมตัวกรองจากลิงก์ (เช่นจิ้มกราฟใน Dashboard: /?type=โกดัง) — ใช้ครั้งเดียว
  const [params] = useSearchParams()
  const paramApplied = useRef(false)
  useEffect(() => {
    if (paramApplied.current) return
    paramApplied.current = true
    const t = params.get('type')
    const l = params.get('listing')
    const pv = params.get('province')
    if (t) setFType(t)
    if (l) setFListing(l)
    if (pv) setFProvince(pv)
  }, [params])

  const provinces = useMemo(
    () => Array.from(new Set(items.map((p) => p.province).filter((v): v is string => Boolean(v)))).sort(),
    [items],
  )
  const orgs = useMemo(
    () => Array.from(new Set(items.map((p) => p.org_name).filter((v): v is string => Boolean(v)))).sort(),
    [items],
  )
  const hasFilter = Boolean(fType || fListing || fDeal || fProvince || fOrg || priceMin || priceMax)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const min = priceMin === '' ? null : Number(priceMin)
    const max = priceMax === '' ? null : Number(priceMax)
    return items.filter((p) => {
      if (q) {
        const hit = [
          p.code, p.property_type, p.listing_type, p.subdistrict, p.district,
          p.province, p.nearby, p.lessor_name, p.lessor_company, p.notes,
          // ค้นด้วยเลขที่บ้าน/ห้อง และชื่อโครงการ — เป็นคำที่นายหน้าจำได้ก่อนรหัสทรัพย์
          p.house_no, p.project_name,
          ...(p.features ?? []), ...(p.usages ?? []),
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
        if (!hit) return false
      }
      if (fType && p.property_type !== fType) return false
      if (fListing && p.listing_type !== fListing) return false
      // ทรัพย์ที่ไม่เคยตั้ง deal_status ถือว่า "ว่าง" (open)
      if (fDeal && (p.deal_status ?? 'open') !== fDeal) return false
      if (fProvince && p.province !== fProvince) return false
      if (fOrg && p.org_name !== fOrg) return false
      if (min != null || max != null) {
        const price = effectivePrice(p)
        if (price == null) return false
        if (min != null && price < min) return false
        if (max != null && price > max) return false
      }
      return true
    })
  }, [items, search, fType, fListing, fDeal, fProvince, fOrg, priceMin, priceMax])

  function clearFilters() {
    setFType(null)
    setFListing(null)
    setFDeal(null)
    setFProvince(null)
    setFOrg(null)
    setPriceMin('')
    setPriceMax('')
  }

  /** นำรายการที่กรองอยู่ออกเป็น CSV (หัวคอลัมน์ไทยชุดเดียวกับการนำเข้า → นำเข้ากลับได้) */
  function exportCsv() {
    const csv = buildPropertiesCsv(filtered)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `hop-properties-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
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
        <div className="header-actions" data-tour="list-actions">
          {/* บทบาทดูล้วน (Social Media Admin) เพิ่ม/นำเข้าไม่ได้ */}
          {!perm.readOnly && (
            <button className="btn mob-icon" onClick={() => navigate('/import')} title="นำเข้าจาก Excel/CSV">
              <IconUpload size={16} /><span className="btn-label">นำเข้า</span>
            </button>
          )}
          <button className="btn mob-icon" onClick={() => navigate('/compare')} title="เปรียบเทียบทรัพย์">
            <IconCompare size={16} /><span className="btn-label">เปรียบเทียบ</span>
          </button>
          {/* นำข้อมูลออกได้เฉพาะบทบาท Owner (ฐานข้อมูลมี can_export() คู่กัน) */}
          {perm.canExport && (
            <button className="btn mob-icon" onClick={exportCsv} title="นำออกเป็นไฟล์ CSV (เปิดใน Excel ได้)">
              <IconDownload size={16} /><span className="btn-label">นำออก</span>
            </button>
          )}
          {!perm.readOnly && <button className="btn primary" onClick={addProperty}>+ เพิ่มทรัพย์</button>}
        </div>
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
        <div className="filter-row">
          <span className="filter-label">สถานะ</span>
          <div className="chip-select">
            {([['open', 'ว่าง'], ['rented', 'เช่าแล้ว'], ['sold', 'ขายแล้ว']] as const).map(([v, label]) => (
              <button
                key={v}
                type="button"
                className={`chip-toggle ${fDeal === v ? 'on' : ''}`}
                onClick={() => setFDeal(fDeal === v ? null : v)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-row wrap">
          <span className="filter-label">จังหวัด</span>
          <div className="filter-province">
            <Combo value={fProvince} onChange={setFProvince} options={provinces} placeholder="ทุกจังหวัด" />
          </div>
          {isSuper && orgs.length > 0 && (
            <label className="org-filter">
              <span className="filter-label">องค์กร</span>
              <select
                className="filter-select"
                value={fOrg ?? ''}
                onChange={(e) => setFOrg(e.target.value || null)}
              >
                <option value="">ทุกองค์กร</option>
                {orgs.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </label>
          )}
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
      {error && (
        <div className="banner-warn">
          {isStaleClientError(error) ? (
            <>
              {/* กติกาสิทธิ์ในฐานข้อมูลใหม่กว่าโค้ดที่แคชไว้ในเครื่อง — บอกตรงๆ + ปุ่มกดจบ */}
              แอปในเครื่องเป็นเวอร์ชันเก่ากว่าระบบ จึงโหลดข้อมูลไม่ได้{' '}
              <button className="btn sm primary" onClick={() => void reloadLatestVersion()}>
                โหลดเวอร์ชันใหม่
              </button>
            </>
          ) : (
            <>โหลดข้อมูลไม่สำเร็จ: {error}</>
          )}
        </div>
      )}

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
                <TypeTag type={p.property_type} />
                <ListingTag type={p.listing_type} />
                <DealTag status={p.deal_status} />
                <ContractTag end={p.contract_end} />
                {isSuper && p.org_name && <span className="tag org">{p.org_name}</span>}
              </div>
              <div className="sub">
                {formatDate(p.record_date)}
                {p.district ? ` · ${p.district}` : ''}
                {p.province ? `, ${p.province}` : ''}
              </div>
              {priceLabel(p) && <div className="price">{priceLabel(p)}</div>}
              {p.created_by_name && <div className="sub">ลงโดย {p.created_by_name}</div>}
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
              {/* ปุ่มแก้/ลบโชว์ตามบทบาท (ฐานข้อมูลบังคับซ้ำอีกชั้น) — ดู src/lib/roles.ts */}
              {perm.canEdit(p) && (
                <button className="icon-btn" title="แก้ไข" onClick={() => navigate(`/edit/${p.id}`)}><IconEdit /></button>
              )}
              {perm.canDelete(p) && (
                <button className="icon-btn danger" title="ลบ" onClick={() => void handleDelete(p)}><IconTrash /></button>
              )}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <PropertyDetail
          property={selected}
          onClose={() => setSelected(null)}
          onEdit={perm.canEdit(selected) ? () => navigate(`/edit/${selected.id}`) : null}
          onDelete={perm.canDelete(selected) ? () => void handleDelete(selected) : null}
        />
      )}
    </>
  )
}
