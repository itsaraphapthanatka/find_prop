import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import {
  createCharge, createSeatCharge, verifyCharge, fetchPlanPrices, fetchPaymentTestEnabled, fetchSeatSetting,
  DEFAULT_PRICES, DEFAULT_SEAT_SETTING, MAX_SEAT_QTY, TIERS,
  type PlanKey, type PlanPrices, type SeatSetting, type Tier,
} from '../lib/payments'
import { rolePerm } from '../lib/roles'
import {
  onTrial, fetchContactSetting, DEFAULT_CONTACT,
  seatLimit, baseSeats, effectivePlan, activeExtraSeats,
} from '../lib/plan'

// ราคาอยู่ใน state (โหลดจากตาราง plan_prices — super admin ตั้งเอง) ที่นี่มีแค่ข้อความ/ฟีเจอร์
// จำนวนทรัพย์ = ตามระดับที่เลือก (100/250/500) — แสดงใน UI ตัวเลือกระดับ
// จำนวนที่นั่งของแต่ละแพ็ก/ระดับ ดึงจาก SEATS_BY_PLAN (src/lib/plan.ts) ตอนเรนเดอร์ — ที่นี่มีแค่ข้อความอื่น
const PLANS = [
  {
    key: 'starter' as const,
    name: 'Basic',
    points: ['ฐานข้อมูล + แผนที่ดาวเทียม + ฟอร์มตามประเภททรัพย์', 'เอกสารสิทธิ์ + เอกสารเปรียบเทียบ', 'ใช้ได้ทั้งเว็บและแอปมือถือ'],
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
  // จัดการแพ็กเกจ/ชำระเงิน = บทบาท Owner (หรือ super ที่สวมสิทธิ์องค์กรนั้น)
  const isAdmin = rolePerm(profile?.is_super ? 'owner' : profile?.role).canManageOrg
    || Boolean(profile?.is_super && profile?.impersonate_org_id)

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
  // ที่นั่งเพิ่ม — ราคา/โควตาต่อแพ็กเกจ (super admin ตั้งได้) + จำนวนที่จะซื้อ
  const [seatCfg, setSeatCfg] = useState<SeatSetting>(DEFAULT_SEAT_SETTING)
  const seatPrice = { monthly: seatCfg.monthly, yearly: seatCfg.yearly }
  // มาจากหน้าจัดการทีมตอนทีมเกินโควตา (/upgrade?seats=3) → กรอกจำนวนที่ขาดไว้ให้เลย
  const [seatQty, setSeatQty] = useState(() => {
    const q = Math.floor(Number(new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('seats')))
    return q >= 1 && q <= MAX_SEAT_QTY ? q : 1
  })

  // การ์ดทดสอบ ฿1 โชว์เฉพาะตอน super เปิดสวิตช์ payment_test (เซิร์ฟเวอร์บังคับซ้ำอีกชั้น)
  const [testOn, setTestOn] = useState(false)
  // ช่องทางติดต่อทีมขาย (LINE OA) — super admin ตั้งจากหน้า Super Admin
  const [contact, setContact] = useState(DEFAULT_CONTACT)
  useEffect(() => {
    void fetchPlanPrices().then(setPrices)
    void fetchPaymentTestEnabled().then(setTestOn)
    void fetchContactSetting().then(setContact)
    void fetchSeatSetting().then(setSeatCfg)
  }, [])

  // มาจากลิงก์ "ซื้อที่นั่งเพิ่ม" (/upgrade#seats) → เลื่อนไปการ์ดที่นั่งให้เลย
  useEffect(() => {
    if (window.location.hash.endsWith('#seats')) {
      const t = window.setTimeout(() => {
        document.getElementById('seats')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 250)
      return () => window.clearTimeout(t)
    }
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

  /** ซื้อที่นั่งเพิ่ม — ไม่เปลี่ยนแพ็กเกจ/วันหมดอายุ subscription */
  async function paySeats() {
    setErr(null)
    setBusy('seats')
    try {
      const c = await createSeatCharge(seatQty, cycle)
      setCharge({ charge_id: c.charge_id, checkout_url: c.checkout_url, plan: 'seats' })
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
            <p style={{ margin: 0 }}>เฉพาะเจ้าขององค์กร (Owner) เท่านั้นที่จัดการแพ็กเกจ/ชำระเงินได้ — ติดต่อ Owner ของทีมคุณ</p>
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
            <h3>{done.plan === 'seats' ? 'เพิ่มที่นั่งสำเร็จ!' : 'อัปเกรดสำเร็จ!'}</h3>
            <p className="plan-line">
              {done.plan === 'seats' ? (
                <>องค์กร <b>{org?.name}</b> มีที่นั่งเพิ่มแล้ว — ตอนนี้ใช้ได้ <b>{seatLimit(org) ?? 'ไม่จำกัด'}</b> ที่นั่ง
                  {done.expires ? ` · ที่นั่งเพิ่มใช้ได้ถึง ${new Date(done.expires).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}` : ''}</>
              ) : (
                <>องค์กร <b>{org?.name}</b> เป็นแพ็กเกจ <b>{done.plan === 'pro' ? 'Pro' : 'Basic'}</b> แล้ว
                  {done.expires ? ` · ใช้ได้ถึง ${new Date(done.expires).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}` : ''}</>
              )}
            </p>
            <div className="org-row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
              {done.plan === 'seats' && <button className="btn" onClick={() => navigate('/team')}>ไปเชิญลูกทีม</button>}
              <button className="btn primary" onClick={() => navigate('/')}>เริ่มใช้งาน</button>
            </div>
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
                    {/* ที่นั่ง = จำนวนบัญชีในองค์กร (รวมแอดมิน) — ซื้อเพิ่มรายที่นั่งได้ในการ์ดด้านล่าง */}
                    <li>✓ ทีม {seatCfg.base[p.key][tier]} ที่นั่ง (เพิ่มได้)</li>
                    {p.points.map((pt) => <li key={pt}>✓ {pt}</li>)}
                  </ul>
                  <button className="btn primary" style={{ width: '100%' }} disabled={busy !== null} onClick={() => void pay(p.key)}>
                    {busy === p.key ? 'กำลังสร้างรายการ…' : 'จ่ายด้วย PromptPay'}
                  </button>
                </section>
              ))}
            </div>
            {/* ที่นั่งเพิ่ม — ซื้อแยกจากแพ็กเกจ ไม่เปลี่ยนแพ็กเกจ/วันหมดอายุ subscription */}
            <section className="form-card" id="seats" style={{ marginTop: 14 }}>
              <h3 style={{ margin: '0 0 2px' }}>ที่นั่งเพิ่ม</h3>
              {onTrial(org) && (
                <p className="plan-line" style={{ color: 'var(--purple)' }}>
                  ⏳ ช่วงทดลองใช้ตอนนี้ <b>ไม่จำกัดที่นั่ง</b> — พอหมดช่วงทดลองจะเหลือตามแพ็กเกจที่ซื้อ
                  ส่วนที่เกินซื้อที่นั่งเพิ่มได้จากการ์ดนี้
                </p>
              )}
              <p className="plan-line">
                แพ็กเกจปัจจุบันให้ <b>{baseSeats(effectivePlan(org), org?.plan_tier, seatCfg.base) ?? 'ไม่จำกัด'}</b> ที่นั่ง
                {activeExtraSeats(org) > 0 && <> + ซื้อเพิ่มไว้แล้ว <b>{activeExtraSeats(org)}</b> ที่นั่ง</>}
                {' '}· ต้องการมากกว่านี้ ซื้อเพิ่มรายที่นั่งได้เลย (1 ที่นั่ง = 1 บัญชี)
              </p>
              <div className="org-row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="form-field" style={{ marginBottom: 0, maxWidth: 150 }}>
                  <label>จำนวนที่นั่ง</label>
                  <input
                    type="number" min={1} max={MAX_SEAT_QTY} value={seatQty}
                    onChange={(e) => {
                      const n = Math.floor(Number(e.target.value))
                      setSeatQty(Number.isFinite(n) ? Math.min(MAX_SEAT_QTY, Math.max(1, n)) : 1)
                    }}
                  />
                </div>
                <p style={{ margin: 0, fontSize: 15 }}>
                  ฿{((cycle === 'yearly' ? seatPrice.yearly : seatPrice.monthly) * seatQty).toLocaleString()}
                  <span style={{ color: 'var(--muted)' }}>
                    {cycle === 'yearly' ? '/ปี' : '/เดือน'} (฿{(cycle === 'yearly' ? Math.round(seatPrice.yearly / 12) : seatPrice.monthly).toLocaleString()} ต่อที่นั่ง/เดือน)
                  </span>
                </p>
                <button className="btn primary" disabled={busy !== null} onClick={() => void paySeats()}>
                  {busy === 'seats' ? 'กำลังสร้างรายการ…' : 'จ่ายด้วย PromptPay'}
                </button>
              </div>
              <p className="plan-line" style={{ marginTop: 10 }}>
                ที่นั่งที่ซื้อมีอายุตามรอบที่จ่าย (ต่ออายุจากวันหมดอายุเดิม) · หมดอายุแล้วจะ<b>เชิญคนใหม่ไม่ได้</b> แต่ไม่มีใครถูกนำออกจากองค์กร
              </p>
            </section>

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
