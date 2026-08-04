// ชิ้นส่วนช่องกรอกของฟอร์มลงทรัพย์ (HOP Form) — ใช้ร่วมกันทั้ง 5 สเต็ป
// แยกออกจาก FormPage เพื่อให้แต่ละสเต็ปอ่านได้เป็นชุดฟิลด์ล้วนๆ
import { useState } from 'react'
import { LABELS, NEARBY_PLACE_OPTIONS } from '../../labels'
import { formatLatLng, parseLatLng, roundLatLng } from '../../lib/latlng'
import type { NearbyPlace, PropertyInput } from '../../types'
import Combo, { MultiSelect } from '../../components/Combo'

export type TextKey = {
  [K in keyof PropertyInput]: PropertyInput[K] extends string | null ? K : never
}[keyof PropertyInput]
export type NumKey = {
  [K in keyof PropertyInput]: PropertyInput[K] extends number | null ? K : never
}[keyof PropertyInput]
export type ListKey = {
  [K in keyof PropertyInput]: PropertyInput[K] extends string[] | null ? K : never
}[keyof PropertyInput]
export type BoolKey = {
  [K in keyof PropertyInput]: PropertyInput[K] extends boolean | null ? K : never
}[keyof PropertyInput]

export type SetField = <P extends keyof PropertyInput>(key: P, value: PropertyInput[P]) => void

/** ชุดค่าที่ทุกช่องต้องใช้ — ส่งต่อด้วย {...fp} */
export interface FieldPack {
  form: PropertyInput
  set: SetField
}

interface FieldProps<K> extends FieldPack {
  name: K
  required?: boolean
}

export function TextField({
  name, form, set, required, type = 'text', label,
}: FieldProps<TextKey> & { type?: string; label?: string }) {
  return (
    <div className="form-field">
      <label>
        {label ?? LABELS[name]} {required && <span className="req">*</span>}
      </label>
      <input
        type={type}
        value={form[name] ?? ''}
        onChange={(e) => set(name, e.target.value || null)}
      />
    </div>
  )
}

export function NumberField({ name, form, set, required, hint }: FieldProps<NumKey> & { hint?: string }) {
  return (
    <div className="form-field">
      <label>
        {LABELS[name]} {required && <span className="req">*</span>}
      </label>
      <input
        type="number"
        step="any"
        value={form[name] ?? ''}
        onChange={(e) => set(name, e.target.value === '' ? null : Number(e.target.value))}
      />
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  )
}

export function ButtonsField({
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

/** ช่อง ใช่/ไม่ (สเปกโกดัง-โรงงาน) — กดซ้ำที่ค่าเดิม = ล้างค่าเป็น "ยังไม่ระบุ" */
export function BoolField({ name, form, set }: FieldProps<BoolKey>) {
  const v = form[name]
  return (
    <div className="form-field">
      <label>{LABELS[name]}</label>
      <div className="btn-group">
        {[true, false].map((b) => (
          <button
            key={String(b)}
            type="button"
            className={`opt ${v === b ? 'on' : ''}`}
            onClick={() => set(name, v === b ? null : b)}
          >
            {b ? 'ใช่' : 'ไม่'}
          </button>
        ))}
      </div>
    </div>
  )
}

export function ComboField({
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
        placeholder="เลือกหรือพิมพ์เพิ่ม…"
        renderOption={renderOption}
      />
    </div>
  )
}

export function MultiField({ name, form, set, options, label }: FieldProps<ListKey> & { options: string[]; label?: string }) {
  return (
    <div className="form-field">
      <label>{label ?? LABELS[name]}</label>
      <MultiSelect
        values={form[name] ?? []}
        onChange={(v) => set(name, v)}
        options={options}
      />
    </div>
  )
}

/** ราคาต่อหน่วย + "ชำระกับใคร" คู่กัน (ค่าน้ำ/ค่าไฟ/ค่าส่วนกลาง ตาม HOP Form STEP 3) */
export function UtilityField({
  rate, payee, form, set, payeeOptions, hint,
}: FieldPack & { rate: TextKey; payee: TextKey; payeeOptions: string[]; hint?: string }) {
  return (
    <>
      <div className="form-grid-2">
        <TextField name={rate} form={form} set={set} />
        <ComboField name={payee} options={payeeOptions} form={form} set={set} />
      </div>
      {hint && <p className="field-hint" style={{ marginTop: -8 }}>{hint}</p>}
    </>
  )
}

/**
 * เครื่องใช้ไฟฟ้าที่ให้ + จำนวนต่อชนิด
 * เลือกชนิดด้วย chip (appliances) แล้วใส่จำนวนของแต่ละชนิด (appliance_counts)
 */
export function AppliancesField({ form, set, options }: FieldPack & { options: string[] }) {
  const picked = form.appliances ?? []
  const counts = form.appliance_counts ?? {}
  const setCount = (name: string, n: number | null) => {
    const next = { ...counts }
    if (n === null) delete next[name]
    else next[name] = n
    set('appliance_counts', Object.keys(next).length ? next : null)
  }
  return (
    <div className="form-field">
      <label>{LABELS.appliances}</label>
      <MultiSelect
        values={picked}
        onChange={(v) => {
          set('appliances', v)
          // ชนิดที่เอาออกแล้วไม่ต้องเก็บจำนวนไว้
          const next = Object.fromEntries(Object.entries(counts).filter(([k]) => v.includes(k)))
          set('appliance_counts', Object.keys(next).length ? next : null)
        }}
        options={options}
      />
      {picked.length > 0 && (
        <>
          <p className="field-hint">ใส่จำนวนที่ให้ต่อชนิด (เว้นว่างได้ถ้ายังไม่รู้)</p>
          <div className="qty-rows">
            {picked.map((a) => (
              <div className="qty-row" key={a}>
                <span className="qty-name">{a}</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="—"
                  value={counts[a] ?? ''}
                  onChange={(e) => setCount(a, e.target.value === '' ? null : Number(e.target.value))}
                />
                <span className="qty-unit">เครื่อง</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * พิกัดช่องเดียว "ละติจูด, ลองจิจูด" — วางจาก Google Maps ได้ตรงๆ (ทั้งตัวเลขและลิงก์)
 * DB ยังเก็บแยก lat/lng ตามเดิม · แก้ค่าจากแผนที่ก็สะท้อนมาที่ช่องนี้
 */
export function LatLngField({ form, set }: FieldPack) {
  // เก็บข้อความที่พิมพ์แยกจากค่าจริง เพื่อให้พิมพ์กลางทาง (เช่น "13.6,") ได้โดยไม่ถูกเขียนทับ
  const [text, setText] = useState<string | null>(null)
  const shown = text ?? formatLatLng(form.lat, form.lng)
  const parsed = parseLatLng(shown)
  const dirty = shown.trim() !== '' && !parsed
  return (
    <div className="form-field">
      <label>พิกัด (ละติจูด, ลองจิจูด)</label>
      <input
        type="text"
        inputMode="decimal"
        placeholder="เช่น 13.599, 100.618 หรือวางลิงก์ Google Maps"
        value={shown}
        onChange={(e) => {
          const v = e.target.value
          setText(v)
          const p = parseLatLng(v)
          if (p) {
            const r = roundLatLng(p)
            set('lat', r.lat)
            set('lng', r.lng)
          } else if (v.trim() === '') {
            set('lat', null)
            set('lng', null)
          }
        }}
        onBlur={() => setText(null)} // กลับไปโชว์ค่าจริงที่บันทึกไว้
      />
      <p className="field-hint">
        {dirty
          ? '⚠️ อ่านพิกัดไม่ออก — ใส่เป็น "ละติจูด, ลองจิจูด" เช่น 13.599, 100.618 หรือวางลิงก์จาก Google Maps'
          : 'ก๊อปจาก Google Maps มาวางได้เลย (ตัวเลขหรือลิงก์) · หรือแตะบนแผนที่ด้านบน'}
      </p>
    </div>
  )
}

/** สถานที่สำคัญใกล้เคียง + ระยะทางกิโลเมตร (HOP Form STEP 2) */
export function NearbyPlacesField({ form, set }: FieldPack) {
  const rows = form.nearby_places ?? []
  const update = (next: NearbyPlace[]) => set('nearby_places', next.length ? next : null)
  const unused = NEARBY_PLACE_OPTIONS.filter((o) => !rows.some((r) => r.name === o))
  return (
    <div className="form-field">
      <label>{LABELS.nearby_places}</label>
      {rows.length > 0 && (
        <div className="qty-rows">
          {rows.map((r, i) => (
            <div className="qty-row" key={i}>
              <input
                type="text"
                className="qty-name-input"
                placeholder="สถานที่"
                value={r.name}
                onChange={(e) => update(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              />
              <input
                type="number"
                min="0"
                step="any"
                placeholder="—"
                value={r.km ?? ''}
                onChange={(e) =>
                  update(rows.map((x, j) => (j === i ? { ...x, km: e.target.value === '' ? null : Number(e.target.value) } : x)))}
              />
              <span className="qty-unit">กม.</span>
              <button type="button" className="btn sm" title="ลบรายการนี้" onClick={() => update(rows.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
        </div>
      )}
      <div className="btn-group" style={{ marginTop: rows.length ? 8 : 0 }}>
        {unused.map((o) => (
          <button key={o} type="button" className="opt" onClick={() => update([...rows, { name: o, km: null }])}>
            ＋ {o}
          </button>
        ))}
        <button type="button" className="opt" onClick={() => update([...rows, { name: '', km: null }])}>
          ＋ อื่นๆ
        </button>
      </div>
    </div>
  )
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="form-card">
      <h3>{title}</h3>
      {children}
    </section>
  )
}
