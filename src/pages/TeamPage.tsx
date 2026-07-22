import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth, type Profile } from '../lib/auth'
import { API_BASE } from '../lib/native'

// โปรไฟล์ + ฟิลด์การมองเห็นทรัพย์ (คอลัมน์ see_all_properties เพิ่มจาก property-visibility.sql)
type MemberRow = Profile & { see_all_properties?: boolean }

export default function TeamPage() {
  const { profile: me, org, refreshProfile } = useAuth()
  const [members, setMembers] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [orgName, setOrgName] = useState(org?.name ?? '')
  const [savingOrg, setSavingOrg] = useState(false)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // องค์กรที่มีผลจริง: สำหรับ super ให้องค์กรที่สวมสิทธิ์มาก่อนเสมอ
  // (super เห็นโปรไฟล์ทุกองค์กรผ่าน RLS จึงต้องกรองฝั่งนี้ให้เหลือองค์กรเดียว)
  const orgId = (me?.is_super ? me?.impersonate_org_id : null) ?? me?.org_id ?? null

  async function reload() {
    if (!orgId) {
      setMembers([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true })
    if (error) setError(error.message)
    else setMembers((data ?? []) as MemberRow[])
    setLoading(false)
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId])

  async function addMember(e: React.FormEvent) {
    e.preventDefault()
    setAdding(true)
    setNotice(null)
    setError(null)
    // สร้างลูกทีมผ่าน API ฝั่งเซิร์ฟเวอร์ (service role, ยืนยันอีเมลเลย → ไม่ส่งเมล ไม่ติด rate limit)
    const { data: s } = await supabase.auth.getSession()
    try {
      const res = await fetch(`${API_BASE}/api/create-member`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${s.session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ email: email.trim(), password, full_name: name.trim() }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(`เพิ่มลูกทีมไม่สำเร็จ: ${out.error || res.statusText}`)
        setAdding(false)
        return
      }
      setNotice(`เพิ่ม ${email.trim()} เข้า ${org?.name ?? 'องค์กร'} แล้ว — ใช้ล็อกอินได้ทันที`)
    } catch (err) {
      setError(`เพิ่มลูกทีมไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`)
      setAdding(false)
      return
    }
    setName('')
    setEmail('')
    setPassword('')
    setAdding(false)
    await reload()
  }

  async function setField(p: MemberRow, patch: Partial<MemberRow>) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', p.id)
    if (error) alert(`บันทึกไม่สำเร็จ: ${error.message}`)
    else await reload()
  }

  return (
    <>
      <div className="view-header">
        <h1>ทีม <span className="count-badge">{members.length}</span></h1>
        <div className="header-actions">
          <Link to="/logs" className="btn">ประวัติการใช้งาน</Link>
        </div>
      </div>

      <div className="team-wrap">
        <section className="form-card">
          <h3>องค์กร</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setSavingOrg(true)
              void supabase
                .from('organizations')
                .update({ name: orgName.trim() })
                .eq('id', org?.id ?? '')
                .then(async ({ error }) => {
                  if (error) alert(`บันทึกชื่อองค์กรไม่สำเร็จ: ${error.message}`)
                  else await refreshProfile()
                  setSavingOrg(false)
                })
            }}
          >
            <div className="org-row">
              <div className="form-field" style={{ flex: 1, marginBottom: 0 }}>
                <label>ชื่อองค์กร</label>
                <input
                  type="text"
                  required
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                />
              </div>
              <button className="btn" type="submit" disabled={savingOrg || orgName.trim() === org?.name}>
                {savingOrg ? 'กำลังบันทึก…' : 'บันทึกชื่อ'}
              </button>
            </div>
          </form>
          {org?.plan && (
            <p className="plan-line">
              แพ็กเกจ: <span className="role-badge">{org.plan}</span>
              {org.sub_expires_at
                ? ` · ใช้ได้ถึง ${new Date(org.sub_expires_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}`
                : ' · ไม่มีวันหมดอายุ'}
            </p>
          )}
        </section>

        <section className="form-card" data-tour="team-add">
          <h3>เพิ่มลูกทีมใหม่</h3>
          {notice && <div className="auth-notice">{notice}</div>}
          {error && <div className="auth-error">{error}</div>}
          <form onSubmit={(e) => void addMember(e)}>
            <div className="form-grid-2">
              <div className="form-field">
                <label>ชื่อ <span className="req">*</span></label>
                <input type="text" required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="form-field">
                <label>อีเมล <span className="req">*</span></label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <div className="form-field">
              <label>รหัสผ่านตั้งต้น <span className="req">*</span></label>
              <input
                type="text"
                required
                minLength={6}
                placeholder="อย่างน้อย 6 ตัวอักษร — ส่งให้ลูกทีมใช้ล็อกอิน"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="form-actions" style={{ paddingBottom: 6 }}>
              <button className="btn primary" type="submit" disabled={adding}>
                {adding ? 'กำลังเพิ่ม…' : '+ เพิ่มลูกทีม'}
              </button>
            </div>
          </form>
        </section>

        <section className="form-card">
          <h3>สมาชิกทั้งหมด</h3>
          <p style={{ margin: '0 0 12px', fontSize: 13, opacity: 0.7 }}>
            การมองเห็นทรัพย์: “เห็นทั้งทีม” = เห็นทรัพย์ทุกชิ้นขององค์กร · “เฉพาะของตัวเอง” = เห็นเฉพาะทรัพย์ที่ตัวเองลง (แอดมินเห็นทั้งองค์กรเสมอ)
          </p>
          {loading && <div className="loading">กำลังโหลด…</div>}
          {!loading && (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ชื่อ</th>
                    <th>อีเมล</th>
                    <th>บทบาท</th>
                    <th>สถานะ</th>
                    <th>การมองเห็นทรัพย์</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => {
                    const seeAll = m.see_all_properties ?? true
                    return (
                    <tr key={m.id}>
                      <td data-label="ชื่อ" className="td-main">{m.full_name || '—'}{m.id === me?.id && <span className="role-badge" style={{ marginLeft: 6 }}>คุณ</span>}</td>
                      <td data-label="อีเมล">{m.email}</td>
                      <td data-label="บทบาท">
                        <span className={`role-badge ${m.role === 'admin' ? '' : 'plain'}`}>
                          {m.role === 'admin' ? 'แอดมิน' : 'ลูกทีม'}
                        </span>
                      </td>
                      <td data-label="สถานะ">
                        <span className={`status-pill ${m.active ? 'on' : ''}`}>
                          {m.active ? 'ใช้งานได้' : 'รออนุมัติ/ปิด'}
                        </span>
                      </td>
                      <td data-label="การมองเห็นทรัพย์">
                        {m.role === 'admin' ? (
                          <span className="status-pill on">ทั้งองค์กร</span>
                        ) : (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span className={`status-pill ${seeAll ? 'on' : ''}`}>
                              {seeAll ? 'เห็นทั้งทีม' : 'เฉพาะของตัวเอง'}
                            </span>
                            <button
                              className="btn sm"
                              onClick={() => void setField(m, { see_all_properties: !seeAll })}
                            >
                              {seeAll ? 'จำกัดเฉพาะตัวเอง' : 'ให้เห็นทั้งทีม'}
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="row-btns">
                        {m.id !== me?.id && (
                          <>
                            <button
                              className="btn sm"
                              onClick={() => void setField(m, { active: !m.active })}
                            >
                              {m.active ? 'ปิดการใช้งาน' : 'อนุมัติ'}
                            </button>
                            <button
                              className="btn sm"
                              onClick={() => void setField(m, { role: m.role === 'admin' ? 'member' : 'admin' })}
                            >
                              {m.role === 'admin' ? 'ลดเป็นลูกทีม' : 'ตั้งเป็นแอดมิน'}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  )
}
