import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PHOTO_BUCKET, supabase, supabaseConfigured } from '../lib/supabase'
import type { Property, PropertyDoc, PropertyInput } from '../types'
import { DOC_NAME_OPTIONS, LABELS, OPTIONS, RESIDENTIAL_FEATURES, SUB_TYPE_BY_TYPE } from '../labels'
import Combo, { MultiSelect } from '../components/Combo'
import LocationPicker from '../components/LocationPicker'
import VoiceButton from '../components/VoiceButton'
import { usePlanAccess } from '../lib/plan'
import { aiExtractProperty } from '../lib/ai'
import { logActivity } from '../lib/activityLog'
import { useAuth } from '../lib/auth'
import { IconCamera, IconLocate, IconSparkles, IconUpload } from '../components/icons'
import { getPosition, isNativeApp, takePhoto } from '../lib/native'
import { compressImage } from '../lib/image'
import { TypeIcon, ZoneSwatch, typeColor } from '../lib/propertyStyle'
import { loadThaiLocations, type ThaiLocations } from '../lib/thaiLocations'

const emptyForm: PropertyInput = {
  code: '',
  record_date: new Date().toISOString().slice(0, 10),
  photo_url: null,
  photos: [],
  pic: null,
  lessor_status: null,
  lessor_company: null,
  lessor_name: null,
  phone: null,
  deed_no: null,
  property_type: null,
  listing_type: null,
  subdistrict: null,
  district: null,
  province: null,
  color_zone: null,
  zones: [],
  nearby: null,
  land_wxd: null,
  land_area: null,
  building_area: null,
  building_wxd: null,
  office_floors: null,
  office_area_fl1: null,
  office_area_total: null,
  building_area_total: null,
  rent_per_month: null,
  price_per_sqm: null,
  sale_price: null,
  withholding_tax: null,
  land_building_tax: null,
  common_fee: null,
  electricity_rate: null,
  water_rate: null,
  door_count: null,
  door_wxh: null,
  building_height: null,
  floor_load: null,
  power_system: null,
  water_per_day: null,
  contract_period: null,
  deposit: null,
  advance_rent: null,
  contract_end: null,
  features: [],
  usages: [],
  sub_type: null,
  project_name: null,
  usable_area: null,
  floors: null,
  bedrooms: null,
  bathrooms: null,
  kitchens: null,
  maid_room: null,
  parking_spaces: null,
  appliances: [],
  furniture: null,
  transfer_fee: null,
  balcony_direction: null,
  unit_building: null,
  unit_floor: null,
  tower_floors: null,
  tower_count: null,
  far_ratio: null,
  osr_ratio: null,
  road_frontage: null,
  road_width: null,
  utilities: null,
  video_url: null,
  documents: [],
  lat: null,
  lng: null,
  map_url: null,
  notes: null,
}

/** กลุ่มฟอร์มตามประเภททรัพย์ — ประเภทอื่น/ยังไม่เลือก = เชิงพาณิชย์/อุตสาหกรรม (ฟอร์มเดิม) */
type FormKind = 'house' | 'condo' | 'land' | 'general'
function kindOf(propertyType: string | null): FormKind {
  if (propertyType === 'บ้าน') return 'house'
  if (propertyType === 'คอนโด') return 'condo'
  if (propertyType === 'ที่ดินเปล่า') return 'land'
  return 'general'
}

type TextKey = {
  [K in keyof PropertyInput]: PropertyInput[K] extends string | null ? K : never
}[keyof PropertyInput]
type NumKey = {
  [K in keyof PropertyInput]: PropertyInput[K] extends number | null ? K : never
}[keyof PropertyInput]
type ListKey = {
  [K in keyof PropertyInput]: PropertyInput[K] extends string[] | null ? K : never
}[keyof PropertyInput]

interface FieldProps<K> {
  name: K
  form: PropertyInput
  set: <P extends keyof PropertyInput>(key: P, value: PropertyInput[P]) => void
  required?: boolean
}

function TextField({ name, form, set, required, type = 'text' }: FieldProps<TextKey> & { type?: string }) {
  return (
    <div className="form-field">
      <label>
        {LABELS[name]} {required && <span className="req">*</span>}
      </label>
      <input
        type={type}
        required={required}
        value={form[name] ?? ''}
        onChange={(e) => set(name, e.target.value || null)}
      />
    </div>
  )
}

function NumberField({ name, form, set, required }: FieldProps<NumKey>) {
  return (
    <div className="form-field">
      <label>
        {LABELS[name]} {required && <span className="req">*</span>}
      </label>
      <input
        type="number"
        step="any"
        required={required}
        value={form[name] ?? ''}
        onChange={(e) => set(name, e.target.value === '' ? null : Number(e.target.value))}
      />
    </div>
  )
}

function ButtonsField({
  name, form, set, required, options, icon, color,
}: FieldProps<TextKey> & {
  options: string[]
  icon?: (o: string) => React.ReactNode
  color?: (o: string) => string | undefined
}) {
  return (
    <div className="form-field">
      <label>
        {LABELS[name]} {required && <span className="req">*</span>}
      </label>
      <div className="btn-group">
        {options.map((o) => {
          const on = form[name] === o
          const c = color?.(o)
          return (
            <button
              key={o}
              type="button"
              className={`opt ${on ? 'on' : ''}`}
              style={on && c ? { background: `${c}1a`, borderColor: c, color: c } : undefined}
              onClick={() => set(name, on ? null : o)}
            >
              {icon?.(o)}{o}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ComboField({
  name, form, set, required, options, renderOption,
}: FieldProps<TextKey> & { options: string[]; renderOption?: (o: string) => React.ReactNode }) {
  return (
    <div className="form-field">
      <label>
        {LABELS[name]} {required && <span className="req">*</span>}
      </label>
      <Combo
        value={form[name]}
        onChange={(v) => set(name, v)}
        options={options}
        required={required}
        placeholder="เลือกหรือพิมพ์เพิ่ม…"
        renderOption={renderOption}
      />
    </div>
  )
}

function MultiField({ name, form, set, options }: FieldProps<ListKey> & { options: string[] }) {
  return (
    <div className="form-field">
      <label>{LABELS[name]}</label>
      <MultiSelect
        values={form[name] ?? []}
        onChange={(v) => set(name, v)}
        options={options}
      />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="form-card">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

export default function FormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // พิกัดจากหมุดที่วางไว้ในหน้าแผนที่ (/new?lat=..&lng=..) — กรอกให้ล่วงหน้า
  const [form, setForm] = useState<PropertyInput>(() => {
    const lat = params.get('lat')
    const lng = params.get('lng')
    if (lat && lng && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng))) {
      return {
        ...emptyForm,
        lat: Number(lat),
        lng: Number(lng),
        map_url: `https://www.google.com/maps?q=${lat},${lng}`,
      }
    }
    return emptyForm
  })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const editing = Boolean(id)

  // ── จังหวัด → เขต/อำเภอ → แขวง/ตำบล (เลือกต่อเนื่อง) ──
  // ข้อมูลโหลด lazy · ยังพิมพ์เองได้เสมอ (Combo) เผื่อชื่อไม่ตรงชุดข้อมูล/โหลดไม่สำเร็จ
  const [thLoc, setThLoc] = useState<ThaiLocations | null>(null)
  useEffect(() => {
    void loadThaiLocations().then(setThLoc)
  }, [])
  const provinceOptions = thLoc ? Object.keys(thLoc) : []
  const districtOptions = (form.province && thLoc?.[form.province]) ? Object.keys(thLoc[form.province]) : []
  const subdistrictOptions =
    form.province && form.district ? thLoc?.[form.province]?.[form.district] ?? [] : []

  // super โหมดภาพรวม: ต้องเลือกว่าบันทึกทรัพย์ในนามองค์กรไหน (สมาชิกปกติระบบผูกให้เอง)
  const { profile } = useAuth()
  const superOverview = Boolean(profile?.is_super && !profile?.impersonate_org_id)
  const [orgChoices, setOrgChoices] = useState<{ id: string; name: string }[]>([])
  const [formOrg, setFormOrg] = useState('')
  useEffect(() => {
    if (!superOverview || !supabaseConfigured) return
    void supabase
      .from('organizations')
      .select('id, name')
      .order('name')
      .then(({ data }) => setOrgChoices((data ?? []) as { id: string; name: string }[]))
  }, [superOverview])

  // ── บันทึกด่วนด้วยเสียง/ข้อความ → ให้ AI กรอกฟอร์ม ──
  const [dictation, setDictation] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const access = usePlanAccess()
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiFilled, setAiFilled] = useState<(keyof PropertyInput)[] | null>(null)

  async function fillFromDictation() {
    setAiBusy(true)
    setAiError(null)
    setAiFilled(null)
    try {
      const extracted = await aiExtractProperty(dictation)
      const keys = Object.keys(extracted) as (keyof PropertyInput)[]
      if (keys.length === 0) throw new Error('AI อ่านไม่พบข้อมูลทรัพย์ในข้อความ — ลองเล่าใหม่อีกครั้ง')
      setForm((f) => ({ ...f, ...extracted }))
      setAiFilled(keys)
      logActivity('ai.voice_fill', extracted.code ?? form.code ?? null, { fields: keys.length })
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err))
    } finally {
      setAiBusy(false)
    }
  }

  useEffect(() => {
    if (!id || !supabaseConfigured) return
    void supabase
      .from('properties')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error) alert(`โหลดข้อมูลไม่สำเร็จ: ${error.message}`)
        else if (data) {
          const { id: _id, created_at: _c, org_id, org_name: _o, created_by: _cb, created_by_name: _cbn, ...rest } = data as Property
          setForm({ ...emptyForm, ...rest })
          if (org_id) setFormOrg(org_id)
        }
      })
  }, [id])

  const set = <K extends keyof PropertyInput>(key: K, value: PropertyInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const MAX_PHOTOS = 10

  // อัปโหลดหลายรูป — ต่อท้ายแกลเลอรี (ไม่เกิน MAX_PHOTOS) · รูปแรก = รูปปก = photo_url
  async function addPhotos(files: File[]) {
    if (!supabaseConfigured) {
      alert('ยังไม่ได้ตั้งค่า Supabase จึงอัปโหลดรูปไม่ได้')
      return
    }
    const current = form.photos ?? []
    const room = MAX_PHOTOS - current.length
    if (room <= 0) {
      alert(`ใส่รูปได้สูงสุด ${MAX_PHOTOS} รูป`)
      return
    }
    const pick = files.slice(0, room)
    if (files.length > room) alert(`ใส่ได้อีก ${room} รูปเท่านั้น (สูงสุด ${MAX_PHOTOS}) — เพิ่มให้เท่าที่ใส่ได้`)
    setUploading(true)
    const urls: string[] = []
    for (let i = 0; i < pick.length; i++) {
      // บีบอัดก่อนอัปโหลด — รูปมือถือหลาย MB เหลือไม่กี่ร้อย KB โหลดหน้ารายการ/แผนที่เร็วขึ้นมาก
      const f = await compressImage(pick[i])
      const path = `${Date.now()}-${i}-${f.name.replace(/[^a-zA-Z0-9.]+/g, '_')}`
      const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, f)
      if (error) { alert(`อัปโหลดรูปไม่สำเร็จ: ${error.message}`); continue }
      urls.push(supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl)
    }
    if (urls.length) {
      const next = [...current, ...urls]
      setForm((f) => ({ ...f, photos: next, photo_url: next[0] }))
    }
    setUploading(false)
  }

  function removePhoto(url: string) {
    const next = (form.photos ?? []).filter((u) => u !== url)
    setForm((f) => ({ ...f, photos: next, photo_url: next[0] ?? null }))
  }

  // ย้ายรูปที่เลือกมาเป็นรูปแรก (รูปปก)
  function setCover(url: string) {
    const next = [url, ...(form.photos ?? []).filter((u) => u !== url)]
    setForm((f) => ({ ...f, photos: next, photo_url: next[0] }))
  }

  // ── เอกสารสิทธิ์ (รูป/PDF) — เก็บถังเดียวกับรูป โฟลเดอร์ docs/ ──
  const MAX_DOCS = 10
  const [docUploading, setDocUploading] = useState(false)

  async function addDocs(files: File[]) {
    if (!supabaseConfigured) {
      alert('ยังไม่ได้ตั้งค่า Supabase จึงอัปโหลดไฟล์ไม่ได้')
      return
    }
    const current = form.documents ?? []
    const room = MAX_DOCS - current.length
    if (room <= 0) {
      alert(`แนบเอกสารได้สูงสุด ${MAX_DOCS} ไฟล์`)
      return
    }
    const pick = files.slice(0, room)
    if (files.length > room) alert(`แนบได้อีก ${room} ไฟล์เท่านั้น (สูงสุด ${MAX_DOCS})`)
    setDocUploading(true)
    const added: PropertyDoc[] = []
    for (let i = 0; i < pick.length; i++) {
      // เอกสารที่ถ่ายเป็นรูปบีบอัดเหมือนรูปทรัพย์ · PDF ผ่านตามเดิม (บีบใน browser ไม่ได้)
      const f = await compressImage(pick[i])
      const path = `docs/${Date.now()}-${i}-${f.name.replace(/[^a-zA-Z0-9.]+/g, '_')}`
      const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, f)
      if (error) { alert(`อัปโหลด ${f.name} ไม่สำเร็จ: ${error.message}`); continue }
      // ชื่อเริ่มต้น = ชื่อไฟล์ (ตัดนามสกุล) — แก้เป็นชื่อจริงในช่องได้เลย
      added.push({ name: f.name.replace(/\.[^.]+$/, ''), url: supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl })
    }
    if (added.length) setForm((fm) => ({ ...fm, documents: [...(fm.documents ?? []), ...added] }))
    setDocUploading(false)
  }

  function renameDoc(i: number, name: string) {
    setForm((fm) => ({ ...fm, documents: (fm.documents ?? []).map((d, j) => (j === i ? { ...d, name } : d)) }))
  }

  function removeDoc(i: number) {
    setForm((fm) => ({ ...fm, documents: (fm.documents ?? []).filter((_, j) => j !== i) }))
  }

  async function useMyLocation() {
    const pos = await getPosition()
    if (pos.ok) setForm((f) => ({ ...f, lat: +pos.lat.toFixed(6), lng: +pos.lng.toFixed(6) }))
    else
      alert(
        pos.reason === 'denied'
          ? 'ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่ง — เปิดสิทธิ์ตำแหน่งให้แอป/เบราว์เซอร์ก่อน'
          : pos.reason === 'unsupported'
            ? 'อุปกรณ์นี้ไม่รองรับการหาตำแหน่ง'
            : 'หาตำแหน่งไม่สำเร็จ ลองใหม่อีกครั้ง',
      )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabaseConfigured) {
      alert('ยังไม่ได้ตั้งค่า Supabase — ตั้งค่า .env ก่อนจึงจะบันทึกได้')
      return
    }
    if (superOverview && !formOrg) {
      alert('เลือกองค์กรเจ้าของทรัพย์ก่อนบันทึก')
      return
    }
    setSaving(true)
    // super ระบุองค์กรปลายทางเอง / สมาชิกปกติปล่อยให้ระบบผูกองค์กรตัวเองอัตโนมัติ
    const payload = superOverview ? { ...form, org_id: formOrg } : { ...form }
    const res = editing
      ? await supabase.from('properties').update(payload).eq('id', id!)
      : await supabase.from('properties').insert(payload)
    setSaving(false)
    if (res.error) alert(`บันทึกไม่สำเร็จ: ${res.error.message}`)
    else {
      logActivity(editing ? 'property.update' : 'property.create', form.code || null)
      navigate('/')
    }
  }

  const fp = { form, set }
  // ฟอร์มโชว์เฉพาะฟิลด์ที่เกี่ยวกับประเภทที่เลือก (ตาม requirement.md) —
  // สลับประเภทไม่ล้างค่าที่กรอกแล้ว ฟิลด์ที่ซ่อนยังบันทึกค่าตามเดิม
  const kind = kindOf(form.property_type)
  const isHome = kind === 'house' || kind === 'condo'

  return (
    <>
      <div className="view-header">
        <h1>{editing ? `แก้ไข ${form.code || ''}` : 'เพิ่มทรัพย์ใหม่'}</h1>
      </div>
      <form className="form-wrap" onSubmit={handleSubmit}>
        {superOverview && orgChoices.length > 0 && (
          <section className="form-card">
            <div className="form-field" style={{ marginBottom: 4 }}>
              <label>องค์กรเจ้าของทรัพย์ <span className="req">*</span></label>
              <select value={formOrg} onChange={(e) => setFormOrg(e.target.value)} required>
                <option value="">— เลือกองค์กร —</option>
                {orgChoices.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
            <p className="ai-hint">คุณกำลังบันทึกในนามองค์กรลูกค้า (ส่วนนี้เห็นเฉพาะ super admin)</p>
          </section>
        )}
        {access.ai && (
        <section className="form-card ai-card">
          <h3><IconSparkles size={16} /> บันทึกด่วนด้วยเสียงหรือข้อความ</h3>
          <p className="ai-hint">
            กด "พูด" แล้วเล่ารายละเอียดทรัพย์รวดเดียว (ทำเล ขนาด ราคา สเปก เจ้าของ เบอร์โทร…)
            หรือวางข้อความจากแชท แล้วให้ AI กรอกลงฟอร์มให้ — กรอกทับเฉพาะฟิลด์ที่พูดถึง
            อย่าลืมตรวจก่อนบันทึก
          </p>
          <div className="form-field">
            <textarea
              value={dictation}
              placeholder='เช่น "โกดังให้เช่าบางพลีใหญ่ อำเภอบางพลี สมุทรปราการ พื้นที่พันสองร้อยตารางเมตร ค่าเช่าแปดหมื่นห้า สูงแปดเมตร ไฟสามเฟส มีรปภ. เจ้าของคุณสมชาย เบอร์ศูนย์แปดหนึ่งสองสามสี่ห้าหกเจ็ดแปด"'
              onChange={(e) => setDictation(e.target.value)}
            />
          </div>
          <div className="ai-actions">
            <VoiceButton onText={(t) => setDictation((d) => (d ? `${d} ` : '') + t)} />
            <button
              type="button"
              className="btn primary"
              disabled={aiBusy || !dictation.trim()}
              onClick={() => void fillFromDictation()}
            >
              <IconSparkles size={16} /> {aiBusy ? 'AI กำลังอ่าน…' : 'ให้ AI กรอกฟอร์ม'}
            </button>
            {dictation && !aiBusy && (
              <button type="button" className="btn sm" onClick={() => { setDictation(''); setAiFilled(null) }}>
                ล้างข้อความ
              </button>
            )}
          </div>
          {aiError && <div className="auth-error" style={{ marginTop: 10 }}>{aiError}</div>}
          {aiFilled && (
            <div className="auth-notice" style={{ marginTop: 10 }}>
              กรอกให้แล้ว {aiFilled.length} ฟิลด์: {aiFilled.map((f) => LABELS[f]).join(', ')} —
              ตรวจความถูกต้องด้านล่างก่อนบันทึก
            </div>
          )}
        </section>
        )}

        <Section title="ประเภทและทำเล">
          <ButtonsField name="property_type" options={OPTIONS.property_type} required {...fp}
            icon={(o) => <TypeIcon type={o} size={20} />} color={typeColor} />
          {isHome && SUB_TYPE_BY_TYPE[form.property_type!] && (
            <ButtonsField name="sub_type" options={SUB_TYPE_BY_TYPE[form.property_type!]} {...fp} />
          )}
          <ButtonsField name="listing_type" options={OPTIONS.listing_type} required {...fp} />
          {isHome && <TextField name="project_name" {...fp} />}
          <div className="form-grid-2">
            <div className="form-field">
              <label>{LABELS.province} <span className="req">*</span></label>
              <Combo
                value={form.province}
                options={provinceOptions}
                required
                placeholder="เลือกจังหวัด…"
                onChange={(v) =>
                  // เปลี่ยนจังหวัด = เขต/แขวงเดิมใช้ไม่ได้แล้ว ล้างให้เลือกใหม่
                  setForm((f) => ({ ...f, province: v, district: null, subdistrict: null }))}
              />
            </div>
            <div className="form-field">
              <label>{LABELS.district} <span className="req">*</span></label>
              <Combo
                value={form.district}
                options={districtOptions}
                required
                placeholder={form.province ? 'เลือกเขต/อำเภอ…' : 'เลือกจังหวัดก่อน'}
                onChange={(v) => setForm((f) => ({ ...f, district: v, subdistrict: null }))}
              />
            </div>
            <div className="form-field">
              <label>{LABELS.subdistrict} <span className="req">*</span></label>
              <Combo
                value={form.subdistrict}
                options={subdistrictOptions}
                required
                placeholder={form.district ? 'เลือกแขวง/ตำบล…' : 'เลือกเขต/อำเภอก่อน'}
                onChange={(v) => set('subdistrict', v)}
              />
            </div>
            {!isHome && (
              <ComboField
                name="color_zone" options={OPTIONS.color_zone} required {...fp}
                renderOption={(o) => <><ZoneSwatch zone={o} />{o}</>}
              />
            )}
          </div>
          {kind === 'general' && <MultiField name="zones" options={OPTIONS.zones} {...fp} />}
          <TextField name="nearby" {...fp} />
        </Section>

        <Section title="ข้อมูลทั่วไป">
          <div className="form-grid-2">
            <TextField name="record_date" type="date" required {...fp} />
            <TextField name="code" required {...fp} />
          </div>
          <div className="form-field">
            <label>{LABELS.photo_url} <span className="photo-count">{(form.photos ?? []).length}/{MAX_PHOTOS}</span></label>
            <div className="photo-grid">
              {(form.photos ?? []).map((url, idx) => (
                <div className="photo-item" key={url}>
                  <img src={url} alt={`รูป ${idx + 1}`} />
                  {idx === 0
                    ? <span className="photo-cover">ปก</span>
                    : <button type="button" className="photo-setcover" onClick={() => setCover(url)}>ตั้งเป็นปก</button>}
                  <button type="button" className="photo-x" title="ลบรูปนี้" onClick={() => removePhoto(url)}>✕</button>
                </div>
              ))}
              {(form.photos ?? []).length < MAX_PHOTOS && (
                <label className="photo-add">
                  {uploading
                    ? <span>กำลังอัปโหลด…</span>
                    : <><IconCamera size={20} /><span>เพิ่มรูป</span></>}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files?.length) void addPhotos(Array.from(e.target.files))
                      e.target.value = ''
                    }}
                  />
                </label>
              )}
            </div>
            {isNativeApp && (form.photos ?? []).length < MAX_PHOTOS && (
              <button
                type="button"
                className="btn photo-camera-btn"
                disabled={uploading}
                onClick={async () => {
                  const file = await takePhoto()
                  if (file) void addPhotos([file])
                }}
              >
                <IconCamera size={16} /> ถ่ายรูปด้วยกล้อง
              </button>
            )}
            <p className="photo-hint">รูปที่มีป้าย "ปก" จะโชว์ในรายการ/แผนที่ · กด "ตั้งเป็นปก" เพื่อเปลี่ยน · สูงสุด {MAX_PHOTOS} รูป</p>
          </div>
          <TextField name="video_url" type="url" {...fp} />
        </Section>

        <Section title="เจ้าของทรัพย์ (ผู้ให้เช่า/ผู้ขาย)">
          <ComboField name="lessor_status" options={OPTIONS.lessor_status} {...fp} />
          <TextField name="lessor_company" {...fp} />
          <div className="form-grid-2">
            <TextField name="lessor_name" required {...fp} />
            <TextField name="phone" type="tel" required {...fp} />
          </div>
          <TextField name="deed_no" {...fp} />
        </Section>

        <Section title="เอกสารสิทธิ์">
          {(form.documents ?? []).map((d, i) => (
            <div key={d.url} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <input
                list="doc-name-options"
                value={d.name}
                placeholder="ชื่อเอกสาร เช่น สำเนาโฉนดที่ดิน (ด้านหน้า)"
                style={{ flex: 1 }}
                onChange={(e) => renameDoc(i, e.target.value)}
              />
              <a className="btn sm" href={d.url} target="_blank" rel="noreferrer">เปิด</a>
              <button type="button" className="btn sm danger" title="ลบเอกสารนี้" onClick={() => removeDoc(i)}>✕</button>
            </div>
          ))}
          <datalist id="doc-name-options">
            {DOC_NAME_OPTIONS.map((n) => <option key={n} value={n} />)}
          </datalist>
          {(form.documents ?? []).length < MAX_DOCS && (
            <label className="btn" style={{ cursor: 'pointer' }}>
              <IconUpload size={16} /> {docUploading ? 'กำลังอัปโหลด…' : 'แนบเอกสาร (รูปหรือ PDF)'}
              <input
                type="file"
                multiple
                accept="image/*,application/pdf"
                style={{ display: 'none' }}
                disabled={docUploading}
                onChange={(e) => {
                  if (e.target.files?.length) void addDocs(Array.from(e.target.files))
                  e.target.value = ''
                }}
              />
            </label>
          )}
          <p className="ai-hint">
            สำเนาโฉนดที่ดินควรมีทั้งด้านหน้าและด้านหลัง{kind === 'condo' ? ' (คอนโดใช้ใบ อ.ช.2)' : ' · ใบ ทด.13 ไม่มีก็ได้'} —
            แนบแล้วแก้ชื่อเอกสารในช่องให้รู้ว่าเป็นใบอะไร
          </p>
        </Section>

        <Section title="ขนาดพื้นที่">
          {kind === 'general' && (
            <>
              <div className="form-grid-2">
                <TextField name="land_wxd" {...fp} />
                <TextField name="land_area" {...fp} />
                <NumberField name="building_area" {...fp} />
                <TextField name="building_wxd" {...fp} />
              </div>
              <ComboField name="office_floors" options={OPTIONS.office_floors} {...fp} />
              <div className="form-grid-2">
                <NumberField name="office_area_fl1" {...fp} />
                <NumberField name="office_area_total" {...fp} />
              </div>
              <NumberField name="building_area_total" {...fp} />
            </>
          )}
          {kind === 'house' && (
            <>
              <div className="form-grid-2">
                <TextField name="land_area" {...fp} />
                <NumberField name="usable_area" {...fp} />
              </div>
              <ComboField name="floors" options={OPTIONS.floors} {...fp} />
              <p className="ai-hint">ขนาดที่ดินหน่วยตารางวา เช่น "54 ตร.วา" · พื้นที่ใช้สอยหน่วยตารางเมตร</p>
            </>
          )}
          {kind === 'condo' && <NumberField name="usable_area" {...fp} />}
          {kind === 'land' && (
            <>
              <div className="form-grid-2">
                <TextField name="land_wxd" {...fp} />
                <TextField name="land_area" {...fp} />
              </div>
              <p className="ai-hint">ขนาดที่ดินใส่เป็น ไร่-งาน-ตารางวา เช่น "2 ไร่ 1 งาน 50 ตร.วา"</p>
            </>
          )}
        </Section>

        {isHome && (
          <Section title="ห้องและการตกแต่ง">
            {kind === 'house' && (
              <div className="form-grid-2">
                <NumberField name="bedrooms" {...fp} />
                <NumberField name="bathrooms" {...fp} />
                <NumberField name="kitchens" {...fp} />
                <NumberField name="parking_spaces" {...fp} />
              </div>
            )}
            {kind === 'house' && <ButtonsField name="maid_room" options={OPTIONS.maid_room} {...fp} />}
            {kind === 'condo' && (
              <>
                <div className="form-grid-2">
                  <NumberField name="bathrooms" {...fp} />
                  <NumberField name="kitchens" {...fp} />
                  <ComboField name="balcony_direction" options={OPTIONS.balcony_direction} {...fp} />
                  <TextField name="unit_building" {...fp} />
                </div>
                <div className="form-grid-2">
                  <TextField name="unit_floor" {...fp} />
                  <NumberField name="tower_floors" {...fp} />
                </div>
                <NumberField name="tower_count" {...fp} />
              </>
            )}
            <MultiField name="appliances" options={OPTIONS.appliances} {...fp} />
            <ButtonsField name="furniture" options={OPTIONS.furniture} {...fp} />
          </Section>
        )}

        {kind === 'land' && (
          <Section title="ศักยภาพที่ดิน (ดูจากกฎหมายผังเมือง/LandsMaps)">
            <div className="form-grid-2">
              <TextField name="far_ratio" {...fp} />
              <TextField name="osr_ratio" {...fp} />
              <ComboField name="road_frontage" options={OPTIONS.road_frontage} {...fp} />
              <NumberField name="road_width" {...fp} />
            </div>
            <ComboField name="utilities" options={OPTIONS.utilities} {...fp} />
          </Section>
        )}

        <Section title="ราคาและค่าใช้จ่าย">
          <div className="form-grid-2">
            <NumberField name="rent_per_month" {...fp} />
            {!isHome && <NumberField name="price_per_sqm" {...fp} />}
          </div>
          <NumberField name="sale_price" {...fp} />
          {kind === 'general' && (
            <>
              <div className="form-grid-2">
                <ComboField name="withholding_tax" options={OPTIONS.withholding_tax} {...fp} />
                <ComboField name="land_building_tax" options={OPTIONS.land_building_tax} {...fp} />
                <TextField name="common_fee" {...fp} />
                <TextField name="electricity_rate" {...fp} />
              </div>
              <TextField name="water_rate" {...fp} />
            </>
          )}
          {isHome && (
            <>
              <TextField name="common_fee" {...fp} />
              <p className="ai-hint">{kind === 'house' ? 'ค่าส่วนกลางหน่วย บาท/ตร.วา (กรณีโครงการจัดสรร)' : 'ค่าส่วนกลางหน่วย บาท/ตร.ม.'}</p>
            </>
          )}
          {kind !== 'general' && <ComboField name="transfer_fee" options={OPTIONS.transfer_fee} {...fp} />}
        </Section>

        {kind === 'general' && (
          <Section title="สเปกอาคาร">
            <div className="form-grid-2">
              <NumberField name="door_count" {...fp} />
              <TextField name="door_wxh" {...fp} />
              <NumberField name="building_height" {...fp} />
              <ComboField name="floor_load" options={OPTIONS.floor_load} {...fp} />
            </div>
            <ComboField name="power_system" options={OPTIONS.power_system} {...fp} />
            <TextField name="water_per_day" {...fp} />
          </Section>
        )}

        {kind !== 'land' && (
          <Section title="เงื่อนไขสัญญา">
            <div className="form-grid-2">
              <ComboField name="contract_period" options={OPTIONS.contract_period} {...fp} />
              <ComboField name="deposit" options={OPTIONS.deposit} {...fp} />
            </div>
            <ComboField name="advance_rent" options={OPTIONS.advance_rent} {...fp} />
            <div className="form-grid-2">
              <TextField name="contract_end" type="date" {...fp} />
              {(() => {
                // ปุ่มช่วยคำนวณ: เริ่มสัญญาวันนี้ + ระยะสัญญา (เช่น "3 ปี") = วันสิ้นสุด
                const years = parseInt(form.contract_period ?? '', 10)
                if (!Number.isInteger(years) || years <= 0) return null
                return (
                  <div className="form-field">
                    <label>&nbsp;</label>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        const d = new Date()
                        d.setFullYear(d.getFullYear() + years)
                        set('contract_end', d.toISOString().slice(0, 10))
                      }}
                    >
                      เริ่มสัญญาวันนี้ +{years} ปี
                    </button>
                  </div>
                )
              })()}
            </div>
            <p className="ai-hint">กรอกวันสิ้นสุดสัญญาแล้วระบบแจ้งเตือนทีมล่วงหน้าก่อนสัญญาหมด (โอกาสต่อสัญญา/หาผู้เช่าใหม่)</p>
          </Section>
        )}

        <Section title="คุณสมบัติและการใช้งาน">
          <MultiField name="features" options={isHome ? RESIDENTIAL_FEATURES : OPTIONS.features} {...fp} />
          {!isHome && <MultiField name="usages" options={OPTIONS.usages} {...fp} />}
        </Section>

        <Section title="ตำแหน่ง">
          <div className="form-field">
            <div className="pick-toolbar">
              <span className="pick-hint">แตะบนแผนที่เพื่อปักตำแหน่ง หรือกรอกพิกัดด้านล่าง</span>
              <button type="button" className="btn sm" onClick={() => void useMyLocation()}>
                <IconLocate size={15} /> ตำแหน่งฉัน
              </button>
            </div>
            <LocationPicker
              lat={form.lat}
              lng={form.lng}
              onPick={(la, ln) => setForm((f) => ({ ...f, lat: la, lng: ln }))}
            />
          </div>
          <div className="form-grid-2">
            <NumberField name="lat" {...fp} />
            <NumberField name="lng" {...fp} />
          </div>
          <TextField name="map_url" type="url" {...fp} />
          <div className="form-field">
            <label>{LABELS.notes}</label>
            <textarea
              value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value || null)}
            />
          </div>
        </Section>

        <div className="form-actions">
          <button type="button" className="btn" onClick={() => navigate(-1)}>ยกเลิก</button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </form>
    </>
  )
}
