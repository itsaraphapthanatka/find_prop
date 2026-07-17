import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatDate } from '../labels'

interface OrgOverview {
  id: string
  name: string
  plan: string
  sub_status: string
  sub_expires_at: string | null
  created_at: string
  member_count: number
  property_count: number
}

const PLANS = ['free', 'pro', 'enterprise']

export default function SuperAdminPage() {
  const [orgs, setOrgs] = useState<OrgOverview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // ค่าที่แก้ค้างไว้ต่อองค์กร (ยังไม่บันทึก)
  const [edits, setEdits] = useState<Record<string, { plan: string; sub_expires_at: string }>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  async function reload() {
    setLoading(true)
    const { data, error } = await supabase.rpc('super_org_overview')
    if (error) setError(error.message)
    else setOrgs((data ?? []) as OrgOverview[])
    setLoading(false)
  }

  useEffect(() => {
    void reload()
  }, [])

  function editOf(o: OrgOverview) {
    return edits[o.id] ?? { plan: o.plan, sub_expires_at: o.sub_expires_at ?? '' }
  }

  function setEdit(o: OrgOverview, patch: Partial<{ plan: string; sub_expires_at: string }>) {
    setEdits((e) => ({ ...e, [o.id]: { ...editOf(o), ...patch } }))
  }

  function isDirty(o: OrgOverview) {
    const e = editOf(o)
    return e.plan !== o.plan || e.sub_expires_at !== (o.sub_expires_at ?? '')
  }

  async function save(o: OrgOverview) {
    const e = editOf(o)
    setSavingId(o.id)
    const { error } = await supabase
      .from('organizations')
      .update({ plan: e.plan, sub_expires_at: e.sub_expires_at || null })
      .eq('id', o.id)
    setSavingId(null)
    if (error) alert(`บันทึกไม่สำเร็จ: ${error.message}`)
    else {
      setEdits(({ [o.id]: _drop, ...rest }) => rest)
      await reload()
    }
  }

  async function toggleStatus(o: OrgOverview) {
    const next = o.sub_status === 'active' ? 'suspended' : 'active'
    if (next === 'suspended' && !window.confirm(`ระงับองค์กร "${o.name}"? สมาชิกทั้งหมดจะใช้งานไม่ได้ทันที`)) return
    const { error } = await supabase
      .from('organizations')
      .update({ sub_status: next })
      .eq('id', o.id)
    if (error) alert(`เปลี่ยนสถานะไม่สำเร็จ: ${error.message}`)
    else await reload()
  }

  const expired = (o: OrgOverview) =>
    o.sub_expires_at != null && o.sub_expires_at < new Date().toISOString().slice(0, 10)

  return (
    <>
      <div className="view-header">
        <h1>Super Admin <span className="count-badge">{orgs.length} องค์กร</span></h1>
      </div>
      <div className="team-wrap super-wrap">
        <section className="form-card">
          <h3>องค์กรทั้งหมด · บริหาร Subscription</h3>
          {error && <div className="auth-error">{error}</div>}
          {loading && <div className="loading">กำลังโหลด…</div>}
          {!loading && orgs.length === 0 && !error && (
            <div className="empty-state">ยังไม่มีองค์กรในระบบ</div>
          )}
          {!loading && orgs.length > 0 && (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>องค์กร</th>
                    <th>สมาชิก</th>
                    <th>ทรัพย์</th>
                    <th>แพ็กเกจ</th>
                    <th>หมดอายุ</th>
                    <th>สถานะ</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.map((o) => (
                    <tr key={o.id} className={o.sub_status === 'suspended' ? 'row-off' : ''}>
                      <td>
                        <b>{o.name}</b>
                        <div className="td-sub">สร้าง {formatDate(o.created_at)}</div>
                      </td>
                      <td>{o.member_count}</td>
                      <td>{o.property_count}</td>
                      <td>
                        <select
                          className="plan-select"
                          value={editOf(o).plan}
                          onChange={(e) => setEdit(o, { plan: e.target.value })}
                        >
                          {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </td>
                      <td>
                        <input
                          type="date"
                          className="date-input"
                          value={editOf(o).sub_expires_at}
                          onChange={(e) => setEdit(o, { sub_expires_at: e.target.value })}
                        />
                        {expired(o) && <div className="td-sub" style={{ color: 'var(--danger)' }}>หมดอายุแล้ว</div>}
                      </td>
                      <td>
                        <span className={`status-pill ${o.sub_status === 'active' && !expired(o) ? 'on' : ''}`}>
                          {o.sub_status === 'suspended' ? 'ระงับ' : expired(o) ? 'หมดอายุ' : 'ใช้งานได้'}
                        </span>
                      </td>
                      <td className="row-btns">
                        <button
                          className="btn sm primary"
                          disabled={!isDirty(o) || savingId === o.id}
                          onClick={() => void save(o)}
                        >
                          {savingId === o.id ? 'กำลังบันทึก…' : 'บันทึก'}
                        </button>
                        <button
                          className={`btn sm ${o.sub_status === 'active' ? 'danger' : ''}`}
                          onClick={() => void toggleStatus(o)}
                        >
                          {o.sub_status === 'active' ? 'ระงับ' : 'เปิดใช้งาน'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  )
}
