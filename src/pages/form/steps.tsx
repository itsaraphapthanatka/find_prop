// 5 สเต็ปของฟอร์มลงทรัพย์ตาม spec "HOP Form" — ดู docs/hop-form-spec.md
// STEP 1 ประเภททรัพย์ → 2 ที่ตั้ง → 3 รายละเอียด → 4 ราคา → 5 ลงภาพ
import { useState } from 'react'
import {
  DOC_NAME_OPTIONS, LABELS, OPTIONS, PROPERTY_CATEGORIES, RESIDENTIAL_FEATURES,
  SUB_TYPE_BY_TYPE, categoryOf, houseNoLabel, type PropertyKind,
} from '../../labels'
import type { PropertyDoc, PropertyInput } from '../../types'
import { TypeIcon, ZoneSwatch, typeColor } from '../../lib/propertyStyle'
import { IconCamera, IconLocate, IconUpload } from '../../components/icons'
import Combo from '../../components/Combo'
import LocationPicker from '../../components/LocationPicker'
import { isNativeApp, takePhoto } from '../../lib/native'
import { photoList } from '../../lib/photo'
import {
  AppliancesField, BoolField, ButtonsField, ComboField, type FieldPack, LatLngField, MultiField,
  NearbyPlacesField, NumberField, Section, TextField, UtilityField,
} from './fields'

/** ทรัพย์นี้ปล่อยเช่า / ขาย หรือไม่ (ยังไม่เลือก = โชว์ทั้งคู่ไว้ก่อน) */
export const forRent = (f: PropertyInput) => !f.listing_type || f.listing_type.includes('เช่า')
export const forSale = (f: PropertyInput) => !f.listing_type || f.listing_type.includes('ขาย')

// ══ STEP 1 · ประเภททรัพย์ ══════════════════════════════════
export function StepType({ form, set }: FieldPack) {
  const fp = { form, set }
  // หมวดที่เลือกอยู่ — จำไว้เองเผื่อผู้ใช้กดหมวดแล้วยังไม่เลือกประเภท
  const [cat, setCat] = useState<string | null>(() => categoryOf(form.property_type))
  // ทรัพย์เก่าที่ประเภทไม่อยู่ในหมวดใด(เช่นพิมพ์เพิ่มเอง) — โชว์ค่าเดิมไว้ให้เห็น ไม่ล้างทิ้งเอง
  const orphanType = !cat && form.property_type ? form.property_type : null
  const types = PROPERTY_CATEGORIES.find((c) => c.name === cat)?.types ?? (orphanType ? [orphanType] : [])
  const subTypes = form.property_type ? SUB_TYPE_BY_TYPE[form.property_type] : undefined
  return (
    <>
      <Section title="ประเภททรัพย์">
        <div className="form-field">
          <label>หมวดทรัพย์ <span className="req">*</span></label>
          <div className="btn-group">
            {PROPERTY_CATEGORIES.map((c) => (
              <button
                key={c.name}
                type="button"
                className={`opt ${cat === c.name ? 'on' : ''}`}
                onClick={() => {
                  setCat(c.name)
                  // เปลี่ยนหมวด = ประเภทเดิมใช้ไม่ได้แล้ว (ประเภทในหมวดอื่น) ล้างให้เลือกใหม่
                  if (form.property_type && !c.types.includes(form.property_type)) {
                    set('property_type', null)
                    set('sub_type', null)
                  }
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
        {(cat || orphanType) && (
          <ButtonsField
            name="property_type" options={types} required {...fp}
            icon={(o) => <TypeIcon type={o} size={20} />} color={typeColor}
          />
        )}
        {subTypes && <ButtonsField name="sub_type" options={subTypes} {...fp} />}
        {orphanType && (
          <p className="field-hint">
            ประเภท "{orphanType}" ไม่อยู่ในหมวดมาตรฐาน — เลือกหมวดด้านบนเพื่อย้ายไปประเภทใหม่ (ค่าเดิมยังอยู่จนกดเปลี่ยน)
          </p>
        )}
        {!cat && !orphanType && <p className="field-hint">เลือกหมวดก่อน แล้วจะมีประเภทให้เลือก</p>}
      </Section>

      <Section title="เงื่อนไขการฝากและผู้ติดต่อ">
        <ButtonsField name="listing_type" options={OPTIONS.listing_type} required {...fp} />
        <ButtonsField name="agreement_type" options={OPTIONS.agreement_type} {...fp} />
        <p className="field-hint" style={{ marginTop: -10 }}>
          ปิด = สัญญานายหน้าแบบผูกขาด (exclusive) · เปิด = ฝากหลายเจ้า (open)
        </p>
        <div className="form-grid-2">
          <ButtonsField name="lessor_status" options={OPTIONS.lessor_status} {...fp} />
          <ButtonsField name="contact_form" options={OPTIONS.contact_form} {...fp} />
        </div>
        {form.contact_form === 'นิติบุคคล' && <TextField name="lessor_company" {...fp} />}
        <div className="form-grid-2">
          <TextField name="lessor_name" required {...fp} />
          <TextField name="phone" type="tel" required {...fp} />
        </div>
      </Section>

      <Section title="ข้อมูลการลงทรัพย์">
        <div className="form-grid-2">
          <TextField name="record_date" type="date" required {...fp} />
          <TextField name="code" required {...fp} />
        </div>
      </Section>
    </>
  )
}

// ══ STEP 2 · ที่ตั้ง ════════════════════════════════════════
interface StepLocationProps extends FieldPack {
  kind: PropertyKind
  provinceOptions: string[]
  districtOptions: string[]
  subdistrictOptions: string[]
  onPickProvince: (v: string | null) => void
  onPickDistrict: (v: string | null) => void
  onPickLatLng: (lat: number, lng: number) => void
  onUseMyLocation: () => void
}

export function StepLocation({
  form, set, kind, provinceOptions, districtOptions, subdistrictOptions,
  onPickProvince, onPickDistrict, onPickLatLng, onUseMyLocation,
}: StepLocationProps) {
  const fp = { form, set }
  return (
    <>
      <Section title="ที่ตั้ง">
        {/* ที่ดินเปล่าไม่มีสิ่งปลูกสร้าง จึงไม่มีเลขที่ให้กรอก — หมวดอื่นมีทุกหมวด */}
        {kind === 'land' ? (
          <TextField name="project_name" {...fp} />
        ) : (
          <div className="form-grid-2">
            <TextField name="house_no" label={houseNoLabel(kind)} {...fp} />
            <TextField name="project_name" {...fp} />
          </div>
        )}
        <div className="form-grid-2">
          <div className="form-field">
            <label>{LABELS.province} <span className="req">*</span></label>
            <Combo
              value={form.province}
              options={provinceOptions}
              placeholder="เลือกจังหวัด…"
              onChange={onPickProvince}
            />
          </div>
          <div className="form-field">
            <label>{LABELS.district} <span className="req">*</span></label>
            <Combo
              value={form.district}
              options={districtOptions}
              placeholder={form.province ? 'เลือกเขต/อำเภอ…' : 'เลือกจังหวัดก่อน'}
              onChange={onPickDistrict}
            />
          </div>
          <div className="form-field">
            <label>{LABELS.subdistrict} <span className="req">*</span></label>
            <Combo
              value={form.subdistrict}
              options={subdistrictOptions}
              placeholder={form.district ? 'เลือกแขวง/ตำบล…' : 'เลือกเขต/อำเภอก่อน'}
              onChange={(v) => set('subdistrict', v)}
            />
          </div>
          <ComboField
            name="color_zone" options={OPTIONS.color_zone} {...fp}
            renderOption={(o) => <><ZoneSwatch zone={o} />{o}</>}
          />
        </div>
        {kind === 'industrial' && (
          <>
            <MultiField name="zones" options={OPTIONS.zones} {...fp} />
            <p className="field-hint" style={{ marginTop: -10 }}>โซนพิเศษของทำเล (เลือกได้หลายข้อ/พิมพ์เพิ่มได้)</p>
          </>
        )}
      </Section>

      <Section title="ปักหมุดและพิกัด">
        <div className="form-field">
          <div className="pick-toolbar">
            <span className="pick-hint">แตะบนแผนที่เพื่อปักตำแหน่ง หรือกรอกพิกัดด้านล่าง</span>
            <button type="button" className="btn sm" onClick={onUseMyLocation}>
              <IconLocate size={15} /> ตำแหน่งฉัน
            </button>
          </div>
          <LocationPicker lat={form.lat} lng={form.lng} onPick={onPickLatLng} />
        </div>
        <LatLngField {...fp} />
        <TextField name="map_url" type="url" {...fp} />
      </Section>

      <Section title="ใกล้เคียง">
        <TextField name="nearby" {...fp} />
        <NearbyPlacesField {...fp} />
      </Section>
    </>
  )
}

// ══ STEP 3 · รายละเอียด ════════════════════════════════════
/** ขนาดที่ดินแบบไทย — ไร่/งาน/ตารางวา (ข้อความเดิมใน land_area โชว์ให้แก้ได้ถ้ามีค่าอยู่) */
function LandSizeFields({ form, set }: FieldPack) {
  const fp = { form, set }
  return (
    <>
      <div className="form-grid-3">
        <NumberField name="land_rai" {...fp} />
        <NumberField name="land_ngan" {...fp} />
        <NumberField name="land_wa" {...fp} />
      </div>
      {form.land_area && (
        <>
          <TextField name="land_area" {...fp} />
          <p className="field-hint" style={{ marginTop: -10 }}>
            ข้อความขนาดที่ดินแบบเดิมของทรัพย์นี้ — ย้ายไปกรอกช่อง ไร่/งาน/ตร.วา ด้านบนได้เลย แล้วล้างช่องนี้
          </p>
        </>
      )}
    </>
  )
}

/** ค่าน้ำ/ค่าไฟ/ค่าส่วนกลาง — ราคาต่อหน่วย + ชำระกับใคร */
function UtilityCostSection({ form, set, commonFeeHint }: FieldPack & { commonFeeHint?: string }) {
  const fp = { form, set }
  return (
    <Section title="ค่าสาธารณูปโภค">
      <UtilityField rate="water_rate" payee="water_payee" payeeOptions={OPTIONS.water_payee} {...fp}
        hint="ค่าน้ำ — ใส่ราคาต่อหน่วย เช่น 20" />
      <UtilityField rate="electricity_rate" payee="power_payee" payeeOptions={OPTIONS.power_payee} {...fp}
        hint="ค่าไฟ — ใส่ราคาต่อหน่วย เช่น 8" />
      <UtilityField rate="common_fee" payee="common_fee_payee" payeeOptions={OPTIONS.common_fee_payee} {...fp}
        hint={commonFeeHint ?? 'ค่าส่วนกลางและเก็บขยะ'} />
    </Section>
  )
}

function DocsSection({
  form, set, kind, docUploading, onAddDocs, onRenameDoc, onRemoveDoc, maxDocs,
}: FieldPack & {
  kind: PropertyKind
  docUploading: boolean
  onAddDocs: (files: File[]) => void
  onRenameDoc: (i: number, name: string) => void
  onRemoveDoc: (i: number) => void
  maxDocs: number
}) {
  const docs = form.documents ?? []
  // โฉนดเป็นแค่คำแนะนำ ไม่บังคับ — หน้างานมักได้ไฟล์ตามมาทีหลัง แนบเพิ่มตอนแก้ไขได้เสมอ
  const deedHint = kind === 'house' || kind === 'condo' || kind === 'land'
  return (
    <Section title="เอกสารสิทธิ์">
      <TextField name="deed_no" form={form} set={set} />
      {docs.map((d: PropertyDoc, i: number) => (
        <div key={d.url} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <input
            list="doc-name-options"
            value={d.name}
            placeholder="ชื่อเอกสาร เช่น สำเนาโฉนดที่ดิน (ด้านหน้า)"
            style={{ flex: 1 }}
            onChange={(e) => onRenameDoc(i, e.target.value)}
          />
          <a className="btn sm" href={d.url} target="_blank" rel="noreferrer">เปิด</a>
          <button type="button" className="btn sm danger" title="ลบเอกสารนี้" onClick={() => onRemoveDoc(i)}>✕</button>
        </div>
      ))}
      <datalist id="doc-name-options">
        {DOC_NAME_OPTIONS.map((n) => <option key={n} value={n} />)}
      </datalist>
      {docs.length < maxDocs && (
        <label className="btn" style={{ cursor: 'pointer' }}>
          <IconUpload size={16} /> {docUploading ? 'กำลังอัปโหลด…' : 'แนบเอกสาร (รูปหรือ PDF)'}
          <input
            type="file"
            multiple
            accept="image/*,application/pdf"
            style={{ display: 'none' }}
            disabled={docUploading}
            onChange={(e) => {
              if (e.target.files?.length) onAddDocs(Array.from(e.target.files))
              e.target.value = ''
            }}
          />
        </label>
      )}
      <p className="ai-hint" style={{ marginTop: 10 }}>
        {deedHint && 'ควรมีสำเนาโฉนดหน้า-หลัง (ไม่บังคับ — ยังไม่มีก็บันทึกทรัพย์ได้ แนบเพิ่มภายหลังได้) · '}
        {kind === 'condo' ? 'คอนโดใช้ใบ อ.ช.2' : 'ใบ ทด.13 ไม่มีก็ได้'} —
        แนบแล้วแก้ชื่อเอกสารในช่องให้รู้ว่าเป็นใบอะไร
      </p>
    </Section>
  )
}

interface StepDetailsProps extends FieldPack {
  kind: PropertyKind
  docUploading: boolean
  onAddDocs: (files: File[]) => void
  onRenameDoc: (i: number, name: string) => void
  onRemoveDoc: (i: number) => void
  maxDocs: number
}

export function StepDetails(props: StepDetailsProps) {
  const { form, set, kind } = props
  const fp = { form, set }
  const isFactory = form.property_type === 'โรงงาน'
  const docs = (
    <DocsSection
      form={form} set={set} kind={kind} maxDocs={props.maxDocs}
      docUploading={props.docUploading} onAddDocs={props.onAddDocs}
      onRenameDoc={props.onRenameDoc} onRemoveDoc={props.onRemoveDoc}
    />
  )

  if (kind === 'house') {
    return (
      <>
        <Section title="ขนาดและตัวบ้าน">
          <ComboField name="house_direction" options={OPTIONS.house_direction} {...fp} />
          <LandSizeFields {...fp} />
          <div className="form-grid-2">
            <NumberField name="usable_area" {...fp} />
            <ComboField name="floors" options={OPTIONS.floors} {...fp} />
          </div>
        </Section>
        <Section title="ห้องและการตกแต่ง">
          <div className="form-grid-2">
            <NumberField name="bedrooms" {...fp} />
            <NumberField name="bathrooms" {...fp} />
            <NumberField name="kitchens" {...fp} />
            <NumberField name="parking_spaces" {...fp} />
          </div>
          <ButtonsField name="maid_room" options={OPTIONS.maid_room} {...fp} />
          <AppliancesField {...fp} options={OPTIONS.appliances} />
          <ButtonsField name="furniture" options={OPTIONS.furniture} {...fp} />
        </Section>
        <Section title="พื้นที่ส่วนกลาง">
          <MultiField name="features" options={RESIDENTIAL_FEATURES} {...fp}
            label="พื้นที่ส่วนกลาง (กรณีโครงการจัดสรร)" />
        </Section>
        <UtilityCostSection {...fp} commonFeeHint="ค่าส่วนกลางหน่วย บาท/ตร.วา (กรณีโครงการจัดสรร)" />
        {docs}
      </>
    )
  }

  if (kind === 'condo') {
    return (
      <>
        <Section title="ห้องชุด">
          <div className="form-grid-2">
            <NumberField name="usable_area" {...fp} />
            <NumberField name="bedrooms" {...fp} />
            <NumberField name="bathrooms" {...fp} />
            <NumberField name="kitchens" {...fp} />
          </div>
          <ComboField name="balcony_direction" options={OPTIONS.balcony_direction} {...fp} />
          <div className="form-grid-2">
            <TextField name="unit_building" {...fp} />
            <TextField name="unit_floor" {...fp} />
            <NumberField name="tower_floors" {...fp} />
            <NumberField name="tower_count" {...fp} />
          </div>
          <NumberField name="parking_spaces" {...fp} />
        </Section>
        <Section title="การตกแต่ง">
          <AppliancesField {...fp} options={OPTIONS.appliances} />
          <ButtonsField name="furniture" options={OPTIONS.furniture} {...fp} />
        </Section>
        <Section title="พื้นที่ส่วนกลางและคุณสมบัติ">
          <MultiField name="features" options={RESIDENTIAL_FEATURES} {...fp} label="พื้นที่ส่วนกลางมีอะไรบ้าง" />
        </Section>
        <UtilityCostSection {...fp} commonFeeHint="ค่าส่วนกลางหน่วย บาท/ตร.ม." />
        {docs}
      </>
    )
  }

  if (kind === 'office' || kind === 'homeoffice') {
    return (
      <>
        <Section title={kind === 'office' ? 'ขนาดออฟฟิศ' : 'ขนาดโฮมออฟฟิศ'}>
          <div className="form-grid-2">
            <NumberField name="office_area_total" {...fp} />
            {kind === 'homeoffice' && <TextField name="building_wxd" {...fp} />}
            {kind === 'homeoffice' && <ComboField name="floors" options={OPTIONS.floors} {...fp} />}
            <NumberField name="rooms" {...fp} />
            {kind === 'homeoffice' && <NumberField name="bathrooms" {...fp} />}
            {kind === 'homeoffice' && <NumberField name="kitchens" {...fp} />}
            {kind === 'office' && <TextField name="unit_floor" {...fp} />}
            {kind === 'office' && <NumberField name="tower_floors" {...fp} />}
            <NumberField name="tower_count" {...fp} />
            <NumberField name="ceiling_height" {...fp} />
            <NumberField name="parking_spaces" {...fp} />
          </div>
          <ButtonsField name="furniture" options={OPTIONS.furniture} {...fp} />
        </Section>
        <Section title="พื้นที่ส่วนกลางและของที่ให้">
          <MultiField name="features" options={RESIDENTIAL_FEATURES} {...fp} label="พื้นที่ส่วนกลางมีอะไรบ้าง" />
          <AppliancesField {...fp} options={OPTIONS.appliances} />
        </Section>
        <UtilityCostSection {...fp} />
        {docs}
      </>
    )
  }

  if (kind === 'land') {
    return (
      <>
        <Section title="ขนาดที่ดิน">
          <LandSizeFields {...fp} />
          <TextField name="land_wxd" {...fp} />
        </Section>
        <Section title="ศักยภาพที่ดิน (ดูจากกฎหมายผังเมือง/LandsMaps)">
          <MultiField name="usages" options={OPTIONS.usages} {...fp} label="ที่ดินแปลงนี้ใช้ประโยชน์อะไรได้บ้าง" />
          <div className="form-grid-2">
            <TextField name="far_ratio" {...fp} />
            <TextField name="osr_ratio" {...fp} />
            <ComboField name="road_frontage" options={OPTIONS.road_frontage} {...fp} />
            <NumberField name="road_width" {...fp} />
          </div>
          <ComboField name="utilities" options={OPTIONS.utilities} {...fp} />
        </Section>
        {docs}
      </>
    )
  }

  // เชิงอุตสาหกรรม (โกดัง/โรงงาน) + โชว์รูม — ใช้ชุดฟิลด์เดียวกัน
  return (
    <>
      <Section title="ขนาดพื้นที่">
        <LandSizeFields {...fp} />
        <div className="form-grid-2">
          <TextField name="land_wxd" {...fp} />
          <NumberField name="building_area" {...fp} />
          <TextField name="building_wxd" {...fp} />
          <NumberField name="building_area_total" {...fp} />
        </div>
        <ComboField name="office_floors" options={OPTIONS.office_floors} {...fp} />
        <div className="form-grid-2">
          <NumberField name="office_area_fl1" {...fp} />
          <NumberField name="office_area_total" {...fp} />
        </div>
      </Section>
      <Section title="สเปกอาคาร">
        <div className="form-grid-2">
          <NumberField name="building_height" {...fp} />
          <NumberField name="floor_height" {...fp} />
          <NumberField name="floor_raise_cm" {...fp} />
          <ComboField name="floor_load" options={OPTIONS.floor_load} {...fp} />
          <NumberField name="door_count" {...fp} />
          <TextField name="door_wxh" {...fp} />
        </div>
        <ComboField name="power_system" options={OPTIONS.power_system} {...fp} />
        <div className="form-grid-2">
          <NumberField name="parking_spaces" {...fp} />
          {isFactory && <TextField name="water_per_day" {...fp} />}
        </div>
        {isFactory && <ComboField name="wastewater_pond" options={OPTIONS.wastewater_pond} {...fp} />}
        <div className="form-grid-2">
          <BoolField name="has_crane" {...fp} />
          <BoolField name="near_main_road" {...fp} />
          <BoolField name="standalone_building" {...fp} />
          <BoolField name="container_access" {...fp} />
        </div>
      </Section>
      {/* เดิมมีการ์ด "คุณสมบัติและการใช้งาน" — ตัดออกทั้งการ์ดตามที่ผู้ใช้สั่ง
          เพราะคำถาม ใช่/ไม่ ในสเปกอาคารด้านบน (เครน · ใกล้ถนนหลัก · อาคารเดี่ยว · คอนเทนเนอร์เข้าได้)
          แทนได้หมดแล้ว · ที่ดินยังมี "ใช้ประโยชน์อะไรได้บ้าง" เพราะเป็นคำถามเชิงผังเมือง ไม่ใช่สเปกอาคาร */}
      <UtilityCostSection {...fp} />
      {docs}
    </>
  )
}

// ══ STEP 4 · ราคา ══════════════════════════════════════════
export function StepPrice({ form, set, kind }: FieldPack & { kind: PropertyKind }) {
  const fp = { form, set }
  const isHome = kind === 'house' || kind === 'condo'
  const rent = forRent(form)
  const sale = forSale(form)
  return (
    <>
      <Section title="ราคา">
        <div className="form-grid-2">
          {rent && <NumberField name="rent_per_month" {...fp} />}
          {sale && <NumberField name="sale_price" {...fp} />}
        </div>
        {!isHome && <NumberField name="price_per_sqm" {...fp} />}
        {/* ภาษี/VAT ใส่เฉพาะกรณีให้เช่าและไม่ใช่ที่อยู่อาศัย (ตาม HOP Form STEP 4) */}
        {!isHome && rent && (
          <>
            <div className="form-grid-2">
              <ComboField name="land_building_tax" options={OPTIONS.land_building_tax} {...fp} />
              <ComboField name="withholding_tax" options={OPTIONS.withholding_tax} {...fp} />
            </div>
            <ComboField name="vat" options={OPTIONS.vat} {...fp} />
            <p className="field-hint">ใส่กรณีเช่าทั้งหลัง — ที่อยู่อาศัยไม่ต้องใส่</p>
          </>
        )}
      </Section>

      {sale && (
        <Section title="เงื่อนไขการขาย">
          <ComboField name="transfer_fee" options={OPTIONS.transfer_fee} {...fp} />
        </Section>
      )}

      {rent && (
        <Section title="เงื่อนไขการเช่า">
          <div className="form-grid-2">
            <ComboField name="deposit" options={OPTIONS.deposit} {...fp} />
            <ComboField name="advance_rent" options={OPTIONS.advance_rent} {...fp} />
          </div>
          <ComboField name="contract_period" options={OPTIONS.contract_period} {...fp} />
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
    </>
  )
}

// ══ STEP 5 · ลงภาพ ═════════════════════════════════════════
interface StepMediaProps extends FieldPack {
  maxPhotos: number
  uploading: boolean
  onAddPhotos: (files: File[]) => void
  onRemovePhoto: (url: string) => void
  onSetCover: (url: string) => void
}

export function StepMedia({
  form, set, maxPhotos, uploading, onAddPhotos, onRemovePhoto, onSetCover,
}: StepMediaProps) {
  const photos = form.photos ?? []
  return (
    <Section title="ลงภาพและวิดีโอ">
      <div className="form-field">
        <label>{LABELS.photo_url} <span className="photo-count">{photos.length}/{maxPhotos}</span></label>
        {photos.length === 0 && photoList(form.photo_url, 640).length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <p className="plan-line" style={{ margin: '0 0 6px' }}>รูปจากข้อมูลเดิม (ลิงก์ภายนอก — ดูได้อย่างเดียว · เพิ่มรูปใหม่เข้าระบบได้ด้านล่าง)</p>
            <div className="photo-grid">
              {photoList(form.photo_url, 640).map((src, i) => (
                <div className="photo-item" key={i}>
                  <img src={src} alt={`รูปเดิม ${i + 1}`} loading="lazy" onError={(e) => { const el = (e.currentTarget as HTMLImageElement).closest('.photo-item'); if (el instanceof HTMLElement) el.style.display = 'none' }} />
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="photo-grid">
          {photos.map((url, idx) => (
            <div className="photo-item" key={url}>
              <img src={url} alt={`รูป ${idx + 1}`} />
              {idx === 0
                ? <span className="photo-cover">ปก</span>
                : <button type="button" className="photo-setcover" onClick={() => onSetCover(url)}>ตั้งเป็นปก</button>}
              <button type="button" className="photo-x" title="ลบรูปนี้" onClick={() => onRemovePhoto(url)}>✕</button>
            </div>
          ))}
          {photos.length < maxPhotos && (
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
                  if (e.target.files?.length) onAddPhotos(Array.from(e.target.files))
                  e.target.value = ''
                }}
              />
            </label>
          )}
        </div>
        {isNativeApp && photos.length < maxPhotos && (
          <button
            type="button"
            className="btn photo-camera-btn"
            disabled={uploading}
            onClick={async () => {
              const file = await takePhoto()
              if (file) onAddPhotos([file])
            }}
          >
            <IconCamera size={16} /> ถ่ายรูปด้วยกล้อง
          </button>
        )}
        <p className="photo-hint">รูปที่มีป้าย "ปก" จะโชว์ในรายการ/แผนที่ · กด "ตั้งเป็นปก" เพื่อเปลี่ยน · สูงสุด {maxPhotos} รูป</p>
      </div>
      <TextField name="video_url" type="url" form={form} set={set} />
      <div className="form-field">
        <label>{LABELS.notes}</label>
        <textarea
          value={form.notes ?? ''}
          onChange={(e) => set('notes', e.target.value || null)}
        />
      </div>
    </Section>
  )
}
