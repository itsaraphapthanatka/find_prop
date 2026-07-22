import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PHOTO_BUCKET, supabase, supabaseConfigured } from '../lib/supabase'
import type { Property, PropertyInput } from '../types'
import { LABELS, OPTIONS } from '../labels'
import Combo, { MultiSelect } from '../components/Combo'
import VoiceButton from '../components/VoiceButton'
import { aiExtractProperty } from '../lib/ai'
import { logActivity } from '../lib/activityLog'
import { useAuth } from '../lib/auth'
import { IconCamera, IconSparkles } from '../components/icons'
import { isNativeApp, takePhoto } from '../lib/native'

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
  features: [],
  usages: [],
  lat: null,
  lng: null,
  map_url: null,
  notes: null,
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

function ButtonsField({ name, form, set, required, options }: FieldProps<TextKey> & { options: string[] }) {
  return (
    <div className="form-field">
      <label>
        {LABELS[name]} {required && <span className="req">*</span>}
      </label>
      <div className="btn-group">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            className={`opt ${form[name] === o ? 'on' : ''}`}
            onClick={() => set(name, form[name] === o ? null : o)}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  )
}

function ComboField({ name, form, set, required, options }: FieldProps<TextKey> & { options: string[] }) {
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
      const f = pick[i]
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
        </Section>

        <Section title="ผู้ให้เช่า">
          <ComboField name="lessor_status" options={OPTIONS.lessor_status} {...fp} />
          <TextField name="lessor_company" {...fp} />
          <div className="form-grid-2">
            <TextField name="lessor_name" required {...fp} />
            <TextField name="phone" type="tel" required {...fp} />
          </div>
          <TextField name="deed_no" {...fp} />
        </Section>

        <Section title="ประเภทและทำเล">
          <ButtonsField name="property_type" options={OPTIONS.property_type} required {...fp} />
          <ButtonsField name="listing_type" options={OPTIONS.listing_type} required {...fp} />
          <div className="form-grid-2">
            <TextField name="subdistrict" required {...fp} />
            <TextField name="district" required {...fp} />
            <TextField name="province" required {...fp} />
            <ComboField name="color_zone" options={OPTIONS.color_zone} required {...fp} />
          </div>
          <MultiField name="zones" options={OPTIONS.zones} {...fp} />
          <TextField name="nearby" {...fp} />
        </Section>

        <Section title="ขนาดพื้นที่">
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
        </Section>

        <Section title="ราคาและค่าใช้จ่าย">
          <div className="form-grid-2">
            <NumberField name="rent_per_month" {...fp} />
            <NumberField name="price_per_sqm" {...fp} />
          </div>
          <NumberField name="sale_price" {...fp} />
          <div className="form-grid-2">
            <ComboField name="withholding_tax" options={OPTIONS.withholding_tax} {...fp} />
            <ComboField name="land_building_tax" options={OPTIONS.land_building_tax} {...fp} />
            <TextField name="common_fee" {...fp} />
            <TextField name="electricity_rate" {...fp} />
          </div>
          <TextField name="water_rate" {...fp} />
        </Section>

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

        <Section title="เงื่อนไขสัญญา">
          <div className="form-grid-2">
            <ComboField name="contract_period" options={OPTIONS.contract_period} {...fp} />
            <ComboField name="deposit" options={OPTIONS.deposit} {...fp} />
          </div>
          <ComboField name="advance_rent" options={OPTIONS.advance_rent} {...fp} />
        </Section>

        <Section title="คุณสมบัติและการใช้งาน">
          <MultiField name="features" options={OPTIONS.features} {...fp} />
          <MultiField name="usages" options={OPTIONS.usages} {...fp} />
        </Section>

        <Section title="ตำแหน่ง">
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
