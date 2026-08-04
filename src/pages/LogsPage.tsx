import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import {
  ACTION_GROUPS,
  ACTION_LABELS,
  type ActivityLog,
} from '../lib/activityLog'
import { LABELS } from '../labels'

const PAGE = 100

/** เวลาแบบไทยพร้อมนาที — log ต้องละเอียดกว่า formatDate ปกติ */
function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('th-TH', {
    year: '2-digit',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** แปลง detail jsonb เป็นข้อความอ่านง่าย */
function detailText(log: ActivityLog): string {
  const d = log.detail ?? {}
  const num = (v: unknown) => (typeof v === 'number' && v > 0 ? v : 0)
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null)
  if (log.action === 'import.run') {
    const parts = [
      num(d.inserted) ? `เพิ่ม ${num(d.inserted)}` : null,
      num(d.updated) ? `อัปเดต ${num(d.updated)}` : null,
      num(d.skipped) ? `ข้าม ${num(d.skipped)}` : null,
      num(d.failed) ? `พลาด ${num(d.failed)}` : null,
    ].filter(Boolean)
    return parts.length ? `${parts.join(' · ')} รายการ` : ''
  }
  if (log.action === 'ai.voice_fill') return num(d.fields) ? `กรอก ${num(d.fields)} ฟิลด์` : ''
  if (log.action === 'ai.assistant') {
    const t: Record<string, string> = {
      add_stop: 'เพิ่มจุดแวะ',
      remove_stop: 'ถอดจุดแวะ',
      create_plan: 'สร้างแผน',
      open_compare: 'เปิดเปรียบเทียบ',
    }
    const plan = str(d.plan)
    return [t[String(d.type)] ?? null, plan ? `แผน "${plan}"` : null].filter(Boolean).join(' · ')
  }
  if (log.action === 'plan.create') {
    const customer = str(d.customer)
    const stops = num(d.stops)
    return [customer ? `ลูกค้า ${customer}` : null, stops ? `${stops} จุดแวะ` : null].filter(Boolean).join(' · ')
  }
  if (log.action === 'plan.update') {
    const from = num(d.stops_from)
    const to = num(d.stops)
    return from !== to ? `จุดแวะ ${from} → ${to}` : 'แก้รายละเอียดแผน'
  }
  // ── รายละเอียดของ log ที่มาจาก trigger ในฐานข้อมูล (supabase/logs-triggers.sql) ──
  if (log.action === 'property.update') {
    const fields = Array.isArray(d.fields) ? (d.fields as unknown[]).map(String) : []
    if (!fields.length) return ''
    const names = fields.map((f) => LABELS[f as keyof typeof LABELS] ?? f)
    return names.length <= 4
      ? `แก้ ${names.join(', ')}`
      : `แก้ ${names.slice(0, 4).join(', ')} และอีก ${names.length - 4} ฟิลด์`
  }
  if (log.action === 'deal.close') return DEAL_TEXT[String(d.to)] ?? 'ปิดงาน'
  if (log.action === 'deal.reopen') return 'กลับมาเปิดงาน'
  if (log.action.startsWith('followup.')) {
    const title = str(d.title)
    const result = str(d.result)
    return [title ? `"${title}"` : null, result ? `ผล: ${result}` : null].filter(Boolean).join(' · ')
  }
  if (log.action === 'member.add') {
    return `${d.role === 'admin' ? 'แอดมิน' : 'ลูกทีม'}${d.see_all === false ? ' · เห็นเฉพาะทรัพย์ตัวเอง' : ''}`
  }
  if (log.action === 'member.update' || log.action === 'profile.rights') {
    const parts: string[] = []
    if (str(d.role_from) && d.role !== d.role_from) parts.push(`บทบาท ${d.role_from} → ${d.role}`)
    if (typeof d.active === 'boolean' && d.active !== d.active_from) parts.push(d.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน')
    if (typeof d.see_all === 'boolean' && d.see_all !== d.see_all_from) {
      parts.push(d.see_all ? 'ให้เห็นทรัพย์ทั้งองค์กร' : 'ให้เห็นเฉพาะทรัพย์ตัวเอง')
    }
    if (typeof d.is_super === 'boolean' && d.is_super !== d.is_super_from) {
      parts.push(d.is_super ? 'ยกเป็น super admin' : 'ถอด super admin')
    }
    return parts.join(' · ')
  }
  if (log.action === 'org.update') {
    const parts: string[] = []
    if (str(d.plan_from) && d.plan !== d.plan_from) parts.push(`แพ็กเกจ ${d.plan_from} → ${d.plan}`)
    if (str(d.sub_status_from) && d.sub_status !== d.sub_status_from) parts.push(`สถานะ ${d.sub_status_from} → ${d.sub_status}`)
    if (parts.length) return parts.join(' · ')
    const fields = Array.isArray(d.fields) ? (d.fields as unknown[]).length : 0
    return fields ? `แก้ ${fields} ฟิลด์` : ''
  }
  if (log.action === 'super.impersonate' || log.action === 'super.exit') return str(d.by) ?? ''
  return ''
}

const DEAL_TEXT: Record<string, string> = { rented: 'มีคนเช่าแล้ว', sold: 'ขายแล้ว' }

export default function LogsPage() {
  const { profile } = useAuth()
  const isSuper = Boolean(profile?.is_super)
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [group, setGroup] = useState('')
  const [q, setQ] = useState('')
  const [hasMore, setHasMore] = useState(false)

  const load = useCallback(
    async (offset: number, g: string) => {
      setLoading(true)
      let query = supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE - 1)
      if (g) query = query.like('action', `${g}%`)
      const { data, error } = await query
      if (error) {
        setError(
          /activity_logs/.test(error.message) && /does not exist|schema cache/.test(error.message)
            ? 'ยังไม่ได้สร้างตารางประวัติ — รัน supabase/logs.sql ใน SQL Editor ก่อน'
            : error.message,
        )
      } else {
        const rows = (data ?? []) as ActivityLog[]
        setError(null)
        setLogs((prev) => (offset === 0 ? rows : [...prev, ...rows]))
        setHasMore(rows.length === PAGE)
      }
      setLoading(false)
    },
    [],
  )

  useEffect(() => {
    void load(0, group)
  }, [load, group])

  // ค้นหาเพิ่มเติมฝั่งหน้าจอ: ชื่อคน / รหัสอ้างอิง
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return logs
    return logs.filter(
      (l) =>
        (l.user_name ?? '').toLowerCase().includes(s) ||
        (l.entity_code ?? '').toLowerCase().includes(s),
    )
  }, [logs, q])

  return (
    <>
      <div className="view-header">
        <h1>
          ประวัติการใช้งาน <span className="count-badge">{shown.length}</span>
        </h1>
      </div>

      <div className="logs-wrap">
        <section className="form-card">
          <div className="logs-filters">
            <div className="form-field">
              <label>การกระทำ</label>
              <select value={group} onChange={(e) => setGroup(e.target.value)}>
                {ACTION_GROUPS.map((g) => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>ค้นหา (ชื่อคน / รหัสทรัพย์ / ชื่อแผน)</label>
              <input
                type="search"
                value={q}
                placeholder="เช่น สมชาย หรือ WH-BP-114"
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
          <p className="ai-hint" style={{ marginBottom: 0 }}>
            บันทึกอัตโนมัติเมื่อมีการ เพิ่ม/แก้/ลบทรัพย์ · แผนเยี่ยมชม · นำเข้าไฟล์ · ใช้ AI —
            เห็นเฉพาะแอดมิน{isSuper ? ' (บัญชี super เห็นทุกองค์กร)' : 'ขององค์กรนี้'} และแก้ไข/ลบย้อนหลังไม่ได้
          </p>
        </section>

        {error && <div className="empty-state">{error}</div>}
        {!error && !loading && shown.length === 0 && (
          <div className="empty-state">ยังไม่มีประวัติ{q || group ? 'ที่ตรงกับตัวกรอง' : ' — จะเริ่มเก็บเมื่อมีการใช้งานครั้งถัดไป'}</div>
        )}

        {shown.length > 0 && (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>เวลา</th>
                  <th>ผู้ใช้</th>
                  <th>การกระทำ</th>
                  <th>อ้างอิง</th>
                  <th>รายละเอียด</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((l) => (
                  <tr key={l.id}>
                    <td data-label="เวลา" className="log-when">{formatWhen(l.created_at)}</td>
                    <td data-label="ผู้ใช้">{l.user_name ?? '—'}</td>
                    <td data-label="การกระทำ">
                      <span className={`log-badge ${l.action.split('.')[0]}`}>
                        {ACTION_LABELS[l.action] ?? l.action}
                      </span>
                    </td>
                    <td data-label="อ้างอิง">{l.entity_code ?? '—'}</td>
                    <td data-label="รายละเอียด">{detailText(l) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {loading && <div className="empty-state">กำลังโหลด…</div>}
        {!loading && hasMore && !q && (
          <button className="btn" style={{ margin: '12px auto', display: 'block' }} onClick={() => void load(logs.length, group)}>
            โหลดเพิ่ม
          </button>
        )}
      </div>
    </>
  )
}
