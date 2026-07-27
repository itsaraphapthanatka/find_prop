import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatDate } from '../labels'
import { fetchPlanPrices, DEFAULT_PRICES, type PlanPrices, type Tier } from '../lib/payments'

// Dashboard ยอดสมัครใช้งาน (เฉพาะ super admin) — อ่านจาก super_org_overview + organizations.plan_tier
// นิยาม "ยอดสมัคร" = องค์กรที่ถูกสร้าง (1 องค์กร = 1 ทีมที่สมัครเข้ามา) · ผู้ใช้ = สมาชิกรวมทุกองค์กร

interface OrgRow {
  id: string
  name: string
  plan: string
  sub_status: string
  sub_expires_at: string | null
  trial_plan?: string | null
  trial_expires_at?: string | null
  created_at: string
  member_count: number
  property_count: number
}

const todayIso = () => new Date().toISOString().slice(0, 10)

function isPaying(o: OrgRow): boolean {
  if (o.plan === 'free' || o.sub_status === 'suspended') return false
  return !o.sub_expires_at || o.sub_expires_at >= todayIso()
}

function isOnTrial(o: OrgRow): boolean {
  return o.plan === 'free' && Boolean(o.trial_plan) &&
    Boolean(o.trial_expires_at && o.trial_expires_at >= todayIso())
}

/** ป้ายเดือนย้อนหลัง n เดือน (เก่า→ใหม่) พร้อมคีย์ 'YYYY-MM' สำหรับจับคู่ */
function lastMonths(n: number): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = []
  const d = new Date()
  d.setDate(1)
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1)
    out.push({
      key: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`,
      label: m.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' }),
    })
  }
  return out
}

export default function SuperStatsPage() {
  const [orgs, setOrgs] = useState<OrgRow[]>([])
  const [tiers, setTiers] = useState<Record<string, number | null>>({})
  const [prices, setPrices] = useState<PlanPrices>(DEFAULT_PRICES)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.rpc('super_org_overview')
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      setOrgs((data ?? []) as OrgRow[])
      // plan_tier ไม่อยู่ใน overview — ดึงแยกไว้คำนวณ MRR (พลาดก็แค่ MRR ประมาณด้วยระดับ 500)
      const { data: t } = await supabase.from('organizations').select('id, plan_tier')
      const m: Record<string, number | null> = {}
      for (const r of (t ?? []) as { id: string; plan_tier: number | null }[]) m[r.id] = r.plan_tier
      setTiers(m)
      setPrices(await fetchPlanPrices())
      setLoading(false)
    })()
  }, [])

  const s = useMemo(() => {
    const months = lastMonths(12)
    const byMonth = new Map(months.map((m) => [m.key, 0]))
    const thisMonthKey = months[months.length - 1].key
    let users = 0
    let props = 0
    let paying = 0
    let trial = 0
    let enterprise = 0
    let mrr = 0
    for (const o of orgs) {
      users += o.member_count
      props += o.property_count
      const k = (o.created_at ?? '').slice(0, 7)
      if (byMonth.has(k)) byMonth.set(k, (byMonth.get(k) ?? 0) + 1)
      if (isOnTrial(o)) trial++
      if (isPaying(o)) {
        paying++
        if (o.plan === 'enterprise') enterprise++
        else {
          const tier = (tiers[o.id] ?? 500) as Tier
          const p = prices[o.plan as 'starter' | 'pro']?.[tier]
          if (p) mrr += p.monthly
        }
      }
    }
    const rows = months.map((m) => ({ ...m, count: byMonth.get(m.key) ?? 0 }))
    const max = Math.max(1, ...rows.map((r) => r.count))
    const newest = [...orgs].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')).slice(0, 10)
    return {
      rows, max,
      total: orgs.length,
      thisMonth: byMonth.get(thisMonthKey) ?? 0,
      users, props, paying, trial, enterprise, mrr,
      free: orgs.length - paying - trial,
      newest,
    }
  }, [orgs, tiers, prices])

  return (
    <>
      <div className="view-header">
        <h1>ยอดสมัครใช้งาน <span className="count-badge">{s.total} องค์กร</span></h1>
        <div className="header-actions">
          <Link to="/super" className="btn">← Super Admin</Link>
        </div>
      </div>
      <div className="team-wrap super-wrap">
        {error && <div className="auth-error">{error}</div>}
        {loading && <div className="loading">กำลังโหลด…</div>}
        {!loading && !error && (
          <>
            {/* KPI หลัก */}
            <div className="dash-tiles">
              <div className="stat-tile">
                <div className="stat-label">องค์กรทั้งหมด</div>
                <div className="stat-value">{s.total.toLocaleString()}</div>
                <div className="stat-sub">+{s.thisMonth} เดือนนี้</div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">ผู้ใช้รวม</div>
                <div className="stat-value">{s.users.toLocaleString()}</div>
                <div className="stat-sub">ทรัพย์รวม {s.props.toLocaleString()} รายการ</div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">จ่ายเงินอยู่</div>
                <div className="stat-value">{s.paying.toLocaleString()}</div>
                <div className="stat-sub">ทดลองใช้ {s.trial} · free {Math.max(0, s.free)}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">MRR (ประมาณ)</div>
                <div className="stat-value">฿{s.mrr.toLocaleString()}</div>
                <div className="stat-sub">{s.enterprise > 0 ? `ยังไม่รวม Enterprise ${s.enterprise} ราย` : 'จากราคารายเดือนปัจจุบัน'}</div>
              </div>
            </div>

            {/* สมัครใหม่รายเดือน (12 เดือนล่าสุด) — แท่งเดียวสีม่วง ป้ายค่าเป็นตัวหนังสือปกติ */}
            <section className="form-card">
              <h3>องค์กรสมัครใหม่รายเดือน (12 เดือนล่าสุด)</h3>
              <div className="hbars" style={{ marginTop: 6 }}>
                {s.rows.map((r) => (
                  <div className="hbar-row" key={r.key} title={`${r.label}: สมัครใหม่ ${r.count} องค์กร`}>
                    <span className="hbar-label">{r.label}</span>
                    <span className="hbar-track">
                      <span className="hbar-fill" style={{ width: `${(r.count / s.max) * 100}%`, opacity: r.count === 0 ? 0 : 1 }} />
                    </span>
                    <span className="hbar-val">{r.count}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* องค์กรล่าสุด */}
            <section className="form-card">
              <h3>สมัครล่าสุด 10 องค์กร</h3>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr><th>องค์กร</th><th>สมัครเมื่อ</th><th>สถานะ</th><th>สมาชิก</th><th>ทรัพย์</th></tr>
                  </thead>
                  <tbody>
                    {s.newest.map((o) => (
                      <tr key={o.id}>
                        <td data-label="องค์กร" className="td-main">{o.name}</td>
                        <td data-label="สมัครเมื่อ">{formatDate(o.created_at)}</td>
                        <td data-label="สถานะ">
                          {isPaying(o)
                            ? <span className="status-pill on">{o.plan === 'pro' ? 'Pro' : o.plan === 'enterprise' ? 'Enterprise' : 'Basic'}</span>
                            : isOnTrial(o)
                              ? <span className="status-pill">ทดลองใช้</span>
                              : <span className="status-pill">Free</span>}
                        </td>
                        <td data-label="สมาชิก">{o.member_count}</td>
                        <td data-label="ทรัพย์">{o.property_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </>
  )
}
