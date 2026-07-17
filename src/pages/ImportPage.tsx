import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useProperties } from '../hooks/useProperties'
import type { PropertyInput } from '../types'
import { LABELS } from '../labels'
import {
  IMPORT_FIELDS, autoMapColumns, buildTemplateCsv, rowsToProperties, type ImportRow,
} from '../lib/importProps'
import { IconDownload, IconUpload } from '../components/icons'

const CHUNK = 50

interface RowError { rowNo: number; code: string | null; message: string }
interface ImportResult { inserted: number; updated: number; skipped: number; errors: RowError[] }

/** แปลง error จากฐานข้อมูลเป็นภาษาคน */
function humanError(msg: string): string {
  if (msg.includes('duplicate key')) return 'รหัสนี้มีอยู่ในระบบแล้ว (อาจอยู่ในองค์กรอื่น) — ใช้รหัสอื่น'
  if (msg.includes('row-level security')) return 'สิทธิ์ไม่ผ่าน (RLS) — บัญชีต้องสังกัดองค์กร'
  return msg
}

export default function ImportPage() {
  const { items, reload } = useProperties()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  const [fileName, setFileName] = useState<string | null>(null)
  const [sheetName, setSheetName] = useState<string | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([])
  const [mapping, setMapping] = useState<Record<string, keyof PropertyInput | ''>>({})
  const [parseError, setParseError] = useState<string | null>(null)
  const [dupMode, setDupMode] = useState<'skip' | 'update'>('skip')
  const [busy, setBusy] = useState(false)
  const [processed, setProcessed] = useState(0)
  const [result, setResult] = useState<ImportResult | null>(null)

  const existingByCode = useMemo(() => new Map(items.map((p) => [p.code, p])), [items])

  async function handleFile(file: File) {
    setParseError(null)
    setResult(null)
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true })
      const name = wb.SheetNames[0]
      const ws = wb.Sheets[name]
      const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) as unknown[][]
      const heads = (grid[0] ?? []).map((h) => String(h ?? '').trim()).filter(Boolean)
      if (heads.length === 0) throw new Error('ไม่พบหัวตารางในแถวแรกของไฟล์')
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: true })
      if (rows.length === 0) throw new Error('ไฟล์ไม่มีแถวข้อมูล (มีแต่หัวตาราง)')
      setFileName(file.name)
      setSheetName(wb.SheetNames.length > 1 ? name : null)
      setHeaders(heads)
      setRawRows(rows)
      setMapping(autoMapColumns(heads))
    } catch (err) {
      setFileName(null)
      setHeaders([])
      setRawRows([])
      setParseError(err instanceof Error ? err.message : String(err))
    }
  }

  // ── สรุปผลการตรวจก่อนนำเข้า ──
  const prepared: ImportRow[] = useMemo(
    () => (rawRows.length ? rowsToProperties(rawRows, mapping) : []),
    [rawRows, mapping],
  )
  const codeMapped = Object.values(mapping).includes('code')
  const noCode = prepared.filter((r) => !r.code)
  const withCode = prepared.filter((r) => r.code)
  const dups = withCode.filter((r) => existingByCode.has(r.code!))
  const fresh = withCode.filter((r) => !existingByCode.has(r.code!))
  const total = fresh.length + (dupMode === 'update' ? dups.length : 0)

  const sample = (h: string): string => {
    for (const row of rawRows) {
      const v = row[h]
      if (v !== null && v !== undefined && String(v).trim() !== '') {
        const s = v instanceof Date ? v.toLocaleDateString('th-TH') : String(v)
        return s.length > 40 ? `${s.slice(0, 40)}…` : s
      }
    }
    return '—'
  }

  async function runImport() {
    setBusy(true)
    setProcessed(0)
    const errors: RowError[] = []
    let inserted = 0
    let updated = 0
    let done = 0

    // เพิ่มรายการใหม่ทีละก้อน — ถ้าก้อนไหนพัง ไล่ทีละแถวเพื่อชี้จุดผิด
    for (let i = 0; i < fresh.length; i += CHUNK) {
      const chunk = fresh.slice(i, i + CHUNK)
      const { error } = await supabase.from('properties').insert(chunk.map((r) => r.input))
      if (!error) {
        inserted += chunk.length
      } else {
        for (const r of chunk) {
          const { error: e } = await supabase.from('properties').insert(r.input)
          if (e) errors.push({ rowNo: r.rowNo, code: r.code, message: humanError(e.message) })
          else inserted += 1
        }
      }
      done += chunk.length
      setProcessed(done)
    }

    // อัปเดตทับรหัสเดิม (ถ้าเลือกโหมดนี้) — ส่งเฉพาะฟิลด์ที่ map ไว้
    if (dupMode === 'update') {
      for (let i = 0; i < dups.length; i += 10) {
        const chunk = dups.slice(i, i + 10)
        await Promise.all(
          chunk.map(async (r) => {
            const target = existingByCode.get(r.code!)!
            const { code: _c, ...patch } = r.input
            const { error: e } = await supabase.from('properties').update(patch).eq('id', target.id)
            if (e) errors.push({ rowNo: r.rowNo, code: r.code, message: humanError(e.message) })
            else updated += 1
          }),
        )
        done += chunk.length
        setProcessed(done)
      }
    }

    setResult({
      inserted,
      updated,
      skipped: noCode.length + (dupMode === 'skip' ? dups.length : 0),
      errors,
    })
    setBusy(false)
    await reload()
  }

  function downloadTemplate() {
    const blob = new Blob([buildTemplateCsv()], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'hob-import-template.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <>
      <div className="view-header">
        <h1>นำเข้าข้อมูลทรัพย์</h1>
        <button className="btn" onClick={downloadTemplate}>
          <IconDownload size={16} /> เทมเพลต CSV
        </button>
      </div>

      <div className="team-wrap">
        <section className="form-card">
          <h3>1. เลือกไฟล์ (Excel .xlsx / .xls หรือ CSV)</h3>
          <p className="ai-hint">
            แถวแรกของไฟล์ต้องเป็นหัวตาราง — ระบบจะจับคู่หัวคอลัมน์กับฟิลด์ให้อัตโนมัติ
            (รองรับหัวตารางจากแอป AppSheet เดิม หรือดาวน์โหลดเทมเพลตด้านบนไปกรอก)
          </p>
          <label className="photo-drop">
            {fileName
              ? <><IconUpload size={16} /> {fileName} · {rawRows.length.toLocaleString('th-TH')} แถว{sheetName ? ` (ชีต "${sheetName}")` : ''} — คลิกเพื่อเปลี่ยนไฟล์</>
              : <><IconUpload size={16} /> คลิกเพื่อเลือกไฟล์</>}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleFile(f)
                e.target.value = ''
              }}
            />
          </label>
          {parseError && <div className="auth-error" style={{ marginTop: 10 }}>{parseError}</div>}
        </section>

        {headers.length > 0 && (
          <>
            <section className="form-card">
              <h3>2. จับคู่คอลัมน์ → ฟิลด์ในระบบ</h3>
              {!codeMapped && (
                <div className="auth-error">
                  ต้องมีคอลัมน์ที่จับคู่กับ "{LABELS.code} (code)" — เป็นรหัสอ้างอิงของทรัพย์ (จำเป็น)
                </div>
              )}
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr><th>คอลัมน์ในไฟล์</th><th>ตัวอย่างข้อมูล</th><th>นำเข้าเป็นฟิลด์</th></tr>
                  </thead>
                  <tbody>
                    {headers.map((h) => (
                      <tr key={h}>
                        <td data-label="คอลัมน์" className="td-main">{h}</td>
                        <td data-label="ตัวอย่าง">{sample(h)}</td>
                        <td data-label="ฟิลด์">
                          <select
                            className="plan-select"
                            value={mapping[h] ?? ''}
                            onChange={(e) =>
                              setMapping({ ...mapping, [h]: e.target.value as keyof PropertyInput | '' })}
                          >
                            <option value="">— ไม่นำเข้า —</option>
                            {IMPORT_FIELDS.map((f) => (
                              <option
                                key={f}
                                value={f}
                                disabled={Object.entries(mapping).some(([k, v]) => v === f && k !== h)}
                              >
                                {LABELS[f]} ({f})
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="form-card">
              <h3>3. ตรวจและนำเข้า</h3>
              <div className="imp-stats">
                <span className="tag alt">เพิ่มใหม่ {fresh.length.toLocaleString('th-TH')} แถว</span>
                {dups.length > 0 && <span className="tag">รหัสซ้ำกับในระบบ {dups.length.toLocaleString('th-TH')} แถว</span>}
                {noCode.length > 0 && <span className="tag warn">ไม่มีรหัส (ข้าม) {noCode.length.toLocaleString('th-TH')} แถว</span>}
              </div>
              {dups.length > 0 && (
                <div className="form-field" style={{ marginTop: 12 }}>
                  <label>เจอรหัสที่มีอยู่แล้วในระบบ ให้ทำอย่างไร</label>
                  <div className="btn-group">
                    <button type="button" className={`opt ${dupMode === 'skip' ? 'on' : ''}`}
                      onClick={() => setDupMode('skip')}>ข้ามแถวนั้น</button>
                    <button type="button" className={`opt ${dupMode === 'update' ? 'on' : ''}`}
                      onClick={() => setDupMode('update')}>อัปเดตทับข้อมูลเดิม</button>
                  </div>
                </div>
              )}
              {busy && (
                <div className="imp-progress">
                  <div className="imp-progress-bar" style={{ width: `${total ? Math.round((processed / total) * 100) : 0}%` }} />
                </div>
              )}
              <div className="form-actions" style={{ paddingBottom: 6 }}>
                <button
                  className="btn primary"
                  disabled={busy || !codeMapped || total === 0}
                  onClick={() => void runImport()}
                >
                  <IconUpload size={16} />
                  {busy
                    ? `กำลังนำเข้า… ${processed.toLocaleString('th-TH')}/${total.toLocaleString('th-TH')}`
                    : `นำเข้า ${total.toLocaleString('th-TH')} แถว`}
                </button>
              </div>
            </section>
          </>
        )}

        {result && (
          <section className="form-card">
            <h3>ผลการนำเข้า</h3>
            <div className="imp-stats">
              <span className="tag alt">เพิ่มใหม่สำเร็จ {result.inserted.toLocaleString('th-TH')}</span>
              {result.updated > 0 && <span className="tag alt">อัปเดต {result.updated.toLocaleString('th-TH')}</span>}
              {result.skipped > 0 && <span className="tag">ข้าม {result.skipped.toLocaleString('th-TH')}</span>}
              {result.errors.length > 0 && <span className="tag warn">ผิดพลาด {result.errors.length.toLocaleString('th-TH')}</span>}
            </div>
            {result.errors.length > 0 && (
              <ul className="imp-errors">
                {result.errors.slice(0, 20).map((e) => (
                  <li key={e.rowNo}>แถว {e.rowNo}{e.code ? ` (${e.code})` : ''}: {e.message}</li>
                ))}
                {result.errors.length > 20 && <li>…และอีก {result.errors.length - 20} แถว</li>}
              </ul>
            )}
            <div className="form-actions" style={{ paddingBottom: 6 }}>
              <button className="btn primary" onClick={() => navigate('/')}>ไปที่รายการทรัพย์</button>
            </div>
          </section>
        )}
      </div>
    </>
  )
}
