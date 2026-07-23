import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth, type Profile } from '../lib/auth'
import { API_BASE } from '../lib/native'
import { FREE_MAX_MEMBERS, usePlanAccess } from '../lib/plan'

// โปรไฟล์ + ฟิลด์การมองเห็นทรัพย์ (คอลัมน์ see_all_properties เพิ่มจาก property-visibility.sql)
type MemberRow = Profile & { see_all_properties?: boolean }

export default function TeamPage() {
  const { profile: me, org, refreshProfile } = useAuth()
  const access = usePlanAccess()
  const [members, setMembers] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [orgName, setOrgName] = useState(org?.name ?? '')
  const [savingOrg, setSavingOrg] = useState(false)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteErr, setInviteErr] = useState<string | null>(null)
  const [lastInvite, setLastInvite] = useState<{ email: string; link: string; emailed: boolean } | null>(null)
  const [invites, setInvites] = useState<{ id: string; email: string; token: string; created_at: string }[]>([])
  const [copiedTok, setCopiedTok] = useState<string | null>(null)
  // สถานะชวนเพื่อน (referral) — โหลดจาก RPC referral_status
  const [refStat, setRefStat] = useState<
    { code: string; referred_count: number; rewards_granted: number; expires_at: string | null } | null
  >(null)
  const [copied, setCopied] = useState(false)

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

  useEffect(() => {
    void supabase.rpc('referral_status').then(({ data }) => {
      const rows = (data ?? []) as {
        code: string; referred_count: number; rewards_granted: number; expires_at: string | null
      }[]
      if (rows[0]) setRefStat(rows[0])
    })
  }, [])

  useEffect(() => {
    void loadInvites()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId])

  // ลิงก์ชวนเพื่อนต้องชี้ไป "เว็บ" เสมอ (ในแอป origin เป็น capacitor://localhost)
  const shareBase = API_BASE || (typeof window !== 'undefined' ? window.location.origin : '')
  const refLink = refStat ? `${shareBase}/#/login?ref=${refStat.code}` : ''
  // อีกกี่คนถึงได้รางวัลรอบถัดไป (ครบทุก 2 คน)
  const toNext = refStat ? 2 - (refStat.referred_count % 2) : 2
  // แพ็กเกจ Free จำกัดลูกทีม (นับรวมทุกคนในองค์กร)
  const atMemberLimit = !access.pro && members.length >= FREE_MAX_MEMBERS

  async function copyRefLink() {
    try {
      await navigator.clipboard.writeText(refLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* บางเบราว์เซอร์ไม่ให้ copy — ผู้ใช้กดเลือกเองได้ */ }
  }

  async function shareRefLink() {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ title: 'HOP', text: 'สมัครใช้ HOP ผ่านลิงก์นี้', url: refLink })
      } catch { /* ผู้ใช้ยกเลิกการแชร์ */ }
    } else {
      void copyRefLink()
    }
  }

  async function loadInvites() {
    if (!orgId) {
      setInvites([])
      return
    }
    const { data } = await supabase
      .from('team_invites')
      .select('id, email, token, created_at')
      .eq('org_id', orgId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    setInvites((data ?? []) as { id: string; email: string; token: string; created_at: string }[])
  }

  async function createInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviting(true)
    setInviteErr(null)
    // ผ่าน API ฝั่งเซิร์ฟเวอร์: สร้างคำเชิญ + ส่งอีเมลอัตโนมัติ (ถ้าตั้ง Resend) · ไม่งั้นคืนลิงก์ให้คัดลอก
    const { data: s } = await supabase.auth.getSession()
    try {
      const res = await fetch(`${API_BASE}/api/send-invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${s.session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      })
      const out = await res.json().catch(() => ({}))
      setInviting(false)
      if (!res.ok) {
        setInviteErr(`สร้างคำเชิญไม่สำเร็จ: ${out.error || res.statusText}`)
        return
      }
      setLastInvite({ email: inviteEmail.trim(), link: out.link, emailed: Boolean(out.emailed) })
      setInviteEmail('')
      await loadInvites()
    } catch (err) {
      setInviting(false)
      setInviteErr(`สร้างคำเชิญไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function revokeInvite(id: string) {
    const { error } = await supabase.from('team_invites').update({ status: 'revoked' }).eq('id', id)
    if (error) alert(`ยกเลิกคำเชิญไม่สำเร็จ: ${error.message}`)
    else await loadInvites()
  }

  async function copyInvite(link: string, key: string) {
    try {
      await navigator.clipboard.writeText(link)
      setCopiedTok(key)
      setTimeout(() => setCopiedTok(null), 1800)
    } catch { /* คัดลอกไม่ได้ — ผู้ใช้เลือกเองได้ */ }
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

        {refStat && (
          <section className="form-card">
            <h3>ชวนเพื่อน รับ Pro ฟรี 🎁</h3>
            <p style={{ margin: '0 0 12px', fontSize: 13, opacity: 0.75 }}>
              ชวนเพื่อนสมัคร HOP แล้วสร้างองค์กรของตัวเอง ครบทุก <b>2 คน</b> องค์กรคุณได้ <b>Pro เพิ่ม 30 วัน</b> (สะสมได้)
            </p>
            <div className="org-row">
              <div className="form-field" style={{ flex: 1, marginBottom: 0 }}>
                <label>ลิงก์ชวนเพื่อนของคุณ</label>
                <input type="text" readOnly value={refLink} onFocus={(e) => e.currentTarget.select()} />
              </div>
              <button type="button" className="btn" onClick={() => void copyRefLink()}>
                {copied ? 'คัดลอกแล้ว ✓' : 'คัดลอก'}
              </button>
              {typeof navigator !== 'undefined' && 'share' in navigator && (
                <button type="button" className="btn" onClick={() => void shareRefLink()}>แชร์</button>
              )}
            </div>
            <p className="plan-line" style={{ marginTop: 12 }}>
              ชวนสำเร็จแล้ว <b>{refStat.referred_count}</b> คน · อีก <b>{toNext}</b> คนได้ Pro +30 วัน
              {refStat.rewards_granted > 0 && (
                <> · ได้รางวัลไปแล้ว {refStat.rewards_granted} ครั้ง (Pro +{refStat.rewards_granted * 30} วัน)</>
              )}
            </p>
          </section>
        )}

        <section className="form-card" data-tour="team-add">
          <h3>เชิญลูกทีม</h3>
          <p style={{ margin: '0 0 12px', fontSize: 13, opacity: 0.75, lineHeight: 1.5 }}>
            กรอกอีเมลลูกทีม → สร้างลิงก์เชิญ → ส่งลิงก์ให้เขา (LINE/อีเมล) · เปิดลิงก์แล้วสมัคร/ล็อกอิน<b>ด้วยอีเมลนั้น</b> จะเข้าองค์กรเป็นลูกทีมอัตโนมัติ (ตั้งรหัสผ่านเอง/ใช้ Google)
          </p>
          {atMemberLimit && (
            <div style={{
              background: 'var(--purple-subtle)', color: 'var(--purple)', borderRadius: 10,
              padding: '8px 12px', fontSize: 13, marginBottom: 12, lineHeight: 1.5,
            }}>
              🔒 แพ็กเกจ Free มีลูกทีมได้สูงสุด {FREE_MAX_MEMBERS} คน — อัปเกรด Pro หรือชวนเพื่อน 2 คน (การ์ดด้านบน) เพื่อเพิ่มได้ไม่จำกัด
            </div>
          )}
          {inviteErr && <div className="auth-error">{inviteErr}</div>}
          <form onSubmit={(e) => void createInvite(e)}>
            <div className="org-row">
              <div className="form-field" style={{ flex: 1, marginBottom: 0 }}>
                <label>อีเมลลูกทีม <span className="req">*</span></label>
                <input type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
              </div>
              <button className="btn primary" type="submit" disabled={inviting || atMemberLimit}>
                {inviting ? 'กำลังสร้าง…' : 'สร้างลิงก์เชิญ'}
              </button>
            </div>
          </form>

          {lastInvite && (
            <div className="auth-notice" style={{ marginTop: 12 }}>
              {lastInvite.emailed
                ? <>ส่งอีเมลเชิญไปที่ <b>{lastInvite.email}</b> แล้ว ✓ (หรือคัดลอกลิงก์ส่งเองได้)</>
                : <>ลิงก์เชิญสำหรับ <b>{lastInvite.email}</b> — คัดลอกส่งให้ได้เลย:</>}
              <div className="org-row" style={{ marginTop: 8 }}>
                <div className="form-field" style={{ flex: 1, marginBottom: 0 }}>
                  <input type="text" readOnly value={lastInvite.link} onFocus={(e) => e.currentTarget.select()} />
                </div>
                <button type="button" className="btn" onClick={() => void copyInvite(lastInvite.link, 'last')}>
                  {copiedTok === 'last' ? 'คัดลอกแล้ว ✓' : 'คัดลอก'}
                </button>
              </div>
            </div>
          )}

          {invites.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>คำเชิญที่รอตอบรับ ({invites.length})</div>
              {invites.map((iv) => {
                const link = `${shareBase}/#/login?invite=${iv.token}`
                return (
                  <div
                    key={iv.id}
                    style={{
                      display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
                      padding: '8px 0', borderTop: '1px solid var(--line-soft)',
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 140 }}>{iv.email}</span>
                    <button type="button" className="btn sm" onClick={() => void copyInvite(link, iv.token)}>
                      {copiedTok === iv.token ? 'คัดลอกแล้ว ✓' : 'คัดลอกลิงก์'}
                    </button>
                    <button type="button" className="btn sm" onClick={() => void revokeInvite(iv.id)}>ยกเลิก</button>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="form-card">
          <h3>สมาชิกทั้งหมด</h3>
          {error && <div className="auth-error">{error}</div>}
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
