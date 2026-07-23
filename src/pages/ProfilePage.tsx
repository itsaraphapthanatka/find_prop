import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { API_BASE } from '../lib/native'
import { usePlanAccess } from '../lib/plan'

const roleLabel = (r: string) => (r === 'admin' ? 'แอดมิน' : 'ลูกทีม')

export default function ProfilePage() {
  const { session, profile, org, orgs, signOut, refreshProfile } = useAuth()
  const access = usePlanAccess()

  // ── ชื่อที่แสดง ──
  const [name, setName] = useState(profile?.full_name ?? '')
  const [savingName, setSavingName] = useState(false)
  const [nameMsg, setNameMsg] = useState<string | null>(null)

  // ── รหัสผ่าน (เฉพาะผู้ใช้อีเมล) ──
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [savingPw, setSavingPw] = useState(false)
  const [pwMsg, setPwMsg] = useState<string | null>(null)
  const [pwErr, setPwErr] = useState<string | null>(null)

  // ── ชวนเพื่อน (referral) ──
  const [refStat, setRefStat] = useState<
    { code: string; referred_count: number; rewards_granted: number; expires_at: string | null } | null
  >(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void supabase.rpc('referral_status').then(({ data }) => {
      // RPC คืนค่าเป็น setof (array) — เอาแถวแรก
      const rows = (data ?? []) as NonNullable<typeof refStat>[]
      if (rows[0]) setRefStat(rows[0])
    })
  }, [])

  // ผู้ใช้ที่ล็อกอินด้วยอีเมล/รหัสผ่านเท่านั้นถึงจะเปลี่ยนรหัสได้ (Google ไม่ต้อง)
  const identities = session?.user?.identities ?? []
  const hasPassword = identities.length === 0 || identities.some((i) => i.provider === 'email')

  const shareBase = API_BASE || (typeof window !== 'undefined' ? window.location.origin : '')
  const refLink = refStat ? `${shareBase}/#/login?ref=${refStat.code}` : ''
  const toNext = refStat ? 2 - (refStat.referred_count % 2) : 2

  if (!profile) return null

  async function saveName() {
    if (!profile) return
    const trimmed = name.trim()
    if (!trimmed) { setNameMsg('กรุณากรอกชื่อ'); return }
    setSavingName(true)
    setNameMsg(null)
    const { error } = await supabase.from('profiles').update({ full_name: trimmed }).eq('id', profile.id)
    setSavingName(false)
    if (error) { setNameMsg(`บันทึกไม่สำเร็จ: ${error.message}`); return }
    await refreshProfile()
    setNameMsg('บันทึกแล้ว ✓')
  }

  async function savePassword() {
    setPwErr(null)
    setPwMsg(null)
    if (pw1.length < 6) { setPwErr('รหัสผ่านอย่างน้อย 6 ตัวอักษร'); return }
    if (pw1 !== pw2) { setPwErr('รหัสผ่านทั้งสองช่องไม่ตรงกัน'); return }
    setSavingPw(true)
    const { error } = await supabase.auth.updateUser({ password: pw1 })
    setSavingPw(false)
    if (error) { setPwErr(error.message); return }
    setPw1('')
    setPw2('')
    setPwMsg('เปลี่ยนรหัสผ่านแล้ว ✓')
  }

  async function copyRefLink() {
    try {
      await navigator.clipboard.writeText(refLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* บางเบราว์เซอร์ไม่ให้ copy — ผู้ใช้กดเลือกเองได้ */ }
  }

  return (
    <>
      <div className="view-header">
        <h1>โปรไฟล์ของฉัน</h1>
      </div>

      <div className="team-wrap">
        {/* ── บัญชี ── */}
        <section className="form-card">
          <h3>บัญชี</h3>
          <div className="form-field">
            <label>อีเมล</label>
            <input type="text" readOnly value={profile.email} onFocus={(e) => e.currentTarget.select()} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); void saveName() }}>
            <div className="org-row">
              <div className="form-field" style={{ flex: 1, marginBottom: 0 }}>
                <label>ชื่อที่แสดง</label>
                <input type="text" required value={name} onChange={(e) => { setName(e.target.value); setNameMsg(null) }} />
              </div>
              <button className="btn" type="submit" disabled={savingName || name.trim() === (profile.full_name ?? '')}>
                {savingName ? 'กำลังบันทึก…' : 'บันทึกชื่อ'}
              </button>
            </div>
          </form>
          <p className="plan-line" style={{ marginTop: 8 }}>ชื่อนี้จะแสดงให้คนอื่นเห็น (ผู้ลงทรัพย์ · รายชื่อทีม · รีวิว)</p>
          {nameMsg && <p className="plan-line" style={{ marginTop: 6 }}>{nameMsg}</p>}
        </section>

        {/* ── รหัสผ่าน (เฉพาะผู้ใช้อีเมล) ── */}
        {hasPassword && (
          <section className="form-card">
            <h3>เปลี่ยนรหัสผ่าน</h3>
            <form onSubmit={(e) => { e.preventDefault(); void savePassword() }}>
              <div className="form-field">
                <label>รหัสผ่านใหม่</label>
                <input type="password" autoComplete="new-password" value={pw1} onChange={(e) => setPw1(e.target.value)} placeholder="อย่างน้อย 6 ตัวอักษร" />
              </div>
              <div className="form-field">
                <label>ยืนยันรหัสผ่านใหม่</label>
                <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
              </div>
              {pwErr && <div className="auth-error">{pwErr}</div>}
              {pwMsg && <p className="plan-line">{pwMsg}</p>}
              <button className="btn primary" type="submit" disabled={savingPw || !pw1 || !pw2}>
                {savingPw ? 'กำลังบันทึก…' : 'เปลี่ยนรหัสผ่าน'}
              </button>
            </form>
          </section>
        )}

        {/* ── องค์กรที่สังกัด ── */}
        <section className="form-card">
          <h3>องค์กรที่สังกัด</h3>
          <ul className="profile-orgs">
            {orgs.map((o) => (
              <li key={o.org_id} className={o.org_id === org?.id ? 'current' : ''}>
                <span className="org-name">{o.name}</span>
                <span className="role-badge">{roleLabel(o.role)}</span>
                {o.org_id === org?.id && <span className="role-badge super">ปัจจุบัน</span>}
              </li>
            ))}
            {orgs.length === 0 && org && (
              <li className="current"><span className="org-name">{org.name}</span></li>
            )}
          </ul>
          <p className="plan-line" style={{ marginTop: 10 }}>
            แพ็กเกจองค์กรปัจจุบัน: <span className="role-badge">{access.pro ? 'Pro' : 'Free'}</span>
            {access.pro && org?.sub_expires_at
              ? ` · ใช้ได้ถึง ${new Date(org.sub_expires_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}`
              : ''}
          </p>
        </section>

        {/* ── ชวนเพื่อน ── */}
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
            </div>
            <p className="plan-line" style={{ marginTop: 12 }}>
              ชวนสำเร็จแล้ว <b>{refStat.referred_count}</b> คน · อีก <b>{toNext}</b> คนได้ Pro +30 วัน
              {refStat.rewards_granted > 0 && (
                <> · ได้รางวัลไปแล้ว {refStat.rewards_granted} ครั้ง (Pro +{refStat.rewards_granted * 30} วัน)</>
              )}
            </p>
          </section>
        )}

        {/* ── ออกจากระบบ ── */}
        <section className="form-card">
          <button className="btn danger" type="button" onClick={() => void signOut()}>ออกจากระบบ</button>
        </section>
      </div>
    </>
  )
}
