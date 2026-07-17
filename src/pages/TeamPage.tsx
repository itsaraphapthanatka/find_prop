import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { useAuth, type Profile } from '../lib/auth'

// client แยกสำหรับสมัครบัญชีลูกทีม — ไม่เก็บ session เพื่อไม่ให้ทับ session ของแอดมิน
const inviteClient = createClient(
  (import.meta.env.VITE_SUPABASE_URL as string) ?? 'https://placeholder.supabase.co',
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ?? 'placeholder',
  { auth: { persistSession: false, autoRefreshToken: false } },
)

export default function TeamPage() {
  const { profile: me, org, refreshProfile } = useAuth()
  const [members, setMembers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [orgName, setOrgName] = useState(org?.name ?? '')
  const [savingOrg, setSavingOrg] = useState(false)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  async function reload() {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: true })
    if (error) setError(error.message)
    else setMembers((data ?? []) as Profile[])
    setLoading(false)
  }

  useEffect(() => {
    void reload()
  }, [])

  async function addMember(e: React.FormEvent) {
    e.preventDefault()
    setAdding(true)
    setNotice(null)
    setError(null)
    const { data, error } = await inviteClient.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name.trim() } },
    })
    if (error) {
      setError(`เพิ่มลูกทีมไม่สำเร็จ: ${error.message}`)
      setAdding(false)
      return
    }
    // trigger สร้างโปรไฟล์ (ยังไม่มีองค์กร) แล้ว — ดึงเข้าองค์กรของแอดมิน + เปิดใช้งาน
    if (data.user) {
      const { error: adoptErr } = await supabase.rpc('adopt_member', {
        member_id: data.user.id,
      })
      if (adoptErr) setError(`สร้างบัญชีแล้วแต่ดึงเข้าองค์กรไม่สำเร็จ: ${adoptErr.message}`)
      else setNotice(`เพิ่ม ${email.trim()} เข้า ${org?.name ?? 'องค์กร'} แล้ว — ใช้ล็อกอินได้ทันที`)
    }
    setName('')
    setEmail('')
    setPassword('')
    setAdding(false)
    await reload()
  }

  async function setField(p: Profile, patch: Partial<Profile>) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', p.id)
    if (error) alert(`บันทึกไม่สำเร็จ: ${error.message}`)
    else await reload()
  }

  return (
    <>
      <div className="view-header">
        <h1>ทีม <span className="count-badge">{members.length}</span></h1>
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

        <section className="form-card">
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
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id}>
                      <td>{m.full_name || '—'}{m.id === me?.id && <span className="role-badge" style={{ marginLeft: 6 }}>คุณ</span>}</td>
                      <td>{m.email}</td>
                      <td>
                        <span className={`role-badge ${m.role === 'admin' ? '' : 'plain'}`}>
                          {m.role === 'admin' ? 'แอดมิน' : 'ลูกทีม'}
                        </span>
                      </td>
                      <td>
                        <span className={`status-pill ${m.active ? 'on' : ''}`}>
                          {m.active ? 'ใช้งานได้' : 'รออนุมัติ/ปิด'}
                        </span>
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
