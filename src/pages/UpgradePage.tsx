import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { createCharge, verifyCharge, fetchPlanPrices, fetchPaymentTestEnabled, DEFAULT_PRICES, TIERS, type PlanKey, type PlanPrices, type Tier } from '../lib/payments'
import { onTrial, fetchContactSetting, DEFAULT_CONTACT } from '../lib/plan'

// ราคาอยู่ใน state (โหลดจากตาราง plan_prices — super admin ตั้งเอง) ที่นี่มีแค่ข้อความ/ฟีเจอร์
// จำนวนทรัพย์ = ตามระดับที่เลือก (100/250/500) — แสดงใน UI ตัวเลือกระดับ
const PLANS = [
  {
    key: 'starter' as const,
    name: 'Basic',
    points: ['ลูกทีมไม่จำกัด', 'ฐานข้อมูล + แผนที่ดาวเทียม + ฟอร์มตามประเภททรัพย์', 'เอกสารสิทธิ์ + เอกสารเปรียบเทียบ', 'ใช้ได้ทั้งเว็บและแอปมือถือ'],
    featured: false,
  },
  {
    key: 'pro' as const,
    name: 'Pro',
    points: ['ทุกอย่างใน Basic', 'ผู้ช่วย AI ครบชุด (พูด/ถ่ายรูป/แชท)', 'Dashboard + นำเข้า Excel/CSV', 'แผนเยี่ยมชม + นัดติดตาม + แจ้งเตือนสัญญา'],
    featured: true,
  },
]

type ActiveCharge = { charge_id: string; checkout_url?: string; plan?: PlanKey }

export default function UpgradePage() {
  const navigate = useNavigate()
  const { profile, org, refreshProfile } = useAuth()
  const isAdmin = profile?.role === 'admin' || Boolean(profile?.is_super && profile?.impersonate_org_id)

  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly')
  // ระดับ = โควตาทรัพย์ — ค่าเริ่มต้นตามระดับปัจจุบันขององค์กร (ไม่มี = เล็กสุด ให้อัปเองตามใช้จริง)
  const [tier, setTier] = useState<Tier>(() =>
    (TIERS as number[]).includes(org?.plan_tier ?? 0) ? (org!.plan_tier as Tier) : 100)
  const [busy, setBusy] = useState<string | null>(null)
  const [charge, setCharge] = useState<ActiveCharge | null>(null)
  const [status, setStatus] = useState('')
  const [done, setDone] = useState<{ plan: string; expires: string | null } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [prices, setPrices] = useState<PlanPrices>(DEFAULT_PRICES)
  const pollRef = useRef<number | null>(null)

  // การ์ดทดสอบ ฿1 โชว์เฉพาะตอน super เปิดสวิตช์ payment_test (เซิร์ฟเวอร์บังคับซ้ำอีกชั้น)
  const [testOn, setTestOn] = useState(false)
  // ช่องทางติดต่อทีมขาย (LINE OA) — super admin ตั้งจากหน้า Super Admin
  const [contact, setContact] = useState(DEFAULT_CONTACT)
  useEffect(() => {
    void fetchPlanPrices().then(setPrices)
    void fetchPaymentTestEnabled().then(setTestOn)
    void fetchContactSetting().then(setContact)
  }, [])

  const perMonth = (p: { monthly: number; yearly: number }) =>
    cycle === 'yearly' ? Math.round(p.yearly / 12) : p.monthly
  // ราคาของระดับที่เลือกอยู่
  const priceOf = (key: 'starter' | 'pro') => prices[key][tier]
  // % ประหยัดเมื่อจ่ายรายปี เทียบจ่ายรายเดือน 12 ครั้ง (คำนวณจากราคาจริง)
  const yearSavePct = (p: { monthly: number; yearly: number }) =>
    Math.max(0, Math.round((1 - p.yearly / (p.monthly * 12)) * 100))

  function stopPoll() {
    if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null }
  }
  function startPoll(chargeId: string) {
    stopPoll()
    let tries = 0
    pollRef.current = window.setInterval(() => {
      tries++
      if (tries > 75) { stopPoll(); setStatus('หมดเวลารอ — ถ้าจ่ายแล้วยังไม่ขึ้น กด "ตรวจสอบอีกครั้ง"'); return }
      void checkOnce(chargeId)
    }, 4000)
  }

  async function checkOnce(chargeId: string) {
    try {
      const r = await verifyCharge(chargeId)
      if (r.paid) {
        stopPoll()
        try { localStorage.removeItem('hop_charge') } catch { /* ข้าม */ }
        setDone({ plan: r.plan || charge?.plan || '', expires: r.expires ?? null })
        await refreshProfile()
      } else {
        setStatus('ยังไม่พบการชำระเงิน — ถ้าจ่าย+อัปสลิปแล้ว รอสักครู่ (ระบบตรวจสลิปอัตโนมัติ)')
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'ตรวจสอบไม่สำเร็จ')
    }
  }

  async function pay(plan: PlanKey) {
    setErr(null)
    setBusy(plan)
    try {
      const c = await createCharge(plan, tier, cycle)
      setCharge({ charge_id: c.charge_id, checkout_url: c.checkout_url, plan })
      try { localStorage.setItem('hop_charge', c.charge_id) } catch { /* ข้าม */ }
      window.open(c.checkout_url, '_blank', 'noopener')
      setStatus('เปิดหน้าชำระเงินแล้ว — สแกน PromptPay แล้วอัปโหลดสลิป จากนั้นระบบจะตรวจสอบให้อัตโนมัติ')
      startPoll(c.charge_id)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'สร้างรายการไม่สำเร็จ')
    } finally {
      setBusy(null)
    }
  }

  // มีรายการค้างจากการรีโหลด → ตรวจต่อ
  useEffect(() => {
    let saved: string | null = null
    try { saved = localStorage.getItem('hop_charge') } catch { saved = null }
    if (saved) {
      setCharge({ charge_id: saved })
      setStatus('พบรายการค้าง — กำลังตรวจสอบการชำระเงิน…')
      startPoll(saved)
    }
    return () => stopPoll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function reset() {
    stopPoll()
    setCharge(null)
    setStatus('')
    setErr(null)
    try { localStorage.removeItem('hop_charge') } catch { /* ข้าม */ }
  }

  if (!isAdmin) {
    return (
      <>
        <div className="view-header"><h1>อัปเกรดแพ็กเกจ</h1></div>
        <div className="team-wrap">
          <section className="form-card">
            <p style={{ margin: 0 }}>เฉพาะแอดมินขององค์กรเท่านั้นที่จัดการการชำระเงินได้ — ติดต่อแอดมินของทีมคุณ</p>
          </section>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="view-header"><h1>อัปเกรดแพ็กเกจ</h1></div>
      <div className="team-wrap">
        {done ? (
          <section className="form-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 46, marginBottom: 6 }}>🎉</div>
            <h3>อัปเกรดสำเร็จ!</h3>
            <p className="plan-line">
              องค์กร <b>{org?.name}</b> เป็นแพ็กเกจ <b>{done.plan === 'pro' ? 'Pro' : 'Basic'}</b> แล้ว
              {done.expires ? ` · ใช้ได้ถึง ${new Date(done.expires).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}` : ''}
            </p>
            <button className="btn primary" onClick={() => navigate('/')}>เริ่มใช้งาน</button>
          </section>
        ) : charge ? (
          <section className="form-card">
            <h3>{charge.checkout_url ? 'รอการชำระเงิน' : 'กำลังตรวจสอบรายการค้าง'}</h3>
            <p className="plan-line" style={{ minHeight: '1.4em' }}>{status}</p>
            <div className="org-row" style={{ flexWrap: 'wrap' }}>
              {charge.checkout_url && (
                <a className="btn primary" href={charge.checkout_url} target="_blank" rel="noreferrer">เปิดหน้าชำระเงินอีกครั้ง</a>
              )}
              <button className="btn" onClick={() => void checkOnce(charge.charge_id)}>ตรวจสอบอีกครั้ง</button>
              <button className="btn sm" onClick={reset}>ยกเลิก</button>
            </div>
          </section>
        ) : (
          <>
            <p className="plan-line" style={{ marginTop: 0 }}>
              แพ็กเกจปัจจุบัน:{' '}
              <span className="role-badge">
                {onTrial(org)
                  ? `ทดลองใช้ ${org?.trial_plan === 'pro' ? 'Pro' : 'เริ่มต้น'} ถึง ${new Date(org!.trial_expires_at!).toLocaleDateString('th-TH', { month: 'short', day: 'numeric' })}`
                  : org?.plan === 'pro' ? `Pro${org?.plan_tier ? ` ≤${org.plan_tier} ทรัพย์` : ''}`
                    : org?.plan === 'starter' ? `Basic${org?.plan_tier ? ` ≤${org.plan_tier} ทรัพย์` : ''}`
                      : org?.plan === 'enterprise' ? 'Enterprise' : 'ยังไม่ได้เลือก'}
              </span>
            </p>
            <div style={{ display: 'inline-flex', gap: 4, padding: 4, border: '1px solid var(--line)', borderRadius: 999, marginBottom: 18 }}>
              {(['monthly', 'yearly'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  className="btn sm"
                  style={{
                    border: 'none', boxShadow: 'none',
                    background: cycle === c ? 'var(--purple)' : 'transparent',
                    color: cycle === c ? '#fff' : 'var(--muted)',
                  }}
                  onClick={() => setCycle(c)}
                >
                  {c === 'monthly' ? 'รายเดือน' : `รายปี −${yearSavePct(priceOf('starter'))}%`}
                </button>
              ))}
            </div>
            {err && <div className="auth-error">{err}</div>}
            {/* ระดับ = โควตาทรัพย์ในระบบ — ราคาทั้งสองแพ็กเปลี่ยนตามระดับที่เลือก */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>จำนวนทรัพย์ในระบบ</div>
              <div className="chip-select">
                {TIERS.map((t) => (
                  <button key={t} type="button" className={`chip-toggle ${tier === t ? 'on' : ''}`} onClick={() => setTier(t)}>
                    ไม่เกิน {t} ทรัพย์
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
              {PLANS.map((p) => (
                <section key={p.key} className="form-card" style={p.featured ? { borderColor: 'var(--purple)' } : undefined}>
                  <h3 style={{ margin: '0 0 2px' }}>{p.name}{p.featured && ' ⭐'}</h3>
                  <p style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', margin: '4px 0 0' }}>
                    ฿{perMonth(priceOf(p.key)).toLocaleString()}
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>/เดือน</span>
                  </p>
                  <p className="plan-line">
                    ทรัพย์ไม่เกิน {tier} รายการ ·{' '}
                    {cycle === 'yearly'
                      ? `เรียกเก็บ ฿${priceOf(p.key).yearly.toLocaleString()}/ปี (ประหยัด ${yearSavePct(priceOf(p.key))}%)`
                      : `จ่ายรายปีเหลือ ฿${Math.round(priceOf(p.key).yearly / 12).toLocaleString()}/เดือน`}
                  </p>
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'flex', flexDirection: 'column', gap: 7, fontSize: 14 }}>
                    {p.points.map((pt) => <li key={pt}>✓ {pt}</li>)}
                  </ul>
                  <button className="btn primary" style={{ width: '100%' }} disabled={busy !== null} onClick={() => void pay(p.key)}>
                    {busy === p.key ? 'กำลังสร้างรายการ…' : 'จ่ายด้วย PromptPay'}
                  </button>
                </section>
              ))}
            </div>
            {/* ทรัพย์เกิน 500 = Enterprise — ตั้งราคาต่อดีล คุยกับทีมงานเท่านั้น */}
            <section className="form-card" style={{ marginTop: 14 }}>
              <h3 style={{ margin: '0 0 2px' }}>Enterprise</h3>
              <p className="plan-line">ทรัพย์มากกว่า 500 รายการ / ต้องการ SLA พิเศษ — คุยกับทีมงานเพื่อใบเสนอราคา</p>
              <a className="btn" href={contact.lineUrl} target="_blank" rel="noreferrer">
                ติดต่อทีมงานทาง LINE {contact.lineId}
              </a>
            </section>
            <p className="plan-line" style={{ marginTop: 16 }}>
              ชำระผ่าน PromptPay (สแกน QR + อัปโหลดสลิป) · ระบบตรวจสอบและอัปเกรดอัตโนมัติ · จ่ายรายปีถูกกว่า
            </p>
            {/* 🧪 แพ็กเกจทดสอบ ฿1 — โชว์เฉพาะตอน super เปิดสวิตช์ในหน้า Super Admin (ปิดก่อนเปิดตัวจริง) */}
            {testOn && (
              <section className="form-card" style={{ marginTop: 14, borderStyle: 'dashed' }}>
                <h3 style={{ margin: '0 0 2px' }}>🧪 ทดสอบระบบชำระเงิน</h3>
                <p className="plan-line">
                  จ่ายจริง <b>฿1</b> ผ่าน PromptPay → ได้แพ็กเกจ "เริ่มต้น" 1 เดือน (ไว้ทดสอบครบวงจร: QR → สลิป → webhook → อัปเกรด)
                </p>
                <button className="btn" disabled={busy !== null} onClick={() => void pay('test')}>
                  {busy === 'test' ? 'กำลังสร้างรายการ…' : 'จ่าย ฿1 เพื่อทดสอบ'}
                </button>
              </section>
            )}
          </>
        )}
      </div>
    </>
  )
}
