import { useEffect, useState } from 'react'
import { ROLE_INFO, roleName, rolePerm, type Role } from '../lib/roles'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { API_BASE } from '../lib/native'
import { usePlanAccess, fetchReferralSetting, DEFAULT_REFERRAL, fetchContractAlertSetting, DEFAULT_CONTRACT_ALERT, onTrial, seatLimit, activeExtraSeats } from '../lib/plan'
import { reviewFabHidden, showReviewFab, useReviewMode } from '../lib/review'

const roleLabel = (r: string) => roleName(r)

/** ชื่อแพ็กเกจที่มีผลจริงตอนนี้ (รวมช่วงทดลองใช้) */
function planLabel(org: ReturnType<typeof useAuth>['org'], pro: boolean): string {
  if (onTrial(org)) return `ทดลองใช้ ${org?.trial_plan === 'pro' ? 'Pro' : 'Basic'}`
  if (org?.plan === 'enterprise') return 'Enterprise'
  if (pro) return 'Pro'
  if (org?.plan === 'starter') return 'Basic'
  return 'Free'
}

const thDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : null

export default function ProfilePage() {
  const { session, profile, org, orgs, signOut, refreshProfile } = useAuth()
  const access = usePlanAccess()
  // ที่นั่งทีมทั้งหมด (แพ็กเกจ + ที่ซื้อเพิ่มที่ยังไม่หมดอายุ) · null = ไม่จำกัด
  const seats = seatLimit(org)
  const extraSeats = activeExtraSeats(org)

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
  // เกณฑ์ชวนเพื่อน (super admin ตั้งได้) + อีกกี่คนถึงได้รางวัลรอบถัดไป
  const [refSet, setRefSet] = useState(DEFAULT_REFERRAL)
  useEffect(() => {
    void fetchReferralSetting().then(setRefSet)
  }, [])
  const toNext = refStat ? refSet.need - (refStat.referred_count % refSet.need) : refSet.need

  // ── ปุ่มรีวิวที่ถูกซ่อนชั่วคราว — เรียกกลับได้จากที่นี่ (โชว์เฉพาะตอนโหมดรีวิวเปิด) ──
  const reviewOn = useReviewMode()
  const [fabHidden, setFabHidden] = useState(reviewFabHidden())

  // ── แจ้งเตือนสัญญาเช่าใกล้หมด (ต่อองค์กร) — แอดมินองค์กรตั้งเอง · เว้นว่าง = ใช้ค่ามาตรฐานระบบ ──
  const perm = rolePerm(profile?.is_super ? 'owner' : profile?.role)
  const isOrgAdmin = perm.canManageOrg || Boolean(profile?.is_super && profile?.impersonate_org_id)

  // ── สิทธิ์ของฉันตอนนี้ ──
  // "เห็นทรัพย์ทั้งองค์กร หรือเฉพาะที่ตัวเองลง" เก็บใน memberships (RLS ให้อ่านแถวของตัวเองได้)
  const [seeAll, setSeeAll] = useState<boolean | null>(null)
  useEffect(() => {
    if (!profile?.id || !org?.id) return
    void supabase
      .from('memberships')
      .select('see_all_properties')
      .eq('user_id', profile.id)
      .eq('org_id', org.id)
      .maybeSingle()
      .then(({ data }) => setSeeAll((data as { see_all_properties: boolean } | null)?.see_all_properties ?? null))
  }, [profile?.id, org?.id])
  const [alertDays, setAlertDays] = useState((org?.contract_alert_days ?? []).join(', '))
  const [alertDefault, setAlertDefault] = useState(DEFAULT_CONTRACT_ALERT.days.join(', '))
  const [alertSaving, setAlertSaving] = useState(false)
  const [alertMsg, setAlertMsg] = useState<string | null>(null)
  useEffect(() => {
    setAlertDays((org?.contract_alert_days ?? []).join(', '))
  }, [org?.id, org?.contract_alert_days])
  useEffect(() => {
    void fetchContractAlertSetting().then((c) => setAlertDefault(c.days.join(', ')))
  }, [])

  async function saveContractAlert() {
    setAlertMsg(null)
    const parts = alertDays.split(/[,\s]+/).filter(Boolean).map(Number)
    if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 365) || parts.length > 5) {
      setAlertMsg('กรอกจำนวนวันเป็นเลข 0–365 คั่นด้วยจุลภาค (สูงสุด 5 เกณฑ์) เช่น "90, 60, 30"')
      return
    }
    setAlertSaving(true)
    // ช่องว่าง = ส่ง null → กลับไปใช้ค่ามาตรฐานระบบ
    const { error } = await supabase.rpc('set_contract_alert_days', {
      p_days: parts.length > 0 ? parts : null,
    })
    setAlertSaving(false)
    if (error) {
      setAlertMsg(error.message.includes('set_contract_alert_days')
        ? 'ยังไม่ได้ติดตั้งฟีเจอร์นี้ — รัน supabase/contract-alert-per-org.sql ก่อน'
        : `บันทึกไม่สำเร็จ: ${error.message}`)
      return
    }
    await refreshProfile()
    setAlertMsg('บันทึกแล้ว ✓ มีผลรอบแจ้งเตือน 07:00 ถัดไป')
  }

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

        {/* ── สิทธิ์ของฉันตอนนี้ — สรุปให้ครบว่าตอนนี้ทำอะไรได้/ไม่ได้ เพราะสิทธิ์มาจาก 3 แกน:
               บทบาท (super/แอดมิน/ลูกทีม) × องค์กรที่ใช้งานอยู่ × แพ็กเกจขององค์กรนั้น ── */}
        <section className="form-card">
          <h3>สิทธิ์ของฉันตอนนี้</h3>
          {(() => {
            const isSuper = Boolean(profile?.is_super)
            const impersonating = isSuper && Boolean(profile?.impersonate_org_id)
            const superOverview = isSuper && !impersonating
            const expiry = onTrial(org)
              ? thDate(org?.trial_expires_at)
              : access.pro ? thDate(org?.sub_expires_at) : null
            // ฟีเจอร์ที่ปลดล็อกด้วย "แพ็กเกจ" (ทุกคนในองค์กรได้เท่ากัน)
            const byPlan: [string, boolean][] = [
              ['สรุปภาพรวม', access.dashboard],
              ['แผนเยี่ยมชม', access.visitPlans],
              ['นัดติดตาม', access.followUps],
              ['ผู้ช่วย AI + กรอกด้วยเสียง', access.ai],
              ['นำเข้า Excel/CSV', access.importCsv],
            ]
            // สิทธิ์ที่มาจาก "บทบาท" ในองค์กรนี้ (ไม่เกี่ยวกับแพ็กเกจ)
            // สิทธิ์ตามบทบาท 8 ระดับ — ตรงกับ ROLE_PERM (src/lib/roles.ts) และฟังก์ชันใน supabase/roles.sql
            const byRole: [string, boolean][] = [
              ['เพิ่มทรัพย์ใหม่', !perm.readOnly],
              ['แก้ไขทรัพย์ของคนอื่น', perm.editOthers],
              ['ลบทรัพย์ของคนอื่น', perm.deleteOthers],
              ['ลบทรัพย์ที่ Owner ลงไว้', perm.deleteOwnerData],
              ['เห็นข้อมูลติดต่อเจ้าของทรัพย์ของคนอื่น', !perm.maskContact],
              ['เห็นพิกัด/ลิงก์แผนที่ของคนอื่น', perm.maskLocation === false],
              ['นำข้อมูลออก Excel/CSV', perm.canExport],
              ['จัดการทีม/บทบาท/แพ็กเกจ', isOrgAdmin || superOverview],
              ['ดูประวัติการใช้งาน', perm.canSeeLogs || superOverview],
              ['ดูแลทุกองค์กร (Super Admin)', isSuper],
            ]
            const Chips = ({ items }: { items: [string, boolean][] }) => (
              <div className="perm-chips">
                {items.map(([label, on]) => (
                  <span key={label} className={`perm-chip ${on ? 'on' : 'off'}`}>{on ? '✅' : '🔒'} {label}</span>
                ))}
              </div>
            )
            return (
              <>
                <ul className="perm-list">
                  <li>
                    <span>ระดับบัญชี</span>
                    <b>
                      {isSuper ? 'Super admin' : ROLE_INFO[(profile?.role ?? '') as Role]?.name ?? profile?.role ?? '—'}
                      {superOverview && ' · โหมดภาพรวม (เห็นข้อมูลทุกองค์กร)'}
                    </b>
                  </li>
                  <li>
                    <span>องค์กรที่ใช้งานอยู่</span>
                    <b>
                      {org?.name ?? (superOverview ? 'ทุกองค์กร' : '—')}
                      {impersonating && ' · กำลังสวมสิทธิ์'}
                      {orgs.length > 1 && ` (เป็นสมาชิก ${orgs.length} องค์กร สลับได้ที่มุมขวาบน)`}
                    </b>
                  </li>
                  <li>
                    <span>แพ็กเกจที่มีผล</span>
                    <b>{planLabel(org, access.pro)}{expiry ? ` · ใช้ได้ถึง ${expiry}` : ''}</b>
                  </li>
                  <li>
                    <span>เห็นทรัพย์ในองค์กรนี้</span>
                    <b>
                      {superOverview ? 'ทุกองค์กร'
                        : seeAll === false || !perm.seeOthers ? 'เฉพาะที่ตัวเองลง'
                          : perm.areaScoped ? 'เฉพาะเขตที่ถูกกำหนดให้' : 'ทั้งองค์กร'}
                    </b>
                  </li>
                  <li>
                    <span>หน้าที่ในทีม</span>
                    <b>{ROLE_INFO[(profile?.role ?? '') as Role]?.desc ?? '—'}</b>
                  </li>
                  <li>
                    <span>โควตาทรัพย์</span>
                    <b>{access.maxProperties === null ? 'ไม่จำกัด' : `${access.maxProperties.toLocaleString('th-TH')} รายการ`}</b>
                  </li>
                  <li>
                    <span>ที่นั่งทีม (รวมตัวเอง)</span>
                    <b>
                      {seats === null ? 'ไม่จำกัด' : `${seats} ที่นั่ง`}
                      {extraSeats > 0 && ` (แพ็กเกจ ${access.maxSeats} + ซื้อเพิ่ม ${extraSeats})`}
                    </b>
                  </li>
                </ul>

                <p className="plan-line" style={{ marginTop: 12, marginBottom: 6 }}><b>ฟีเจอร์ตามแพ็กเกจ</b></p>
                <Chips items={byPlan} />
                <p className="plan-line" style={{ marginTop: 12, marginBottom: 6 }}><b>สิทธิ์ตามบทบาท</b></p>
                <Chips items={byRole} />
                <p className="plan-line" style={{ marginTop: 10 }}>
                  🔒 = ยังใช้ไม่ได้ — ตามแพ็กเกจให้แอดมินองค์กรอัปเกรด · ตามบทบาทให้แอดมินองค์กรตั้งสิทธิ์ให้ในหน้า "ทีม"
                  {orgs.length > 1 && ' · สิทธิ์อาจต่างกันในแต่ละองค์กร สลับองค์กรแล้วดูหน้านี้ซ้ำได้'}
                </p>
              </>
            )
          })()}
        </section>

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
            แพ็กเกจองค์กรปัจจุบัน:{' '}
            <span className="role-badge">
              {onTrial(org) ? `ทดลองใช้ ${org?.trial_plan === 'pro' ? 'Pro' : 'Basic'}` : access.pro ? 'Pro' : org?.plan === 'starter' ? 'Basic' : 'Free'}
            </span>
            {onTrial(org)
              ? ` · ใช้ได้ถึง ${new Date(org!.trial_expires_at!).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}`
              : access.pro && org?.sub_expires_at
                ? ` · ใช้ได้ถึง ${new Date(org.sub_expires_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}`
                : ''}
          </p>
        </section>

        {/* ── แจ้งเตือนสัญญาเช่าใกล้หมด (เฉพาะแอดมินองค์กร) ── */}
        {isOrgAdmin && org && (
          <section className="form-card">
            <h3>แจ้งเตือนสัญญาเช่าใกล้หมด ⏰</h3>
            <p style={{ margin: '0 0 12px', fontSize: 13, opacity: 0.75, lineHeight: 1.5 }}>
              ทรัพย์ที่กรอก "วันสิ้นสุดสัญญาเช่า" ไว้ ระบบส่งแจ้งเตือนถึงมือถือทีม (07:00)
              เมื่อสัญญาเหลือวันตามเกณฑ์พอดี — ตั้งเฉพาะขององค์กรคุณได้ที่นี่
              {!access.pro && <b> · ใช้ได้เมื่อองค์กรเป็นแพ็กเกจ Pro</b>}
            </p>
            <div className="org-row">
              <div className="form-field" style={{ flex: 1, marginBottom: 0 }}>
                <label>แจ้งล่วงหน้า (วัน, คั่นด้วยจุลภาค)</label>
                <input
                  type="text"
                  value={alertDays}
                  placeholder={`เว้นว่าง = ค่ามาตรฐาน (${alertDefault} วัน)`}
                  onChange={(e) => { setAlertDays(e.target.value); setAlertMsg(null) }}
                />
              </div>
              <button className="btn" type="button" disabled={alertSaving} onClick={() => void saveContractAlert()}>
                {alertSaving ? 'กำลังบันทึก…' : 'บันทึก'}
              </button>
            </div>
            <p className="plan-line" style={{ marginTop: 8 }}>
              ตอนนี้:{' '}
              {(org.contract_alert_days?.length ?? 0) > 0
                ? `แจ้งเมื่อเหลือ ${org.contract_alert_days!.join(', ')} วัน (ตั้งเอง)`
                : `ใช้ค่ามาตรฐานระบบ — แจ้งเมื่อเหลือ ${alertDefault} วัน`}
            </p>
            {alertMsg && <p className="plan-line" style={{ marginTop: 6 }}>{alertMsg}</p>}
          </section>
        )}

        {/* ── ชวนเพื่อน ── */}
        {refStat && (
          <section className="form-card">
            <h3>ชวนเพื่อน รับ Pro ฟรี 🎁</h3>
            <p style={{ margin: '0 0 12px', fontSize: 13, opacity: 0.75 }}>
              ชวนเพื่อนสมัคร HOP แล้วสร้างองค์กรของตัวเอง ครบทุก <b>{refSet.need} คน</b> องค์กรคุณได้ <b>Pro เพิ่ม {refSet.days} วัน</b> (สะสมได้)
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
              ชวนสำเร็จแล้ว <b>{refStat.referred_count}</b> คน · อีก <b>{toNext}</b> คนได้ Pro +{refSet.days} วัน
              {refStat.rewards_granted > 0 && (
                <> · ได้รางวัลไปแล้ว {refStat.rewards_granted} ครั้ง</>
              )}
            </p>
          </section>
        )}

        {/* ── เรียกปุ่มรีวิวที่ซ่อนไว้กลับมา (เฉพาะตอนโหมดรีวิวเปิด) ── */}
        {reviewOn && fabHidden && (
          <section className="form-card">
            <h3>ปุ่มรีวิว 📝</h3>
            <p style={{ margin: '0 0 12px', fontSize: 13, opacity: 0.75 }}>
              คุณซ่อนปุ่มรีวิวไว้ชั่วคราว (จะกลับมาเองใน 1 ชั่วโมง) — กดปุ่มนี้ถ้าอยากให้กลับมาเลย
            </p>
            <button
              className="btn"
              type="button"
              onClick={() => { showReviewFab(); setFabHidden(false) }}
            >
              แสดงปุ่มรีวิวตอนนี้
            </button>
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
