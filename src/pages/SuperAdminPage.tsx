import { Fragment, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { formatDate } from '../labels'
import { listReviews, setReviewMode, useReviewMode, type ReviewRow } from '../lib/review'
import { fetchTrialSetting, fetchReferralSetting, fetchContractAlertSetting, fetchContactSetting, type ContactSetting, type TrialSetting } from '../lib/plan'
import { fetchPaymentTestEnabled } from '../lib/payments'

// จัดกลุ่มรีวิวของผู้รีวิวคนหนึ่งตาม "หัวข้อ" (flow) — คงลำดับที่พบครั้งแรก
function groupByFlow(rows: ReviewRow[]): [string, ReviewRow[]][] {
  const m = new Map<string, ReviewRow[]>()
  for (const r of rows) {
    const f = r.flow || 'อื่น ๆ'
    const arr = m.get(f)
    if (arr) arr.push(r)
    else m.set(f, [r])
  }
  return [...m.entries()]
}

interface OrgOverview {
  id: string
  name: string
  plan: string
  sub_status: string
  sub_expires_at: string | null
  trial_plan?: string | null       // ต้องรัน supabase/super-overview-trial.sql ถึงจะมีค่า
  trial_expires_at?: string | null
  created_at: string
  member_count: number
  property_count: number
}

// องค์กรกำลังอยู่ในช่วงทดลองใช้ (ยังไม่ได้จ่ายจริง)
function onTrialRow(o: OrgOverview): boolean {
  return (
    o.plan === 'free' &&
    Boolean(o.trial_plan) &&
    Boolean(o.trial_expires_at && o.trial_expires_at >= new Date().toISOString().slice(0, 10))
  )
}

const PLANS = ['free', 'starter', 'pro', 'enterprise']

// ตั้งราคาแพ็กเกจ (ตาราง plan_prices: plan × ระดับโควตาทรัพย์) — กรอก ฿/เดือน + ส่วนลดรายปี (%)
// เก็บเป็น string ตามช่องกรอก แปลงเลขตอนบันทึก (DB เก็บ monthly + yearly ที่คำนวณแล้ว)
const PRICE_TIERS = [100, 250, 500] as const
type PriceTier = (typeof PRICE_TIERS)[number]
type PriceEdit = Record<'starter' | 'pro', Record<PriceTier, { monthly: string; discount: string }>>

// ฿/ปี จาก (฿/เดือน, ส่วนลด %) — คืน null ถ้ากรอกไม่ครบ/ไม่ถูกต้อง
function yearlyOf(monthly: string, discount: string): number | null {
  const m = Number(monthly)
  const d = Number(discount)
  if (!(m > 0) || Number.isNaN(d) || d < 0 || d >= 100) return null
  return Math.round(m * 12 * (1 - d / 100))
}

export default function SuperAdminPage() {
  const [orgs, setOrgs] = useState<OrgOverview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // ค่าที่แก้ค้างไว้ต่อองค์กร (ยังไม่บันทึก)
  const [edits, setEdits] = useState<Record<string, { plan: string; sub_expires_at: string }>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [enteringId, setEnteringId] = useState<string | null>(null)
  const [fOrg, setFOrg] = useState<string | null>(null)
  const { profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const reviewOn = useReviewMode()
  const [reviews, setReviews] = useState<ReviewRow[]>([])
  const [reviewBusy, setReviewBusy] = useState(false)
  const [openReviewer, setOpenReviewer] = useState<string | null>(null)
  const [priceEdit, setPriceEdit] = useState<PriceEdit | null>(null) // null = ยังโหลดไม่เสร็จ/โหลดไม่ได้
  const [priceError, setPriceError] = useState<string | null>(null)
  const [priceSaving, setPriceSaving] = useState(false)

  async function loadPrices() {
    const { data, error } = await supabase.from('plan_prices').select('plan,tier,monthly,yearly')
    if (error) {
      setPriceError(
        error.message.includes('tier')
          ? 'ตารางราคายังเป็นโครงเก่า — รัน supabase/plan-tiers.sql ใน SQL Editor ก่อน'
          : error.message.includes('plan_prices')
            ? 'ยังไม่ได้สร้างตารางราคา — รัน supabase/plan-prices.sql + plan-tiers.sql ใน SQL Editor ก่อน'
            : error.message,
      )
      return
    }
    const blank = () => ({ monthly: '', discount: '' })
    const next: PriceEdit = {
      starter: { 100: blank(), 250: blank(), 500: blank() },
      pro: { 100: blank(), 250: blank(), 500: blank() },
    }
    for (const r of data ?? []) {
      const key = r.plan as 'starter' | 'pro'
      const tier = Number(r.tier ?? 500) as PriceTier
      if (!next[key]?.[tier]) continue
      // แปลง yearly ใน DB กลับเป็น % ส่วนลด สำหรับช่องกรอก
      const pct = Number(r.monthly) > 0 ? Math.round((1 - Number(r.yearly) / (Number(r.monthly) * 12)) * 100) : 0
      next[key][tier] = { monthly: String(r.monthly), discount: String(Math.max(0, pct)) }
    }
    setPriceError(null)
    setPriceEdit(next)
  }
  useEffect(() => {
    void loadPrices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ตั้งค่าทดลองใช้ฟรี (app_settings key 'trial') — มีผลกับ "องค์กรที่สมัครใหม่" เท่านั้น
  const [trial, setTrial] = useState<{ days: string; plan: TrialSetting['plan'] } | null>(null)
  const [trialSaving, setTrialSaving] = useState(false)
  useEffect(() => {
    void fetchTrialSetting().then((t) => setTrial({ days: String(t.days), plan: t.plan }))
  }, [])

  async function saveTrial() {
    if (!trial) return
    const days = Number(trial.days)
    if (!Number.isInteger(days) || days < 0 || days > 365) {
      alert('กรุณากรอกจำนวนวันเป็นเลขจำนวนเต็ม 0–365 (0 = ปิดช่วงทดลอง)')
      return
    }
    setTrialSaving(true)
    const { error } = await supabase.from('app_settings').upsert({
      key: 'trial',
      value: { days, plan: trial.plan },
      updated_at: new Date().toISOString(),
    })
    setTrialSaving(false)
    if (error) {
      alert(
        error.message.includes('app_settings')
          ? 'ยังไม่ได้ติดตั้งระบบทดลองใช้ — รัน supabase/trial.sql ใน SQL Editor ก่อน'
          : `บันทึกไม่สำเร็จ: ${error.message}`,
      )
    }
  }

  // สวิตช์แพ็กเกจทดสอบ ฿1 (app_settings key 'payment_test') — ปิดก่อนเปิดตัวจริง
  const [payTest, setPayTest] = useState<boolean | null>(null) // null = ยังโหลดไม่เสร็จ
  const [payTestBusy, setPayTestBusy] = useState(false)
  useEffect(() => {
    void fetchPaymentTestEnabled().then(setPayTest)
  }, [])

  async function togglePayTest() {
    if (payTest === null) return
    const next = !payTest
    setPayTestBusy(true)
    const { error } = await supabase.from('app_settings').upsert({
      key: 'payment_test',
      value: { enabled: next },
      updated_at: new Date().toISOString(),
    })
    setPayTestBusy(false)
    if (error) {
      alert(
        error.message.includes('app_settings')
          ? 'ยังไม่ได้ติดตั้งตารางตั้งค่า — รัน supabase/app-settings-jsonb-fix.sql และ payment-test-toggle.sql ก่อน'
          : `สลับไม่สำเร็จ: ${error.message}`,
      )
      return
    }
    setPayTest(next)
  }

  // เกณฑ์ชวนเพื่อน (app_settings key 'referral') — ครบ N คน ได้ Pro D วัน
  const [referral, setReferral] = useState<{ need: string; days: string } | null>(null)
  const [referralSaving, setReferralSaving] = useState(false)
  useEffect(() => {
    void fetchReferralSetting().then((r) => setReferral({ need: String(r.need), days: String(r.days) }))
  }, [])

  async function saveReferral() {
    if (!referral) return
    const need = Number(referral.need)
    const days = Number(referral.days)
    if (!Number.isInteger(need) || need < 1 || need > 100 || !Number.isInteger(days) || days < 1 || days > 365) {
      alert('กรุณากรอกจำนวนคน 1–100 และจำนวนวัน 1–365 เป็นเลขจำนวนเต็ม')
      return
    }
    setReferralSaving(true)
    const { error } = await supabase.from('app_settings').upsert({
      key: 'referral',
      value: { need, days },
      updated_at: new Date().toISOString(),
    })
    setReferralSaving(false)
    if (error) {
      alert(
        error.message.includes('app_settings')
          ? 'ยังไม่ได้ติดตั้งตารางตั้งค่า — รัน supabase/referral-setting.sql ใน SQL Editor ก่อน'
          : `บันทึกไม่สำเร็จ: ${error.message}`,
      )
    }
  }

  // เกณฑ์แจ้งเตือนสัญญาเช่าใกล้หมด (app_settings key 'contract_alert') — กรอกเป็นวัน คั่นด้วยจุลภาค
  const [alertDays, setAlertDays] = useState<string | null>(null) // null = ยังโหลดไม่เสร็จ
  const [alertSaving, setAlertSaving] = useState(false)
  useEffect(() => {
    void fetchContractAlertSetting().then((c) => setAlertDays(c.days.join(', ')))
  }, [])

  async function saveContractAlert() {
    if (alertDays === null) return
    const days = alertDays
      .split(/[,\s]+/)
      .filter(Boolean)
      .map(Number)
    if (days.length === 0 || days.some((n) => !Number.isInteger(n) || n < 0 || n > 365)) {
      alert('กรอกจำนวนวันล่วงหน้าเป็นเลขจำนวนเต็ม 0–365 คั่นด้วยจุลภาค เช่น "60, 30" (0 = แจ้งวันหมดพอดี)')
      return
    }
    const uniq = [...new Set(days)].sort((a, b) => b - a)
    setAlertSaving(true)
    const { error } = await supabase.from('app_settings').upsert({
      key: 'contract_alert',
      value: { days: uniq },
      updated_at: new Date().toISOString(),
    })
    setAlertSaving(false)
    if (error) {
      alert(
        error.message.includes('app_settings')
          ? 'ยังไม่ได้ติดตั้งตารางตั้งค่า — รัน supabase/app-settings-jsonb-fix.sql ก่อน'
          : `บันทึกไม่สำเร็จ: ${error.message}`,
      )
      return
    }
    setAlertDays(uniq.join(', '))
  }

  // ช่องทางติดต่อ/LINE OA (app_settings key 'contact') — โชว์บน landing + ปุ่ม "คุยกับเซลล์"
  const [contact, setContact] = useState<ContactSetting | null>(null)
  const [contactSaving, setContactSaving] = useState(false)
  useEffect(() => {
    void fetchContactSetting().then(setContact)
  }, [])

  async function saveContact() {
    if (!contact) return
    const lineId = contact.lineId.trim()
    if (!lineId) {
      alert('กรอก LINE ID ก่อน (เช่น @hopplatform)')
      return
    }
    // ไม่กรอกลิงก์ = สร้างจาก LINE ID ให้อัตโนมัติ
    const lineUrl = contact.lineUrl.trim() || `https://line.me/R/ti/p/${encodeURIComponent(lineId)}`
    setContactSaving(true)
    const { error } = await supabase.from('app_settings').upsert({
      key: 'contact',
      value: { lineId, lineUrl, phone: contact.phone.trim(), email: contact.email.trim() },
      updated_at: new Date().toISOString(),
    })
    setContactSaving(false)
    if (error) {
      alert(
        error.message.includes('app_settings')
          ? 'ยังไม่ได้ติดตั้งตารางตั้งค่า — รัน supabase/app-settings-jsonb-fix.sql ก่อน'
          : `บันทึกไม่สำเร็จ: ${error.message}`,
      )
      return
    }
    setContact({ ...contact, lineId, lineUrl })
    alert('บันทึกแล้ว ✓ มีผลทันทีบนหน้า landing')
  }

  async function savePrices() {
    if (!priceEdit) return
    const rows = (['starter', 'pro'] as const).flatMap((plan) =>
      PRICE_TIERS.map((tier) => ({
        plan,
        tier,
        monthly: Number(priceEdit[plan][tier].monthly),
        yearly: yearlyOf(priceEdit[plan][tier].monthly, priceEdit[plan][tier].discount) ?? 0,
        updated_at: new Date().toISOString(),
      })),
    )
    if (rows.some((r) => !(r.monthly > 0) || !(r.yearly > 0))) {
      alert('กรุณากรอกราคา ฿/เดือน มากกว่า 0 และส่วนลด 0–99% ให้ครบทุกช่อง (6 แถว)')
      return
    }
    setPriceSaving(true)
    const { error } = await supabase.from('plan_prices').upsert(rows)
    setPriceSaving(false)
    if (error) alert(`บันทึกราคาไม่สำเร็จ: ${error.message}`)
    else await loadPrices()
  }

  useEffect(() => {
    void listReviews().then(setReviews)
  }, [])

  async function toggleReview() {
    setReviewBusy(true)
    const err = await setReviewMode(!reviewOn)
    setReviewBusy(false)
    if (err) alert(`สลับโหมดรีวิวไม่สำเร็จ: ${err} — รัน supabase/review.sql ก่อนถ้ายังไม่ได้รัน`)
  }

  // แผนที่ org_id → ชื่อองค์กร (จากภาพรวมที่โหลดอยู่แล้ว) สำหรับตารางผลรีวิว
  const orgNameById = new Map(orgs.map((o) => [o.id, o.name]))
  const orgNameOf = (id: string | null) => (id ? orgNameById.get(id) ?? '—' : '—')

  // จัดกลุ่มผลรีวิวตาม "ผู้รีวิว (+องค์กร)" สำหรับตารางสรุป → คลิกกางดูรายหัวข้อ
  // reviews เรียงใหม่→เก่าอยู่แล้ว จึง rows[0] = ล่าสุดของคนนั้น
  const reviewers = (() => {
    const m = new Map<string, { key: string; name: string; org_id: string | null; rows: ReviewRow[] }>()
    for (const r of reviews) {
      const name = r.created_by_name || '—'
      const key = `${name} ${r.org_id ?? ''}`
      const g = m.get(key)
      if (g) g.rows.push(r)
      else m.set(key, { key, name, org_id: r.org_id, rows: [r] })
    }
    return [...m.values()]
  })()

  function exportReviewsCsv() {
    const head = ['เวลา', 'กลุ่ม flow', 'จุด', 'สถานะ', 'comment', 'องค์กร', 'ผู้รีวิว']
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const statusTh = (s: string | null) =>
      s === 'pass' ? 'ผ่าน' : s === 'fail' ? 'ไม่ผ่าน' : s === 'note' ? 'สังเกต' : ''
    const lines = reviews.map((r) =>
      [new Date(r.created_at).toLocaleString('th-TH'), r.flow, r.label, statusTh(r.status), r.comment, orgNameOf(r.org_id), r.created_by_name]
        .map(esc)
        .join(','),
    )
    const csv = '﻿' + [head.map(esc).join(','), ...lines].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `hop-reviews-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // คลิกชื่อองค์กร → สวมสิทธิ์เข้าไปทำงานเสมือนสมาชิกองค์กรนั้น (ต้องรัน supabase/impersonate.sql ก่อน)
  async function enterOrg(o: OrgOverview) {
    setEnteringId(o.id)
    const { error } = await supabase.rpc('super_impersonate', { p_org: o.id })
    setEnteringId(null)
    if (error) {
      alert(
        error.message.includes('super_impersonate')
          ? 'ยังไม่ได้ติดตั้งฟีเจอร์สวมสิทธิ์ — รัน supabase/impersonate.sql ใน SQL Editor ก่อน'
          : `เข้าใช้สิทธิ์ไม่สำเร็จ: ${error.message}`,
      )
      return
    }
    await refreshProfile()
    navigate('/')
  }

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
    // ผ่าน RPC (SECURITY DEFINER) แทน update ตรงตาราง — ทนต่อ policy ถูกทับในอนาคต
    const { error } = await supabase.rpc('super_set_plan', {
      p_org: o.id,
      p_plan: e.plan,
      p_expires: e.sub_expires_at || null,
    })
    setSavingId(null)
    if (error) alert(`บันทึกไม่สำเร็จ: ${error.message}`)
    else {
      setEdits(({ [o.id]: _drop, ...rest }) => rest)
      await reload()
    }
  }

  const [deletingId, setDeletingId] = useState<string | null>(null)

  // ลบองค์กรถาวร — อันตรายสูง (ทรัพย์/แผน/ประวัติหาย cascade) จึงบังคับพิมพ์ชื่อองค์กรยืนยัน
  async function removeOrg(o: OrgOverview) {
    const typed = window.prompt(
      `⚠️ ลบองค์กร "${o.name}" ถาวร — กู้คืนไม่ได้\n\n` +
        `สิ่งที่จะหายทั้งหมด: ทรัพย์ ${o.property_count} รายการ · แผนเยี่ยมชม · ประวัติการใช้งาน · ประวัติการชำระเงิน\n` +
        `สมาชิก ${o.member_count} คน: บัญชีไม่ถูกลบ แต่จะกลายเป็นไร้สังกัด\n\n` +
        `พิมพ์ชื่อองค์กรให้ตรงเป๊ะเพื่อยืนยัน:`,
    )
    if (typed === null) return
    if (typed.trim() !== o.name) {
      alert('ชื่อองค์กรไม่ตรง — ยกเลิกการลบ')
      return
    }
    setDeletingId(o.id)
    const { error } = await supabase.rpc('super_delete_org', { p_org: o.id })
    setDeletingId(null)
    if (error) {
      alert(
        error.message.includes('super_delete_org')
          ? 'ยังไม่ได้ติดตั้งฟีเจอร์ลบองค์กร — รัน supabase/super-delete-org.sql ใน SQL Editor ก่อน'
          : `ลบไม่สำเร็จ: ${error.message}`,
      )
      return
    }
    await refreshProfile() // เผื่อกำลังสวมสิทธิ์องค์กรที่เพิ่งถูกลบ (impersonate_org_id ถูกเคลียร์เป็น null)
    await reload()
  }

  async function toggleStatus(o: OrgOverview) {
    const next = o.sub_status === 'active' ? 'suspended' : 'active'
    if (next === 'suspended' && !window.confirm(`ระงับองค์กร "${o.name}"? สมาชิกทั้งหมดจะใช้งานไม่ได้ทันที`)) return
    const { error } = await supabase.rpc('super_set_status', {
      p_org: o.id,
      p_status: next,
    })
    if (error) alert(`เปลี่ยนสถานะไม่สำเร็จ: ${error.message}`)
    else await reload()
  }

  const expired = (o: OrgOverview) =>
    o.sub_expires_at != null && o.sub_expires_at < new Date().toISOString().slice(0, 10)

  // ตัวกรององค์กร (dropdown แบบเดียวกับหน้ารายการทรัพย์)
  const shown = fOrg ? orgs.filter((o) => o.name === fOrg) : orgs

  return (
    <>
      <div className="view-header">
        <h1>Super Admin <span className="count-badge">{shown.length} องค์กร</span></h1>
        <div className="header-actions">
          <Link to="/logs" className="btn">ประวัติการใช้งาน</Link>
        </div>
      </div>
      <div className="team-wrap super-wrap">
        <section className="form-card" data-tour="super-review">
          <h3>โหมดรีวิว/ทดสอบระบบ (QA)</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: '0 0 12px' }}>
            เปิดแล้วผู้ใช้ทุกคนจะเห็นปุ่ม "📝 รีวิว" ลอยมุมล่างซ้าย ไว้กรอกผลทดสอบตาม checkpoint · ปิดเมื่อขึ้นใช้งานจริง
          </p>
          <div className="org-row" style={{ alignItems: 'center' }}>
            <button
              className={`btn ${reviewOn ? 'danger' : 'primary'}`}
              disabled={reviewBusy}
              onClick={() => void toggleReview()}
            >
              {reviewBusy ? 'กำลังสลับ…' : reviewOn ? 'ปิดโหมดรีวิว' : 'เปิดโหมดรีวิว'}
            </button>
            <span className={`status-pill ${reviewOn ? 'on' : ''}`}>{reviewOn ? 'เปิดอยู่' : 'ปิดอยู่'}</span>
            <span style={{ flex: 1 }} />
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>ผลรีวิว {reviews.length} รายการ</span>
            {reviews.length > 0 && (
              <button className="btn sm" onClick={exportReviewsCsv}>ดาวน์โหลด CSV</button>
            )}
          </div>
          {reviews.length > 0 && (
            <div className="table-scroll" style={{ marginTop: 12 }}>
              <table className="data-table">
                <thead>
                  <tr><th>ผู้รีวิว</th><th>องค์กร</th><th>จำนวน</th><th>สรุป</th><th>ล่าสุด</th><th></th></tr>
                </thead>
                <tbody>
                  {reviewers.map((g) => {
                    const pass = g.rows.filter((r) => r.status === 'pass').length
                    const fail = g.rows.filter((r) => r.status === 'fail').length
                    const note = g.rows.filter((r) => r.status === 'note').length
                    const open = openReviewer === g.key
                    return (
                      <Fragment key={g.key}>
                        <tr onClick={() => setOpenReviewer(open ? null : g.key)} style={{ cursor: 'pointer' }}>
                          <td data-label="ผู้รีวิว" className="td-main">{g.name}</td>
                          <td data-label="องค์กร">{orgNameOf(g.org_id)}</td>
                          <td data-label="จำนวน">{g.rows.length}</td>
                          <td data-label="สรุป" style={{ fontSize: 13 }}>
                            <span style={{ color: 'var(--success)' }}>ผ่าน {pass}</span>
                            {' · '}<span style={{ color: 'var(--danger)' }}>ไม่ผ่าน {fail}</span>
                            {' · '}<span style={{ color: 'var(--muted)' }}>สังเกต {note}</span>
                          </td>
                          <td data-label="ล่าสุด">{formatDate(g.rows[0].created_at)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                            {open ? '▲ ซ่อน' : '▼ ดูรีวิว'}
                          </td>
                        </tr>
                        {open && (
                          <tr>
                            <td colSpan={6} style={{ background: 'var(--line-soft)', padding: '2px 0 10px' }}>
                              {groupByFlow(g.rows).map(([flow, rows]) => (
                                <div key={flow} style={{ padding: '8px 14px 0' }}>
                                  <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--muted)', margin: '2px 0 2px' }}>{flow}</div>
                                  {rows.map((r) => (
                                    <div
                                      key={r.id}
                                      style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '7px 0', borderTop: '1px solid var(--line)' }}
                                    >
                                      <span className={`status-pill ${r.status === 'pass' ? 'on' : ''}`} style={{ flexShrink: 0 }}>
                                        {r.status === 'pass' ? 'ผ่าน' : r.status === 'fail' ? 'ไม่ผ่าน' : 'สังเกต'}
                                      </span>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 500 }}>{r.label}</div>
                                        {r.comment && (
                                          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2, whiteSpace: 'pre-wrap' }}>{r.comment}</div>
                                        )}
                                      </div>
                                      <span style={{ fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}>{formatDate(r.created_at)}</span>
                                    </div>
                                  ))}
                                </div>
                              ))}
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

        <section className="form-card">
          <h3>ราคาแพ็กเกจ</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: '0 0 12px' }}>
            มีผลทันทีทั้งหน้าเว็บ หน้าอัปเกรด และการคิดเงินจริง · QR ที่ค้างอยู่ก่อนเปลี่ยนราคาจะตรวจไม่ผ่าน ต้องกดสร้างรายการใหม่
          </p>
          {priceError && <div className="auth-error">{priceError}</div>}
          {!priceError && !priceEdit && <div className="loading">กำลังโหลด…</div>}
          {priceEdit && (
            <>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr><th>แพ็กเกจ · ระดับ</th><th>฿/เดือน</th><th>ส่วนลดรายปี (%)</th><th>฿/ปี (คำนวณให้)</th></tr>
                  </thead>
                  <tbody>
                    {(['starter', 'pro'] as const).flatMap((plan) =>
                      PRICE_TIERS.map((tierKey) => {
                        const e = priceEdit[plan][tierKey]
                        const yearly = yearlyOf(e.monthly, e.discount)
                        return (
                          <tr key={`${plan}-${tierKey}`}>
                            <td data-label="แพ็กเกจ" className="td-main">
                              {plan === 'starter' ? 'Basic' : 'Pro'} · ≤{tierKey} ทรัพย์
                            </td>
                            <td data-label="฿/เดือน">
                              <input
                                type="number" min={1} className="date-input" style={{ width: 110 }}
                                value={e.monthly}
                                onChange={(ev) => setPriceEdit({
                                  ...priceEdit,
                                  [plan]: { ...priceEdit[plan], [tierKey]: { ...e, monthly: ev.target.value } },
                                })}
                              />
                            </td>
                            <td data-label="ส่วนลดรายปี (%)">
                              <input
                                type="number" min={0} max={99} className="date-input" style={{ width: 90 }}
                                value={e.discount}
                                onChange={(ev) => setPriceEdit({
                                  ...priceEdit,
                                  [plan]: { ...priceEdit[plan], [tierKey]: { ...e, discount: ev.target.value } },
                                })}
                              />
                            </td>
                            <td data-label="฿/ปี" style={{ color: yearly == null ? 'var(--danger)' : undefined, fontWeight: 600 }}>
                              {yearly == null
                                ? 'กรอกราคา + ส่วนลด 0–99%'
                                : <>฿{yearly.toLocaleString()}<span style={{ color: 'var(--muted)', fontWeight: 400 }}> (ตกเดือนละ ฿{Math.round(yearly / 12).toLocaleString()})</span></>}
                            </td>
                          </tr>
                        )
                      }),
                    )}
                  </tbody>
                </table>
              </div>
              <div className="org-row" style={{ marginTop: 10 }}>
                <button className="btn sm primary" disabled={priceSaving} onClick={() => void savePrices()}>
                  {priceSaving ? 'กำลังบันทึก…' : 'บันทึกราคา'}
                </button>
              </div>
            </>
          )}
        </section>

        <section className="form-card">
          <h3>ทดลองใช้ฟรี (องค์กรสมัครใหม่)</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: '0 0 12px' }}>
            องค์กรที่สมัครใหม่ได้สิทธิ์แพ็กเกจนี้ฟรีตามจำนวนวัน · หมดช่วงทดลอง = องค์กรถูกล็อกจนกว่าจะเลือกแพ็กเกจ
            (แอดมินองค์กรเข้าหน้าจ่ายเงินได้เอง) · ไม่มีผลย้อนหลังกับองค์กรที่มีอยู่แล้ว
          </p>
          {!trial && <div className="loading">กำลังโหลด…</div>}
          {trial && (
            <div className="org-row" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: 14 }}>
                จำนวนวัน{' '}
                <input
                  type="number" min={0} max={365} className="date-input" style={{ width: 80 }}
                  value={trial.days}
                  onChange={(e) => setTrial({ ...trial, days: e.target.value })}
                />
              </label>
              <label style={{ fontSize: 14 }}>
                แพ็กเกจที่ให้ทดลอง{' '}
                <select
                  className="plan-select"
                  value={trial.plan}
                  onChange={(e) => setTrial({ ...trial, plan: e.target.value as TrialSetting['plan'] })}
                >
                  <option value="starter">เริ่มต้น (starter)</option>
                  <option value="pro">Pro</option>
                </select>
              </label>
              <button className="btn sm primary" disabled={trialSaving} onClick={() => void saveTrial()}>
                {trialSaving ? 'กำลังบันทึก…' : 'บันทึก'}
              </button>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                {Number(trial.days) > 0
                  ? `สมัครใหม่ได้ ${trial.plan === 'pro' ? 'Pro' : 'เริ่มต้น'} ฟรี ${trial.days} วัน`
                  : 'ปิดช่วงทดลอง — สมัครใหม่เริ่มที่ Free ทันที'}
              </span>
            </div>
          )}
        </section>

        <section className="form-card">
          <h3>ทดสอบระบบชำระเงิน (แพ็กเกจ ฿1)</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: '0 0 12px' }}>
            เปิดแล้วหน้าอัปเกรดจะมีการ์ด "จ่าย ฿1 เพื่อทดสอบ" (ได้แพ็กเกจเริ่มต้น 1 เดือนจริง) ·
            <b> ปิดก่อนเปิดตัวจริง</b> ไม่งั้นใครก็จ่าย ฿1 ได้แพ็กเกจ — รายการที่จ่ายค้างก่อนปิดยังตรวจสอบ/อัปเกรดได้ ไม่มีเงินค้าง
          </p>
          <div className="org-row" style={{ alignItems: 'center' }}>
            <button
              className={`btn ${payTest ? 'danger' : 'primary'}`}
              disabled={payTestBusy || payTest === null}
              onClick={() => void togglePayTest()}
            >
              {payTestBusy ? 'กำลังสลับ…' : payTest ? 'ปิดโหมดทดสอบ' : 'เปิดโหมดทดสอบ'}
            </button>
            <span className={`status-pill ${payTest ? 'on' : ''}`}>
              {payTest === null ? 'กำลังโหลด…' : payTest ? 'เปิดอยู่' : 'ปิดอยู่'}
            </span>
          </div>
        </section>

        <section className="form-card">
          <h3>ชวนเพื่อน รับ Pro ฟรี (Referral)</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: '0 0 12px' }}>
            เกณฑ์รางวัล: ชวนเพื่อนที่สมัครแล้ว "สร้างองค์กรใหม่" ครบทุก N คน → องค์กรผู้ชวนได้ Pro ฟรี D วัน (สะสมได้) ·
            มีผลทันทีกับการชวนครั้งถัดไป — ถ้า "ลด" จำนวนคน องค์กรที่ชวนสะสมไว้อาจได้รางวัลย้อนหลังรอบถัดไป (ไม่มีการยึดคืน)
          </p>
          {!referral && <div className="loading">กำลังโหลด…</div>}
          {referral && (
            <div className="org-row" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: 14 }}>
                ชวนครบ{' '}
                <input
                  type="number" min={1} max={100} className="date-input" style={{ width: 70 }}
                  value={referral.need}
                  onChange={(e) => setReferral({ ...referral, need: e.target.value })}
                />{' '}
                คน
              </label>
              <label style={{ fontSize: 14 }}>
                ได้ Pro ฟรี{' '}
                <input
                  type="number" min={1} max={365} className="date-input" style={{ width: 80 }}
                  value={referral.days}
                  onChange={(e) => setReferral({ ...referral, days: e.target.value })}
                />{' '}
                วัน
              </label>
              <button className="btn sm primary" disabled={referralSaving} onClick={() => void saveReferral()}>
                {referralSaving ? 'กำลังบันทึก…' : 'บันทึก'}
              </button>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                ชวนครบทุก {referral.need} คน = Pro +{referral.days} วัน (สะสมได้)
              </span>
            </div>
          )}
        </section>

        <section className="form-card">
          <h3>ช่องทางติดต่อ / LINE OA (แสดงบนหน้า landing)</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: '0 0 12px' }}>
            ใช้ที่ปุ่มติดต่อท้ายหน้า landing และปุ่ม "คุยกับเซลล์" ของแพ็ก Enterprise · มีผลทันทีไม่ต้อง deploy
          </p>
          {!contact && <div className="loading">กำลังโหลด…</div>}
          {contact && (
            <>
              <div className="org-row" style={{ flexWrap: 'wrap' }}>
                <div className="form-field" style={{ flex: 1, minWidth: 160, marginBottom: 8 }}>
                  <label>LINE ID <span className="req">*</span></label>
                  <input value={contact.lineId} placeholder="@hopplatform"
                    onChange={(e) => setContact({ ...contact, lineId: e.target.value })} />
                </div>
                <div className="form-field" style={{ flex: 2, minWidth: 220, marginBottom: 8 }}>
                  <label>ลิงก์ LINE OA (เว้นว่าง = สร้างจาก LINE ID ให้)</label>
                  <input value={contact.lineUrl} placeholder="https://lin.ee/xxxx"
                    onChange={(e) => setContact({ ...contact, lineUrl: e.target.value })} />
                </div>
              </div>
              <div className="org-row" style={{ flexWrap: 'wrap' }}>
                <div className="form-field" style={{ flex: 1, minWidth: 160, marginBottom: 8 }}>
                  <label>เบอร์โทรทีมขาย</label>
                  <input value={contact.phone} placeholder="081-234-5678"
                    onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
                </div>
                <div className="form-field" style={{ flex: 1, minWidth: 200, marginBottom: 8 }}>
                  <label>อีเมลทีมขาย</label>
                  <input value={contact.email} placeholder="sales@..."
                    onChange={(e) => setContact({ ...contact, email: e.target.value })} />
                </div>
              </div>
              <button className="btn sm primary" disabled={contactSaving} onClick={() => void saveContact()}>
                {contactSaving ? 'กำลังบันทึก…' : 'บันทึก'}
              </button>
            </>
          )}
        </section>

        <section className="form-card">
          <h3>แจ้งเตือนสัญญาเช่าใกล้หมด</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: '0 0 12px' }}>
            ค่ามาตรฐานทั้งระบบ — ใช้กับองค์กรที่ "ไม่ได้ตั้งเกณฑ์เอง" (แอดมินแต่ละองค์กรตั้งของตัวเองได้ที่หน้าโปรไฟล์) ·
            แจ้งเตือน 07:00 เมื่อทรัพย์เหลือวันสัญญาตามเกณฑ์พอดี · เฉพาะองค์กร Pro (รวมช่วงทดลองใช้)
          </p>
          {alertDays === null && <div className="loading">กำลังโหลด…</div>}
          {alertDays !== null && (
            <div className="org-row" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: 14 }}>
                แจ้งล่วงหน้า (วัน, คั่นด้วยจุลภาค){' '}
                <input
                  className="date-input" style={{ width: 140 }}
                  value={alertDays}
                  placeholder="60, 30"
                  onChange={(e) => setAlertDays(e.target.value)}
                />
              </label>
              <button className="btn sm primary" disabled={alertSaving} onClick={() => void saveContractAlert()}>
                {alertSaving ? 'กำลังบันทึก…' : 'บันทึก'}
              </button>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                ตอนนี้: แจ้งเมื่อสัญญาเหลือ {alertDays || '—'} วัน
              </span>
            </div>
          )}
        </section>

        <section className="form-card">
          <h3>องค์กรทั้งหมด · บริหาร Subscription</h3>
          {orgs.length > 0 && (
            <div className="filter-row" style={{ marginBottom: 12 }}>
              <span className="filter-label">องค์กร</span>
              <select
                className="filter-select"
                value={fOrg ?? ''}
                onChange={(e) => setFOrg(e.target.value || null)}
              >
                <option value="">ทุกองค์กร</option>
                {[...orgs].sort((a, b) => a.name.localeCompare(b.name, 'th')).map((o) => (
                  <option key={o.id} value={o.name}>{o.name}</option>
                ))}
              </select>
            </div>
          )}
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
                  {shown.map((o) => (
                    <tr key={o.id} className={o.sub_status === 'suspended' ? 'row-off' : ''}>
                      <td data-label="องค์กร" className="td-main">
                        <button
                          type="button"
                          className="org-enter"
                          title={`เข้าใช้สิทธิ์แทน ${o.name}`}
                          disabled={enteringId === o.id}
                          onClick={() => void enterOrg(o)}
                        >
                          {o.name}
                        </button>
                        {profile?.impersonate_org_id === o.id && (
                          <span className="tag org">กำลังใช้สิทธิ์</span>
                        )}
                        <div className="td-sub">
                          สร้าง {formatDate(o.created_at)} · คลิกชื่อเพื่อเข้าใช้สิทธิ์แทน
                        </div>
                      </td>
                      <td data-label="สมาชิก">{o.member_count}</td>
                      <td data-label="ทรัพย์">{o.property_count}</td>
                      <td data-label="แพ็กเกจ">
                        <select
                          className="plan-select"
                          value={editOf(o).plan}
                          onChange={(e) => setEdit(o, { plan: e.target.value })}
                        >
                          {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                        {onTrialRow(o) && (
                          <div className="td-sub" style={{ color: 'var(--purple)' }}>
                            🧪 ทดลอง {o.trial_plan === 'pro' ? 'Pro' : 'เริ่มต้น'} ถึง{' '}
                            {new Date(o.trial_expires_at!).toLocaleDateString('th-TH', { month: 'short', day: 'numeric' })}
                          </div>
                        )}
                      </td>
                      <td data-label="หมดอายุ">
                        <input
                          type="date"
                          className="date-input"
                          value={editOf(o).sub_expires_at}
                          onChange={(e) => setEdit(o, { sub_expires_at: e.target.value })}
                        />
                        {expired(o) && <div className="td-sub" style={{ color: 'var(--danger)' }}>หมดอายุแล้ว</div>}
                      </td>
                      <td data-label="สถานะ">
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
                        <button
                          className="btn sm danger"
                          title="ลบองค์กรถาวร (ทรัพย์/ประวัติหายทั้งหมด)"
                          disabled={deletingId === o.id}
                          onClick={() => void removeOrg(o)}
                        >
                          {deletingId === o.id ? 'กำลังลบ…' : 'ลบ'}
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
