import { Fragment, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ROLES, ROLE_INFO, roleName, rolePerm, type Role } from '../lib/roles'
import Combo from '../components/Combo'
import { loadThaiLocations, type ThaiLocations } from '../lib/thaiLocations'
import { useAuth } from '../lib/auth'
import { API_BASE } from '../lib/native'
import {
  fetchReferralSetting, DEFAULT_REFERRAL, onTrial,
  activeExtraSeats, baseSeats, effectivePlan, seatLimit, seatShortfall,
} from '../lib/plan'
import { DEFAULT_SEAT_SETTING, fetchSeatSetting, type SeatSetting } from '../lib/payments'

// สมาชิก = membership (ใครอยู่ org นี้) + ข้อมูลโปรไฟล์ (ชื่อ/อีเมล) · id = user_id
type MemberRow = {
  id: string
  full_name: string | null
  email: string
  role: Role
  active: boolean
  see_all_properties: boolean
}

export default function TeamPage() {
  const { profile: me, org, refreshProfile } = useAuth()
  const [members, setMembers] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [orgName, setOrgName] = useState(org?.name ?? '')
  const [savingOrg, setSavingOrg] = useState(false)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('manager')
  const [inviting, setInviting] = useState(false)
  const [inviteErr, setInviteErr] = useState<string | null>(null)
  const [lastInvite, setLastInvite] = useState<{ email: string; link: string; emailed: boolean; reason?: string } | null>(null)
  const [invites, setInvites] = useState<{ id: string; email: string; token: string; created_at: string }[]>([])
  const [copiedTok, setCopiedTok] = useState<string | null>(null)
  // สถานะชวนเพื่อน (referral) — โหลดจาก RPC referral_status
  const [refStat, setRefStat] = useState<
    {
      code: string; referred_count: number; rewards_granted: number; expires_at: string | null
      /** เพื่อนที่ "จ่ายเงินแล้ว" — เกณฑ์รางวัลนับจากยอดนี้ (RPC เก่าไม่มี → undefined) */
      paid_count?: number
      /** วันรางวัลที่ได้ไปแล้วรวม + เพดาน (RPC เวอร์ชันก่อน referral-cap.sql ไม่มี → undefined) */
      reward_days?: number; max_reward_days?: number
    } | null
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
    // ใครอยู่ org นี้ = memberships (multi-org) · ดึงชื่อ/อีเมลจาก profiles มา merge
    const { data: ms, error } = await supabase
      .from('memberships')
      .select('user_id, role, active, see_all_properties, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    const rows = (ms ?? []) as {
      user_id: string; role: Role; active: boolean; see_all_properties: boolean
    }[]
    const prof = new Map<string, { full_name: string | null; email: string }>()
    if (rows.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', rows.map((r) => r.user_id))
      for (const p of (profs ?? []) as { id: string; full_name: string | null; email: string }[]) {
        prof.set(p.id, { full_name: p.full_name, email: p.email })
      }
    }
    setMembers(rows.map((r) => ({
      id: r.user_id,
      full_name: prof.get(r.user_id)?.full_name ?? null,
      email: prof.get(r.user_id)?.email ?? '—',
      role: r.role,
      active: r.active,
      see_all_properties: r.see_all_properties,
    })))
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
        paid_count?: number; reward_days?: number; max_reward_days?: number
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
  // เกณฑ์ชวนเพื่อน (super admin ตั้งได้) + อีกกี่คนถึงได้รางวัลรอบถัดไป
  const [refSet, setRefSet] = useState(DEFAULT_REFERRAL)
  useEffect(() => {
    void fetchReferralSetting().then(setRefSet)
  }, [])
  // เกณฑ์รางวัลนับจากเพื่อนที่ "จ่ายเงินแล้ว" (RPC เก่าไม่ส่ง paid_count → ถอยไปใช้ยอดสมัคร)
  const paidCount = refStat?.paid_count ?? refStat?.referred_count ?? 0
  const toNext = refSet.need - (paidCount % refSet.need)
  // เพดานรางวัล: ได้ไปแล้วกี่วันจากเพดานเท่าไร (RPC เก่าไม่ส่งมา → ไม่โชว์)
  const rewardMax = refStat?.max_reward_days ?? refSet.maxDays
  const rewardUsed = refStat?.reward_days
  const rewardLeft = rewardUsed === undefined ? null : Math.max(0, rewardMax - rewardUsed)

  // ── ที่นั่งทีม: 1 ที่นั่ง = 1 บัญชี (นับแอดมินด้วย) + คำเชิญที่ยังไม่ตอบ ──
  // ฐานข้อมูลเป็นตัวบังคับจริง (org_seat_limit) — ที่นี่อ่านมาโชว์ ถ้า RPC ยังไม่มีก็คำนวณในเครื่อง
  const [seat, setSeat] = useState<{
    used: number; limit: number | null; base: number | null; extra: number; extraExpires: string | null
    /** ยังอยู่ในช่วงทดลองใช้ = ไม่จำกัดที่นั่ง (หมดแล้วโควตากลับมาเป็นของแพ็กเกจที่จ่ายจริง) */
    onTrial: boolean; trialExpires: string | null
  } | null>(null)
  // ราคาที่นั่ง + โควตาต่อแพ็กเกจ (super admin ตั้งได้) — ใช้บอกยอดที่ต้องจ่ายเมื่อเกินโควตา
  const [seatCfg, setSeatCfg] = useState<SeatSetting>(DEFAULT_SEAT_SETTING)
  useEffect(() => { void fetchSeatSetting().then(setSeatCfg) }, [])
  const activeMembers = members.filter((m) => m.active).length
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase.rpc('my_seat_usage')
      const row = ((data ?? []) as {
        used: number; seat_limit: number | null; base: number | null; extra: number; extra_expires: string | null
        on_trial?: boolean; trial_expires?: string | null
      }[])[0]
      if (cancelled) return
      if (!error && row) {
        setSeat({
          used: Number(row.used), limit: row.seat_limit === null ? null : Number(row.seat_limit),
          base: row.base === null ? null : Number(row.base),
          extra: Number(row.extra ?? 0), extraExpires: row.extra_expires ?? null,
          // RPC เวอร์ชันก่อน seats-config.sql ไม่มีคอลัมน์นี้ → ถอยไปดูจากข้อมูล org
          onTrial: row.on_trial ?? onTrial(org), trialExpires: row.trial_expires ?? org?.trial_expires_at ?? null,
        })
        return
      }
      // ยังไม่ได้รัน supabase/seats.sql → คำนวณจากข้อมูลที่มีในหน้า
      setSeat({
        // ต่ำสุด 1 เสมอ — คนที่เปิดหน้านี้ก็อยู่ในองค์กร (กันโชว์ 0 ตอนอ่านรายชื่อไม่สำเร็จ)
        used: Math.max(1, activeMembers + invites.length),
        limit: seatLimit(org, seatCfg.base),
        base: baseSeats(effectivePlan(org), org?.plan_tier, seatCfg.base),
        extra: activeExtraSeats(org),
        extraExpires: org?.extra_seats_expires_at ?? null,
        onTrial: onTrial(org), trialExpires: org?.trial_expires_at ?? null,
      })
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, activeMembers, invites.length, org?.plan, org?.plan_tier, org?.extra_seats, seatCfg])

  // ── เขตที่กำหนดให้ (Survey/Temporary) — 1 แถว = 1 ขอบเขต · ไม่ระบุอำเภอ = ทั้งจังหวัด ──
  type AreaRow = { id: string; user_id: string; province: string; district: string | null }
  const [areas, setAreas] = useState<AreaRow[]>([])
  const [areaFor, setAreaFor] = useState<string | null>(null)   // กำลังแก้เขตของใคร
  const [areaProv, setAreaProv] = useState<string | null>(null)
  const [areaDist, setAreaDist] = useState<string | null>(null)
  const [areaErr, setAreaErr] = useState<string | null>(null)
  const [thLoc, setThLoc] = useState<ThaiLocations | null>(null)
  useEffect(() => { void loadThaiLocations().then(setThLoc) }, [])
  useEffect(() => {
    if (!orgId) { setAreas([]); return }
    void supabase
      .from('member_areas')
      .select('id, user_id, province, district')
      .eq('org_id', orgId)
      .then(({ data }) => setAreas((data ?? []) as AreaRow[]))
  }, [orgId])

  const myAreas = (userId: string) => areas.filter((a) => a.user_id === userId)

  async function reloadAreas() {
    if (!orgId) return
    const { data } = await supabase
      .from('member_areas').select('id, user_id, province, district').eq('org_id', orgId)
    setAreas((data ?? []) as AreaRow[])
  }
  async function addArea(userId: string) {
    setAreaErr(null)
    if (!areaProv) { setAreaErr('เลือกจังหวัดก่อน'); return }
    const { error } = await supabase.from('member_areas').insert({
      org_id: orgId, user_id: userId, province: areaProv, district: areaDist || null,
    })
    if (error) {
      setAreaErr(error.message.includes('member_areas')
        ? 'ยังไม่ได้ติดตั้งฟีเจอร์นี้ — รัน supabase/roles.sql ก่อน'
        : error.message.includes('duplicate') ? 'เขตนี้ถูกกำหนดไว้แล้ว' : error.message)
      return
    }
    setAreaProv(null)
    setAreaDist(null)
    await reloadAreas()
  }
  async function removeArea(id: string) {
    const { error } = await supabase.from('member_areas').delete().eq('id', id)
    if (error) setAreaErr(error.message)
    else await reloadAreas()
  }

  const seatFull = seat !== null && seat.limit !== null && seat.used >= seat.limit
  const seatFree = seat !== null && seat.limit !== null && seat.limit <= 1 // Free = เจ้าของคนเดียว
  const seatLeft = seat && seat.limit !== null ? Math.max(0, seat.limit - seat.used) : null
  // เกินโควตา = เชิญทีมไว้ตอนทดลองใช้แล้วหมดช่วงทดลอง (หรือลดระดับแพ็กเกจ) — ต้องซื้อที่นั่งเพิ่มให้ครบ
  const seatOver = seat ? seatShortfall(seat.used, seat.limit) : 0
  const overCost = seatOver * seatCfg.monthly

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
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      })
      const out = await res.json().catch(() => ({}))
      setInviting(false)
      if (!res.ok) {
        setInviteErr(`สร้างคำเชิญไม่สำเร็จ: ${out.error || res.statusText}`)
        return
      }
      setLastInvite({ email: inviteEmail.trim(), link: out.link, emailed: Boolean(out.emailed), reason: out.reason })
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
    // แก้ที่ membership ของ org นี้ (role/active/see_all_properties เป็นราย org)
    const { error } = await supabase.from('memberships').update(patch).eq('user_id', p.id).eq('org_id', orgId)
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
              แพ็กเกจ:{' '}
              <span className="role-badge">
                {onTrial(org) ? `ทดลองใช้ ${org.trial_plan === 'pro' ? 'Pro' : 'เริ่มต้น'}` : org.plan}
              </span>
              {onTrial(org)
                ? ` · ใช้ได้ถึง ${new Date(org.trial_expires_at!).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })} (หมดแล้วต้องเลือกแพ็กเกจเพื่อใช้งานต่อ)`
                : org.sub_expires_at
                  ? ` · ใช้ได้ถึง ${new Date(org.sub_expires_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}`
                  : ' · ไม่มีวันหมดอายุ'}
            </p>
          )}
        </section>

        {refStat && (
          <section className="form-card">
            <h3>ชวนเพื่อน รับ Pro ฟรี 🎁</h3>
            <p style={{ margin: '0 0 12px', fontSize: 13, opacity: 0.75 }}>
              ชวนเพื่อนมาใช้ HOP — <b>เมื่อเพื่อนเลือกแพ็กเกจและชำระเงินครั้งแรก</b> นับเป็น 1 คน ·
              ครบทุก <b>{refSet.need} คน</b> องค์กรคุณได้ <b>Pro เพิ่ม {refSet.days} วัน</b> (สะสมได้ สูงสุด {rewardMax} วัน)
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
              สมัครจากลิงก์คุณ <b>{refStat.referred_count}</b> คน ·{' '}
              จ่ายเงินแล้ว <b>{paidCount}</b> คน · อีก <b>{toNext}</b> คน<b>ที่จ่ายเงิน</b>ได้ Pro +{refSet.days} วัน
              {refStat.rewards_granted > 0 && (
                <> · ได้รางวัลไปแล้ว {refStat.rewards_granted} ครั้ง
                  {rewardUsed !== undefined && <> ({rewardUsed} วัน)</>}
                </>
              )}
              {/* เพดานรวม — บอกตรงๆ ว่าเหลืออีกกี่วัน กันเข้าใจว่าชวนได้ฟรีตลอดชีพ */}
              {rewardLeft !== null && (
                rewardLeft === 0
                  ? <> · <b>ครบเพดานรางวัล {rewardMax} วันแล้ว</b> — ชวนต่อได้แต่ไม่ได้วันเพิ่ม</>
                  : <> · รับรางวัลได้อีกไม่เกิน <b>{rewardLeft} วัน</b> (เพดาน {rewardMax} วัน/องค์กร)</>
              )}
              {onTrial(org) && (
                <> · ยังทดลองใช้อยู่ — รางวัลจะต่อจากวันหมดทดลอง ไม่กินวันที่เหลือ</>
              )}
              {refStat.referred_count > paidCount && (
                <div style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 4 }}>
                  อีก {refStat.referred_count - paidCount} คนที่สมัครแล้วยังไม่ได้เลือกแพ็กเกจ — ชวนให้เขาเริ่มใช้จริงจะได้รางวัลเร็วขึ้น
                </div>
              )}
            </p>
          </section>
        )}

        {/* ── ที่นั่งทีม ── */}
        {seat && (
          <section className="form-card">
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>ที่นั่งทีม</h3>
              <div style={{ fontSize: 15, fontWeight: 700 }}>
                {seat.limit === null
                  ? <>{seat.used} คน · <span style={{ color: 'var(--muted)', fontWeight: 600 }}>
                      {seat.onTrial ? 'ไม่จำกัดที่นั่ง (ช่วงทดลองใช้)' : 'ไม่จำกัดที่นั่ง'}
                    </span></>
                  : <span style={{ color: seatFull ? 'var(--danger, #d93025)' : undefined }}>
                      ใช้ {seat.used} จาก {seat.limit} ที่นั่ง
                    </span>}
              </div>
            </div>
            {seat.limit !== null && (
              <div style={{ height: 8, borderRadius: 999, background: 'var(--line)', overflow: 'hidden', margin: '10px 0 8px' }}>
                <div style={{
                  height: '100%', borderRadius: 999,
                  width: `${Math.min(100, Math.round((seat.used / Math.max(1, seat.limit)) * 100))}%`,
                  background: seatFull ? 'var(--danger, #d93025)' : 'var(--purple)',
                }} />
              </div>
            )}
            <p className="plan-line" style={{ marginTop: 4 }}>
              นับ 1 ที่นั่งต่อ 1 บัญชี รวมแอดมินและคำเชิญที่ยังไม่ตอบรับ
              {invites.length > 0 && <> · ค้างเชิญ {invites.length} คน (กด "ยกเลิก" ที่คำเชิญเพื่อคืนที่นั่ง)</>}
            </p>
            <p className="plan-line" style={{ marginTop: 2 }}>
              {seat.onTrial
                ? <>⏳ ช่วงทดลองใช้ <b>เชิญทีมได้ไม่จำกัด</b>
                    {seat.trialExpires && <> ถึง {new Date(seat.trialExpires).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}</>}
                    {' '}· หลังจากนั้นเหลือ <b>{baseSeats(org?.trial_plan ?? 'pro', org?.plan_tier, seatCfg.base)} ที่นั่ง</b> ตามแพ็กเกจที่เลือกซื้อ ส่วนที่เกินต้องซื้อที่นั่งเพิ่ม</>
                : seat.base === null
                  ? 'แพ็กเกจ Enterprise — ไม่จำกัดจำนวนคน'
                  : <>แพ็กเกจให้ {seat.base} ที่นั่ง{seat.extra > 0 && <> + ซื้อเพิ่ม {seat.extra} ที่นั่ง{seat.extraExpires && <> (ถึง {new Date(seat.extraExpires).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })})</>}</>}</>}
            </p>
            {seatOver > 0 ? (
              /* เกินโควตา: มักเกิดหลังหมดช่วงทดลอง (ตอนทดลองเชิญได้ไม่จำกัด) — บอกยอดที่ต้องจ่ายตรงๆ */
              <div style={{
                background: 'var(--danger-subtle, #fdecea)', color: 'var(--danger, #d93025)', borderRadius: 10,
                padding: '8px 12px', fontSize: 13, margin: '10px 0 0', lineHeight: 1.5,
              }}>
                ⚠️ ทีมเกินโควตา <b>{seatOver} ที่นั่ง</b> — ซื้อที่นั่งเพิ่ม {seatOver} ที่นั่ง
                (฿{overCost.toLocaleString()}/เดือน) หรืออัปเกรดระดับแพ็กเกจ
                <div style={{ marginTop: 4, opacity: 0.85 }}>
                  ไม่มีใครถูกนำออกจากองค์กร แต่<b>เชิญคนใหม่ไม่ได้</b>จนกว่าที่นั่งจะพอ
                </div>
              </div>
            ) : seatFull && (
              <div style={{
                background: 'var(--purple-subtle)', color: 'var(--purple)', borderRadius: 10,
                padding: '8px 12px', fontSize: 13, margin: '10px 0 0', lineHeight: 1.5,
              }}>
                {seatFree
                  ? <>🔒 แพ็กเกจ Free ใช้ได้คนเดียว — อัปเกรดเป็น Basic/Pro เพื่อเพิ่มทีม หรือชวนเพื่อน {refSet.need} คน (การ์ดด้านบน) รับ Pro ฟรี</>
                  : <>ที่นั่งเต็มแล้ว — ซื้อที่นั่งเพิ่ม หรืออัปเกรดระดับแพ็กเกจ (ระดับสูงขึ้นแถมที่นั่งมากขึ้น)</>}
              </div>
            )}
            {seat.limit !== null && (
              <div className="org-row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
                <Link
                  className={`btn ${seatFull ? 'primary' : ''}`}
                  to={seatOver > 0 ? `/upgrade?seats=${seatOver}#seats` : '/upgrade#seats'}
                >
                  ซื้อที่นั่งเพิ่ม{seatOver > 0 && ` ${seatOver} ที่นั่ง`}
                </Link>
                <Link className="btn" to="/upgrade">อัปเกรดแพ็กเกจ</Link>
              </div>
            )}
          </section>
        )}

        <section className="form-card" data-tour="team-add">
          <h3>เชิญลูกทีม</h3>
          <p style={{ margin: '0 0 12px', fontSize: 13, opacity: 0.75, lineHeight: 1.5 }}>
            กรอกอีเมลลูกทีม → สร้างลิงก์เชิญ → ส่งลิงก์ให้เขา (LINE/อีเมล) · เปิดลิงก์แล้วสมัคร/ล็อกอิน<b>ด้วยอีเมลนั้น</b> จะเข้าองค์กรเป็นลูกทีมอัตโนมัติ (ตั้งรหัสผ่านเอง/ใช้ Google)
            {seatLeft !== null && !seatFull && <> · เชิญเพิ่มได้อีก <b>{seatLeft}</b> คน</>}
          </p>
          {seatFull && (
            <div style={{
              background: 'var(--purple-subtle)', color: 'var(--purple)', borderRadius: 10,
              padding: '8px 12px', fontSize: 13, marginBottom: 12, lineHeight: 1.5,
            }}>
              {seatFree
                ? <>🔒 แพ็กเกจ Free ไม่รองรับลูกทีม — อัปเกรดเป็น Basic/Pro เพื่อเพิ่มทีม</>
                : <>🔒 ที่นั่งเต็ม (ใช้ {seat?.used} จาก {seat?.limit}) — <Link to="/upgrade#seats">ซื้อที่นั่งเพิ่ม</Link> หรืออัปเกรดระดับแพ็กเกจ</>}
            </div>
          )}
          <p className="plan-line" style={{ marginTop: 0, marginBottom: 10 }}>
            <b>{ROLE_INFO[inviteRole].short}</b> — {ROLE_INFO[inviteRole].desc}
          </p>
          {inviteErr && <div className="auth-error">{inviteErr}</div>}
          <form onSubmit={(e) => void createInvite(e)}>
            <div className="org-row">
              <div className="form-field" style={{ flex: 1, marginBottom: 0 }}>
                <label>อีเมลลูกทีม <span className="req">*</span></label>
                <input type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
              </div>
              <div className="form-field" style={{ marginBottom: 0, minWidth: 150 }}>
                <label>บทบาท</label>
                <select
                  className="org-switch"
                  value={inviteRole}
                  title={ROLE_INFO[inviteRole].desc}
                  onChange={(e) => setInviteRole(e.target.value as Role)}
                >
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_INFO[r].short}</option>)}
                </select>
              </div>
              <button className="btn primary" type="submit" disabled={inviting || seatFull}>
                {inviting ? 'กำลังสร้าง…' : 'สร้างลิงก์เชิญ'}
              </button>
            </div>
          </form>

          {lastInvite && (
            <div className="auth-notice" style={{ marginTop: 12 }}>
              {lastInvite.emailed
                ? <>ส่งอีเมลเชิญไปที่ <b>{lastInvite.email}</b> แล้ว ✓ (หรือคัดลอกลิงก์ส่งเองได้)</>
                : <>ลิงก์เชิญสำหรับ <b>{lastInvite.email}</b> — คัดลอกส่งให้ได้เลย:</>}
              {!lastInvite.emailed && lastInvite.reason && (
                <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>
                  (ยังไม่ได้ส่งอีเมลอัตโนมัติ — {lastInvite.reason === 'no_email_config'
                    ? 'ยังไม่ได้ตั้งค่า SMTP/Resend หรือยังไม่ได้ Redeploy หลังใส่ env'
                    : lastInvite.reason})
                </div>
              )}
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
            บทบาทกำหนดว่าเห็นอะไร/ทำอะไรได้ (ชี้ที่ช่องบทบาทเพื่อดูคำอธิบาย) · ปุ่ม “เฉพาะของตัวเอง” จำกัดเพิ่มได้อีกชั้น
            · <b>Survey / Temporary ต้องกำหนด “เขต” ก่อน</b> ไม่งั้นยังไม่เห็นพิกัด/ทรัพย์ของใคร
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
                    <th>เขตที่กำหนด</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => {
                    const seeAll = m.see_all_properties ?? true
                    return (
                    <Fragment key={m.id}>
                    <tr>
                      <td data-label="ชื่อ" className="td-main">{m.full_name || '—'}{m.id === me?.id && <span className="role-badge" style={{ marginLeft: 6 }}>คุณ</span>}</td>
                      <td data-label="อีเมล">{m.email}</td>
                      <td data-label="บทบาท">
                        {m.id === me?.id ? (
                          // ตัวเองเปลี่ยนบทบาทตัวเองไม่ได้ (กันเผลอถอดสิทธิ์ Owner ทิ้ง)
                          <span className={`role-badge ${rolePerm(m.role).canManageOrg ? '' : 'plain'}`}>
                            {roleName(m.role)}
                          </span>
                        ) : (
                          <select
                            className="org-switch"
                            value={m.role}
                            title={ROLE_INFO[m.role]?.desc}
                            onChange={(e) => void setField(m, { role: e.target.value as Role })}
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>{ROLE_INFO[r].short}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td data-label="สถานะ">
                        <span className={`status-pill ${m.active ? 'on' : ''}`}>
                          {m.active ? 'ใช้งานได้' : 'รออนุมัติ/ปิด'}
                        </span>
                      </td>
                      <td data-label="การมองเห็นทรัพย์">
                        {!rolePerm(m.role).seeOthers ? (
                          <span className="status-pill">เฉพาะของตัวเอง (ตามบทบาท)</span>
                        ) : rolePerm(m.role).areaScoped ? (
                          <span className="status-pill on">เฉพาะเขตที่กำหนด</span>
                        ) : rolePerm(m.role).canManageOrg ? (
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
                      <td data-label="เขตที่กำหนด">
                        {/* เขตมีผลกับ Survey (เห็นพิกัดเฉพาะเขต) และ Temporary (เห็นทรัพย์เฉพาะเขต) */}
                        {rolePerm(m.role).areaScoped || rolePerm(m.role).maskLocation === 'area' ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            {myAreas(m.id).length === 0
                              ? <span className="status-pill">ยังไม่กำหนด (ยังไม่เห็นของใคร)</span>
                              : myAreas(m.id).map((a) => (
                                  <span key={a.id} className="chip chip-x">
                                    {a.province}{a.district ? ` · ${a.district}` : ' (ทั้งจังหวัด)'}
                                    <button
                                      type="button"
                                      className="chip-remove"
                                      title="ลบเขตนี้"
                                      onClick={() => void removeArea(a.id)}
                                    >×</button>
                                  </span>
                                ))}
                            <button
                              className="btn sm"
                              onClick={() => { setAreaFor(areaFor === m.id ? null : m.id); setAreaErr(null) }}
                            >
                              {areaFor === m.id ? 'ปิด' : '+ เพิ่มเขต'}
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--muted)' }}>—</span>
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
                          </>
                        )}
                      </td>
                    </tr>
                    {areaFor === m.id && (
                      <tr key={`${m.id}-area`}>
                        <td colSpan={7}>
                          <div className="org-row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                            <div className="form-field" style={{ marginBottom: 0, minWidth: 190 }}>
                              <label>จังหวัด</label>
                              <Combo
                                value={areaProv}
                                options={thLoc ? Object.keys(thLoc) : []}
                                placeholder="เลือกจังหวัด…"
                                onChange={(v) => { setAreaProv(v); setAreaDist(null) }}
                              />
                            </div>
                            <div className="form-field" style={{ marginBottom: 0, minWidth: 190 }}>
                              <label>เขต/อำเภอ (เว้นว่าง = ทั้งจังหวัด)</label>
                              <Combo
                                value={areaDist}
                                options={areaProv && thLoc?.[areaProv] ? Object.keys(thLoc[areaProv]) : []}
                                placeholder={areaProv ? 'ทั้งจังหวัด' : 'เลือกจังหวัดก่อน'}
                                onChange={setAreaDist}
                              />
                            </div>
                            <button className="btn primary" onClick={() => void addArea(m.id)}>เพิ่มเขต</button>
                          </div>
                          {areaErr && <div className="auth-error" style={{ marginTop: 8 }}>{areaErr}</div>}
                        </td>
                      </tr>
                    )}
                    </Fragment>
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
