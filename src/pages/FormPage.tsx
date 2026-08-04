import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PHOTO_BUCKET, supabase, supabaseConfigured } from '../lib/supabase'
import type { Property, PropertyDoc, PropertyInput } from '../types'
import { LABELS, kindOf } from '../labels'
import VoiceButton from '../components/VoiceButton'
import { usePlanAccess } from '../lib/plan'
import { aiExtractProperty } from '../lib/ai'
import { logActivity } from '../lib/activityLog'
import { useAuth } from '../lib/auth'
import { IconSparkles } from '../components/icons'
import { getPosition } from '../lib/native'
import { compressImage } from '../lib/image'
import { loadThaiLocations, type ThaiLocations } from '../lib/thaiLocations'
import { StepDetails, StepLocation, StepMedia, StepPrice, StepType } from './form/steps'
import FollowUpSection from '../components/FollowUpSection'
import {
  browserStore, clearDraft, draftAgeText, draftTimeText, loadDraft, saveDraft, type FormDraft,
} from '../lib/draft'

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
  agreement_type: null,
  contact_form: null,
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
  house_no: null,
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
  house_direction: null,
  appliance_counts: null,
  land_rai: null,
  land_ngan: null,
  land_wa: null,
  rooms: null,
  ceiling_height: null,
  floor_height: null,
  floor_raise_cm: null,
  has_crane: null,
  near_main_road: null,
  standalone_building: null,
  container_access: null,
  wastewater_pond: null,
  water_payee: null,
  power_payee: null,
  common_fee_payee: null,
  nearby_places: null,
  vat: null,
  video_url: null,
  documents: [],
  lat: null,
  lng: null,
  map_url: null,
  notes: null,
}

/** 5 สเต็ปตาม spec "HOP Form" (docs/hop-form-spec.md) */
const STEPS = ['ประเภททรัพย์', 'ที่ตั้ง', 'รายละเอียด', 'ราคา', 'ลงภาพ'] as const

/** ฟิลด์บังคับของแต่ละสเต็ป — ตรวจตอนกด "ถัดไป" (สเต็ปที่ไม่ได้เรนเดอร์ browser ตรวจให้ไม่ได้) */
const REQUIRED_BY_STEP: (keyof PropertyInput)[][] = [
  ['property_type', 'listing_type', 'lessor_name', 'phone', 'record_date', 'code'],
  ['province', 'district', 'subdistrict'],
  [],
  [],
  [],
]

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
  const [step, setStep] = useState(0)
  const editing = Boolean(id)
  /** สถานะงานของทรัพย์ที่กำลังแก้ (ใช้กับแผงนัดติดตามท้ายหน้า) */
  const [dealStatus, setDealStatus] = useState<Property['deal_status']>('open')

  // ── ร่างอัตโนมัติ (เฉพาะเพิ่มทรัพย์ใหม่) ──
  // pendingDraft = ร่างที่เจอตอนเปิดหน้า ยังไม่ตัดสินใจว่าจะกู้คืนหรือทิ้ง
  // ระหว่างนั้น "ห้ามเขียนร่างทับ" ไม่งั้นฟอร์มเปล่าจะลบร่างเดิมทิ้งทันที
  // เปิดฟอร์มต้องเห็นแถบสเต็ปเสมอ — เข้ามาจากรายการที่เลื่อนลงมา (กดแก้ไข) หน้าจะค้าง scroll เดิม
  // ทำให้แถบสเต็ปอยู่เหนือจอเหมือนไม่มี · React Router ไม่รีเซ็ต scroll ให้เอง
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [id])

  const [store] = useState(() => (typeof window === 'undefined' ? null : browserStore()))
  const [pendingDraft, setPendingDraft] = useState<FormDraft | null>(null)
  const [savedDraftAt, setSavedDraftAt] = useState<string | null>(null)
  useEffect(() => {
    if (editing) return
    const d = loadDraft(store)
    if (d) setPendingDraft(d)
  }, [editing, store])

  useEffect(() => {
    if (editing || pendingDraft) return
    // หน่วงไว้ 800ms กันเขียนทุกตัวอักษรที่พิมพ์
    const t = setTimeout(() => {
      const d = saveDraft(store, form, emptyForm, step)
      setSavedDraftAt(d?.savedAt ?? null)
    }, 800)
    return () => clearTimeout(t)
  }, [form, step, editing, pendingDraft, store])

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
          setDealStatus((data as Property).deal_status ?? 'open')
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

  const kind = kindOf(form.property_type)

  /** ตรวจสเต็ปเดียว — คืนข้อความปัญหา (null = ผ่าน) */
  function checkStep(i: number): string | null {
    const missing = REQUIRED_BY_STEP[i].filter((k) => {
      const v = form[k]
      return v === null || v === undefined || v === ''
    })
    if (missing.length) return `กรอกให้ครบก่อน: ${missing.map((k) => LABELS[k]).join(', ')}`
    // เอกสารสิทธิ์ไม่บังคับ — หน้างานมักได้ไฟล์โฉนดตามมาทีหลัง ห้ามขวางการลงทรัพย์
    // (เหลือเป็นคำแนะนำในฟอร์มเท่านั้น)
    return null
  }

  /** ไปสเต็ปที่ต้องการ — เดินหน้าต้องผ่านการตรวจของสเต็ปก่อนๆ (ตอนแก้ไขข้ามได้อิสระ) */
  function goStep(next: number) {
    if (next > step && !editing) {
      for (let i = step; i < next; i++) {
        const problem = checkStep(i)
        if (problem) {
          setStep(i)
          alert(problem)
          return
        }
      }
    }
    setStep(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
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
    // ตรวจทุกสเต็ปก่อนบันทึก (ผู้ใช้อาจกดข้ามมาตอนแก้ไข)
    for (let i = 0; i < STEPS.length; i++) {
      const problem = checkStep(i)
      if (problem) {
        setStep(i)
        alert(problem)
        return
      }
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
      // บันทึกเข้า DB แล้ว ร่างไม่จำเป็นอีก (ลบเฉพาะกรณีเพิ่มใหม่ — ตอนแก้ไขไม่ได้แตะร่างของทรัพย์ใหม่)
      if (!editing) clearDraft(store)
      // ไม่ต้อง logActivity ที่นี่ — trigger ในฐานข้อมูลบันทึก property.create/update ให้แล้ว
      // (supabase/logs-triggers.sql) ครอบทุกช่องทาง ไม่ใช่แค่ที่ทำผ่านเว็บ
      navigate('/')
    }
  }

  const fp = { form, set }
  const lastStep = step === STEPS.length - 1

  return (
    <>
      <div className="view-header">
        <h1>{editing ? `แก้ไข ${form.code || ''}` : 'เพิ่มทรัพย์ใหม่'}</h1>
      </div>
      <form className="form-wrap" onSubmit={handleSubmit}>
        {/* ร่างที่ค้างอยู่จากครั้งก่อน — ให้ผู้ใช้เลือกเอง ไม่ยัดใส่ฟอร์มเงียบๆ */}
        {pendingDraft && (
          <div className="draft-banner">
            <div className="draft-text">
              <b>พบร่างที่กรอกค้างไว้</b> {draftAgeText(pendingDraft.savedAt)}
              {STEPS[pendingDraft.step] && ` · ค้างที่ขั้น ${pendingDraft.step + 1} ${STEPS[pendingDraft.step]}`}
            </div>
            <div className="draft-actions">
              <button
                type="button"
                className="btn sm primary"
                onClick={() => {
                  setForm({ ...emptyForm, ...pendingDraft.form })
                  setStep(Math.min(Math.max(pendingDraft.step, 0), STEPS.length - 1))
                  setPendingDraft(null)
                }}
              >
                กรอกต่อจากร่าง
              </button>
              <button
                type="button"
                className="btn sm"
                onClick={() => {
                  clearDraft(store)
                  setPendingDraft(null)
                }}
              >
                เริ่มใหม่ (ทิ้งร่าง)
              </button>
            </div>
          </div>
        )}

        {/* แถบสเต็ป — กดข้ามได้ (ตอนเพิ่มทรัพย์ใหม่ต้องกรอกฟิลด์บังคับของสเต็ปก่อนๆ ให้ครบ) */}
        <div className="wiz-steps">
          {STEPS.map((s, i) => (
            <button
              key={s}
              type="button"
              className={`wiz-step ${i === step ? 'on' : ''} ${i < step ? 'done' : ''}`}
              onClick={() => goStep(i)}
            >
              <span className="wiz-num">{i + 1}</span>
              <span className="wiz-name">{s}</span>
            </button>
          ))}
        </div>

        {superOverview && orgChoices.length > 0 && step === 0 && (
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

        {access.ai && step === 0 && (
        <section className="form-card ai-card">
          <h3><IconSparkles size={16} /> บันทึกด่วนด้วยเสียงหรือข้อความ</h3>
          <p className="ai-hint">
            กด "พูด" แล้วเล่ารายละเอียดทรัพย์รวดเดียว (ทำเล ขนาด ราคา สเปก เจ้าของ เบอร์โทร…)
            หรือวางข้อความจากแชท แล้วให้ AI กรอกลงฟอร์มให้ — กรอกทับเฉพาะฟิลด์ที่พูดถึง
            อย่าลืมตรวจทุกสเต็ปก่อนบันทึก
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
              ตรวจความถูกต้องทุกสเต็ปก่อนบันทึก
            </div>
          )}
        </section>
        )}

        {step === 0 && <StepType {...fp} />}
        {step === 1 && (
          <StepLocation
            {...fp}
            kind={kind}
            provinceOptions={provinceOptions}
            districtOptions={districtOptions}
            subdistrictOptions={subdistrictOptions}
            // เปลี่ยนจังหวัด = เขต/แขวงเดิมใช้ไม่ได้แล้ว ล้างให้เลือกใหม่
            onPickProvince={(v) => setForm((f) => ({ ...f, province: v, district: null, subdistrict: null }))}
            onPickDistrict={(v) => setForm((f) => ({ ...f, district: v, subdistrict: null }))}
            onPickLatLng={(la, ln) => setForm((f) => ({ ...f, lat: la, lng: ln }))}
            onUseMyLocation={() => void useMyLocation()}
          />
        )}
        {step === 2 && (
          <StepDetails
            {...fp}
            kind={kind}
            maxDocs={MAX_DOCS}
            docUploading={docUploading}
            onAddDocs={(files) => void addDocs(files)}
            onRenameDoc={renameDoc}
            onRemoveDoc={removeDoc}
          />
        )}
        {step === 3 && <StepPrice {...fp} kind={kind} />}
        {step === 4 && (
          <StepMedia
            {...fp}
            maxPhotos={MAX_PHOTOS}
            uploading={uploading}
            onAddPhotos={(files) => void addPhotos(files)}
            onRemovePhoto={removePhoto}
            onSetCover={setCover}
          />
        )}

        <div className="form-actions wiz-actions">
          {step === 0
            ? <button type="button" className="btn" onClick={() => navigate(-1)}>ยกเลิก</button>
            : <button type="button" className="btn" onClick={() => goStep(step - 1)}>← ย้อนกลับ</button>}
          <span className="wiz-count">
            ขั้นที่ {step + 1} จาก {STEPS.length} · {STEPS[step]}
            {!editing && savedDraftAt && draftTimeText(savedDraftAt) && (
              <><br /><span className="draft-saved">💾 เก็บร่างไว้ให้แล้ว {draftTimeText(savedDraftAt)}</span></>
            )}
          </span>
          {!lastStep && (
            <button type="button" className="btn primary" onClick={() => goStep(step + 1)}>
              ถัดไป →
            </button>
          )}
          {/* บันทึกได้จากทุกสเต็ปตอนแก้ไข · ตอนเพิ่มใหม่ให้กดที่สเต็ปสุดท้าย (ระบบตรวจทุกสเต็ปให้ก่อนบันทึกอยู่ดี) */}
          {(lastStep || editing) && (
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? 'กำลังบันทึก…' : 'บันทึก'}
            </button>
          )}
        </div>
      </form>

      {/* นัดติดตามของทรัพย์ที่กำลังแก้ไข — เห็นและเพิ่มนัดได้จากหน้านี้เลย ไม่ต้องกลับไปหน้ารายการ
          ต้องอยู่นอก <form> ของฟอร์มทรัพย์ เพราะแผงนี้มีฟอร์มเพิ่มนัดของตัวเอง (ฟอร์มซ้อนฟอร์มไม่ได้)
          ฟีเจอร์ Pro — แพ็กเกจอื่นไม่โชว์ (สอดคล้องกับแผงรายละเอียดและ route /followups) */}
      {editing && access.followUps && (
        <div className="form-wrap follow-in-form">
          <section className="form-card">
            <FollowUpSection
              property={{ ...form, id: id!, deal_status: dealStatus } as unknown as Property}
            />
          </section>
        </div>
      )}
    </>
  )
}
