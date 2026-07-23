import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { createCharge, verifyCharge } from '../lib/payments'

const YEARLY_DISCOUNT = 0.15
const PLANS = [
  {
    key: 'starter' as const,
    name: 'เริ่มต้น',
    price: 990,
    points: ['ทรัพย์ไม่จำกัด', 'ลูกทีมไม่จำกัด', 'ฐานข้อมูล + แผนที่ดาวเทียม + ฟอร์ม', 'เอกสารเปรียบเทียบ + แอปมือถือ'],
    featured: false,
  },
  {
    key: 'pro' as const,
    name: 'Pro',
    price: 1290,
    points: ['ทุกอย่างในเริ่มต้น', 'ผู้ช่วย AI ครบชุด (พูด/ถ่ายรูป/แชท)', 'Dashboard + นำเข้า Excel/CSV', 'แผนเยี่ยมชม + แจ้งเตือน'],
    featured: true,
  },
]

type ActiveCharge = { charge_id: string; checkout_url?: string; plan?: 'starter' | 'pro' }

export default function UpgradePage() {
  const navigate = useNavigate()
  const { profile, org, refreshProfile } = useAuth()
  const isAdmin = profile?.role === 'admin' || Boolean(profile?.is_super && profile?.impersonate_org_id)

  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly')
  const [busy, setBusy] = useState<string | null>(null)
  const [charge, setCharge] = useState<ActiveCharge | null>(null)
  const [status, setStatus] = useState('')
  const [done, setDone] = useState<{ plan: string; expires: string | null } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const pollRef = useRef<number | null>(null)

  const perMonth = (m: number) => (cycle === 'yearly' ? Math.round(m * (1 - YEARLY_DISCOUNT)) : m)
  const yearTotal = (m: number) => Math.round(m * 12 * (1 - YEARLY_DISCOUNT))

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

  async function pay(plan: 'starter' | 'pro') {
    setErr(null)
    setBusy(plan)
    try {
      const c = await createCharge(plan, cycle)
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
              องค์กร <b>{org?.name}</b> เป็นแพ็กเกจ <b>{done.plan === 'pro' ? 'Pro' : 'เริ่มต้น'}</b> แล้ว
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
              แพ็กเกจปัจจุบัน: <span className="role-badge">{org?.plan === 'pro' ? 'Pro' : org?.plan === 'starter' ? 'เริ่มต้น' : 'ยังไม่ได้เลือก'}</span>
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
                  {c === 'monthly' ? 'รายเดือน' : 'รายปี −15%'}
                </button>
              ))}
            </div>
            {err && <div className="auth-error">{err}</div>}
            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
              {PLANS.map((p) => (
                <section key={p.key} className="form-card" style={p.featured ? { borderColor: 'var(--purple)' } : undefined}>
                  <h3 style={{ margin: '0 0 2px' }}>{p.name}{p.featured && ' ⭐'}</h3>
                  <p style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', margin: '4px 0 0' }}>
                    ฿{perMonth(p.price).toLocaleString()}
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>/เดือน</span>
                  </p>
                  <p className="plan-line">
                    {cycle === 'yearly' ? `เรียกเก็บ ฿${yearTotal(p.price).toLocaleString()}/ปี` : `จ่ายรายปีเหลือ ฿${Math.round(p.price * (1 - YEARLY_DISCOUNT)).toLocaleString()}/เดือน`}
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
            <p className="plan-line" style={{ marginTop: 16 }}>
              ชำระผ่าน PromptPay (สแกน QR + อัปโหลดสลิป) · ระบบตรวจสอบและอัปเกรดอัตโนมัติ · จ่ายรายปีประหยัด 15%
            </p>
          </>
        )}
      </div>
    </>
  )
}
