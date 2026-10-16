import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import {
  startCheckout, startSeatCheckout, confirmCheckout, openBillingPortal, openUnpaidInvoice, syncBilling, fetchPlanPrices, fetchSeatSetting,
  fetchPromptPayEnabled,
  DEFAULT_PRICES, DEFAULT_SEAT_SETTING, MAX_SEAT_QTY, TIERS,
  type CheckoutResult, type PayMethod, type PlanKey, type PlanPrices, type SeatSetting, type Tier,
} from '../lib/payments'
import { rolePerm } from '../lib/roles'
import { isNativeApp } from '../lib/native'
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

// รายการที่รอยืนยัน: Checkout session (cs_… — แอปมือถือ) หรือใบแจ้งหนี้ PromptPay (in_… — ทั้งเว็บและแอป
// เพราะหน้าใบแจ้งหนี้ของ Stripe ไม่มีลิงก์พากลับ) → ยืนยันตอนผู้ใช้กลับมาที่หน้านี้
const PENDING_KEY = 'hop_stripe_session'
const fmtDate = (d: string) => new Date(d).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms))

export default function UpgradePage() {
  const navigate = useNavigate()
  const { profile, org, refreshProfile } = useAuth()
  // จัดการแพ็กเกจ/ชำระเงิน = บทบาท Owner (หรือ super ที่สวมสิทธิ์องค์กรนั้น)
  const isAdmin = rolePerm(profile?.is_super ? 'owner' : profile?.role).canManageOrg
    || Boolean(profile?.is_super && profile?.impersonate_org_id)

  const [cycle, setCycle] = useState<'monthly' | 'yearly'>(() => org?.sub_cycle === 'yearly' ? 'yearly' : 'monthly')
  // ระดับ = โควตาทรัพย์ — ค่าเริ่มต้นตามระดับปัจจุบันขององค์กร (ไม่มี = เล็กสุด ให้อัปเองตามใช้จริง)
  const [tier, setTier] = useState<Tier>(() =>
    (TIERS as number[]).includes(org?.plan_tier ?? 0) ? (org!.plan_tier as Tier) : 100)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [confirming, setConfirming] = useState(false)
  // promptpay = จ่ายแบบใบแจ้งหนี้ (ไม่ตัดอัตโนมัติ) → ข้อความหน้าสำเร็จต่างจากบัตร
  const [done, setDone] = useState<{ kind: 'plan' | 'seats'; expires: string | null; promptpay?: boolean } | null>(null)
  // วิธีจ่ายของ subscription ปัจจุบัน (รู้จากการซิงก์ตอนเปิดหน้า) — ไว้เลือกข้อความ "ตัดบัตรทุกรอบ" / "ใบแจ้งหนี้ทุกรอบ"
  const [subMethod, setSubMethod] = useState<{ plan?: PayMethod; seats?: PayMethod }>({})
  const [err, setErr] = useState<string | null>(null)
  // ตัดบัตรส่วนต่างไม่ผ่าน/ธนาคารขอยืนยันตัวตน → ลิงก์หน้าใบแจ้งหนี้ของ Stripe ให้กดจ่ายเอง
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null)
  const [prices, setPrices] = useState<PlanPrices>(DEFAULT_PRICES)
  // ที่นั่งเพิ่ม — ราคา/โควตาต่อแพ็กเกจ (super admin ตั้งได้)
  const [seatCfg, setSeatCfg] = useState<SeatSetting>(DEFAULT_SEAT_SETTING)
  const seatPrice = { monthly: seatCfg.monthly, yearly: seatCfg.yearly }
  const hasPlanSub = Boolean(org?.stripe_subscription_id)
  const hasSeatSub = Boolean(org?.stripe_seat_subscription_id)
  // ที่นั่งเพิ่ม = subscription เดียว จำนวน = ที่นั่งเพิ่ม "ทั้งหมด" ที่ต้องการ
  // มาจากหน้าจัดการทีมตอนทีมเกินโควตา (/upgrade?seats=3 = ขาดอีก 3) → ตั้งเป็นของเดิม + ที่ขาด
  const [seatQty, setSeatQty] = useState(() => {
    const short = Math.floor(Number(new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('seats')))
    const now = activeExtraSeats(org)
    const want = short >= 1 ? now + short : Math.max(1, now)
    return Math.min(MAX_SEAT_QTY, Math.max(1, want))
  })

  // องค์กรโหลดเสร็จทีหลังหน้า (เปิดลิงก์ตรง/รีเฟรช) → ตั้งค่าเริ่มต้นตามขององค์กรอีกรอบ ครั้งเดียวต่อองค์กร
  const initFor = useRef<string | null>(org?.id ?? null)
  useEffect(() => {
    if (!org?.id || initFor.current === org.id) return
    initFor.current = org.id
    if ((TIERS as number[]).includes(org.plan_tier ?? 0)) setTier(org.plan_tier as Tier)
    if (org.sub_cycle === 'yearly' || org.sub_cycle === 'monthly') setCycle(org.sub_cycle)
    const short = Math.floor(Number(new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('seats')))
    const now = activeExtraSeats(org)
    setSeatQty(Math.min(MAX_SEAT_QTY, Math.max(1, short >= 1 ? now + short : now)))
  }, [org])

  // PromptPay (ใบแจ้งหนี้ทุกรอบ) — ซ่อนจนกว่า super จะเปิดสวิตช์ (เซิร์ฟเวอร์บังคับซ้ำ)
  const [promptpayOn, setPromptpayOn] = useState(false)
  // ช่องทางติดต่อทีมขาย (LINE OA) — super admin ตั้งจากหน้า Super Admin
  const [contact, setContact] = useState(DEFAULT_CONTACT)
  useEffect(() => {
    void fetchPlanPrices().then(setPrices)
    void fetchContactSetting().then(setContact)
    void fetchPromptPayEnabled().then(setPromptpayOn)
    void fetchSeatSetting().then(setSeatCfg)
    try { localStorage.removeItem('hop_charge') } catch { /* รายการค้างของระบบเก่า (PunPay) */ }
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

  // error ขึ้นด้านบนของหน้า แต่ปุ่มอาจอยู่ล่าง (การ์ดที่นั่ง) → เลื่อนให้เห็นทุกครั้ง ไม่ให้ดูเหมือนกดแล้วเงียบ
  const errRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (err) errRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [err])

  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])
  // confirmLoop/ตัวฟังของแอปถูกผูกตอน mount — เรียกผ่าน ref เพื่อได้ refreshProfile ตัวล่าสุด
  // (ตัวแรกสุดอาจยังไม่มี session → รีเฟรชแล้วเงียบ หน้าโชว์แพ็กเกจเก่า)
  const refresh = useRef(refreshProfile)
  refresh.current = refreshProfile

  // เปิดหน้านี้ทุกครั้ง (รวมกลับจากหน้าจัดการการชำระเงิน) → ดึงสถานะจริงจาก Stripe มาเทียบ
  // ไม่พึ่ง webhook อย่างเดียว: webhook อาจมาช้ากว่าหน้า/ไม่ได้ติ๊ก event/portal ตั้งให้ยกเลิกทันที
  // ข้ามตอนกลับจาก Checkout (confirmLoop ทำหน้าที่นั้นอยู่แล้ว)
  const backFromCheckout = useRef(new URLSearchParams(window.location.search).has('stripe'))
  const syncedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!isAdmin || !org?.id || !org.stripe_customer_id || backFromCheckout.current || syncedFor.current === org.id) return
    syncedFor.current = org.id
    void syncBilling()
      .then((r) => {
        setSubMethod({ plan: r.plan?.method, seats: r.seats?.method })
        if (r.changed) void refresh.current()
      })
      .catch(() => { /* ซิงก์ไม่สำเร็จ = ใช้ข้อมูลเดิมไปก่อน (webhook ยังอัปเดตให้อยู่) */ })
  }, [isAdmin, org?.id, org?.stripe_customer_id])

  /** ยืนยันกับเซิร์ฟเวอร์ (ซึ่งถาม Stripe) ว่าจ่ายแล้ว → ให้สิทธิ์ทันที · ลองซ้ำเผื่อใบแจ้งหนี้ยังประมวลผลไม่เสร็จ */
  async function confirmLoop(sessionId: string) {
    setConfirming(true)
    setNotice('กำลังยืนยันการชำระเงินกับ Stripe…')
    try {
      for (let i = 0; i < 10 && alive.current; i++) {
        const r = await confirmCheckout(sessionId)
        if (r.paid) {
          try { localStorage.removeItem(PENDING_KEY) } catch { /* ข้าม */ }
          await refresh.current()
          setDone({ kind: r.kind ?? 'plan', expires: r.expires ?? null, promptpay: sessionId.startsWith('in_') })
          return
        }
        // ยังไม่ได้จ่าย (ปิดหน้าจ่ายเงินไปก่อน) / หน้าจ่ายเงินหมดอายุ / ใบแจ้งหนี้ถูกยกเลิก → เลิกรอ
        // (จ่ายทีหลัง webhook ก็อัปเกรดให้เอง)
        if (['open', 'expired', 'void', 'uncollectible'].includes(r.status ?? '')) {
          try { localStorage.removeItem(PENDING_KEY) } catch { /* ข้าม */ }
          setNotice(sessionId.startsWith('in_')
            ? 'ยังไม่ได้สแกนจ่ายใบแจ้งหนี้ — จ่ายภายหลังได้จากลิงก์ในอีเมล ระบบจะอัปเกรดให้อัตโนมัติ'
            : 'ยังไม่ได้ชำระเงิน — กดเลือกแพ็กเกจใหม่ได้ทุกเมื่อ')
          return
        }
        await sleep(3000)
      }
      setNotice('Stripe ยังประมวลผลไม่เสร็จ — ถ้าจ่ายแล้ว ระบบจะอัปเดตแพ็กเกจให้อัตโนมัติภายในไม่กี่นาที')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'ยืนยันการชำระเงินไม่สำเร็จ')
    } finally {
      if (alive.current) setConfirming(false)
    }
  }

  // กลับจากหน้า Stripe Checkout (เว็บ): /?stripe=success&session_id=cs_…#/upgrade
  // แอปมือถือ: มี session ค้าง (ปิดแอปไประหว่างจ่าย) → ยืนยันต่อ + ยืนยันทุกครั้งที่ปิดหน้าจ่ายเงิน
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const back = q.get('stripe')
    if (back) {
      // ล้าง query ทิ้ง (กดรีเฟรช/แชร์ลิงก์แล้วไม่ยืนยันซ้ำ) — คง hash route ไว้
      window.history.replaceState(null, '', window.location.pathname + window.location.hash)
      const sid = q.get('session_id')
      if (back === 'success' && sid) void confirmLoop(sid)
      else if (back === 'cancel') setNotice('ยกเลิกการชำระเงินแล้ว — ยังไม่มีการตัดบัตร')
      return
    }
    let saved: string | null = null
    try { saved = localStorage.getItem(PENDING_KEY) } catch { saved = null }
    if (saved && (isNativeApp || saved.startsWith('in_'))) void confirmLoop(saved)
    if (!isNativeApp) {
      // เว็บ: กลับจากหน้าใบแจ้งหนี้ PromptPay ด้วยปุ่มย้อนกลับ (หน้าถูกคืนจากแคช ไม่ mount ใหม่) หรือสลับแท็บกลับมา
      const recheck = (e?: Event) => {
        if (e?.type === 'visibilitychange' && document.visibilityState !== 'visible') return
        if (e?.type === 'pageshow' && !(e as PageTransitionEvent).persisted) return
        let id: string | null = null
        try { id = localStorage.getItem(PENDING_KEY) } catch { id = null }
        if (id?.startsWith('in_')) void confirmLoop(id)
      }
      window.addEventListener('pageshow', recheck)
      document.addEventListener('visibilitychange', recheck)
      return () => {
        window.removeEventListener('pageshow', recheck)
        document.removeEventListener('visibilitychange', recheck)
      }
    }
    let off: (() => void) | undefined
    void import('@capacitor/browser').then(async ({ Browser }) => {
      const h = await Browser.addListener('browserFinished', () => {
        let sid: string | null = null
        try { sid = localStorage.getItem(PENDING_KEY) } catch { sid = null }
        if (sid) void confirmLoop(sid)
        else void refresh.current() // ปิดจากหน้าพอร์ทัล/ใบแจ้งหนี้ → ดึงสถานะล่าสุด
      })
      off = () => void h.remove()
    })
    return () => off?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** พาไปหน้าของ Stripe — เว็บ: ไปในแท็บเดิม (ไม่โดนบล็อก popup) · แอป: in-app browser */
  async function goTo(url: string) {
    if (isNativeApp) {
      const { Browser } = await import('@capacitor/browser')
      await Browser.open({ url })
    } else {
      window.location.assign(url)
    }
  }

  /** ผลจากเซิร์ฟเวอร์ → ไปหน้าจ่ายเงิน / แสดงผลสำเร็จ / ให้จ่ายผ่านหน้าใบแจ้งหนี้ */
  async function handleResult(r: CheckoutResult) {
    if (r.pending) {
      // ใบส่วนต่าง PromptPay → จำไว้ ยืนยันตอนกลับมาจากหน้าสแกนจ่าย
      if (r.invoice) { try { localStorage.setItem(PENDING_KEY, r.invoice) } catch { /* ข้าม */ } }
      setInvoiceUrl(r.url ?? null)
      setErr(r.error ?? 'ตัดบัตรส่วนต่างไม่สำเร็จ')
      return
    }
    if (r.updated) {
      await refresh.current()
      if (r.resumed) setNotice('กลับมาต่ออายุอัตโนมัติแล้ว — ระบบจะตัดบัตรรอบถัดไปตามปกติ')
      else setDone({ kind: r.kind ?? 'plan', expires: r.expires ?? null })
      return
    }
    if (r.url) {
      const pendingId = r.invoice ?? (isNativeApp ? r.id : null)
      if (pendingId) {
        try { localStorage.setItem(PENDING_KEY, pendingId) } catch { /* ข้าม */ }
      }
      setNotice(r.invoice ? 'กำลังไปหน้าสแกนจ่าย PromptPay ของ Stripe…' : 'กำลังไปหน้าชำระเงินของ Stripe…')
      await goTo(r.url)
    }
  }

  const planLabel = (p: PlanKey, t: number) => `${p === 'pro' ? 'Pro' : 'Basic'} ≤${t} ทรัพย์`
  const cycleLabel = (c: 'monthly' | 'yearly') => (c === 'yearly' ? 'รายปี' : 'รายเดือน')

  // ข้อความยืนยันก่อนเปลี่ยนในที่เดิม — ไม่รู้ว่าองค์กรจ่ายด้วยบัตรหรือ PromptPay จึงบอกทั้งสองแบบ
  const PRORATE_NOTE = 'ระบบจะคิดส่วนต่างตามวันที่เหลือของรอบนี้ — จ่ายด้วยบัตร: ตัดบัตรที่ผูกไว้ทันที · '
    + 'จ่ายด้วย PromptPay: ออกใบแจ้งหนี้ส่วนต่างให้สแกนจ่าย'

  async function pay(plan: PlanKey, resume = false, method: PayMethod = 'card') {
    // มี subscription แล้ว = เปลี่ยนในที่เดิม คิดส่วนต่างทันที → ถามก่อน (ต่ออายุเฉยๆ ไม่มีการเก็บเงินตอนนี้)
    if (hasPlanSub && !resume && !window.confirm(
      `เปลี่ยนเป็น ${planLabel(plan, tier)} (${cycleLabel(cycle)})?\n\n${PRORATE_NOTE} `
      + '(ลดแพ็กเกจ = ส่วนที่เหลือเป็นเครดิตหักรอบถัดไป)',
    )) return
    setErr(null)
    setInvoiceUrl(null)
    setNotice('')
    setBusy(method === 'promptpay' ? `${plan}:pp` : plan)
    try {
      await handleResult(await startCheckout(plan, tier, cycle, isNativeApp, method))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'เริ่มการชำระเงินไม่สำเร็จ')
    } finally {
      setBusy(null)
    }
  }

  /** ที่นั่งเพิ่ม — subscription แยกจากแพ็กเกจ (ไม่เปลี่ยนแพ็กเกจ/วันหมดอายุของแพ็กเกจ) */
  async function paySeats(method: PayMethod = 'card') {
    if (hasSeatSub && !window.confirm(
      `ปรับที่นั่งเพิ่มเป็นทั้งหมด ${seatQty} ที่นั่ง (${cycleLabel(cycle)})?\n\n${PRORATE_NOTE}`,
    )) return
    setErr(null)
    setInvoiceUrl(null)
    setNotice('')
    setBusy(method === 'promptpay' ? 'seats:pp' : 'seats')
    try {
      await handleResult(await startSeatCheckout(seatQty, cycle, isNativeApp, method))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'เริ่มการชำระเงินไม่สำเร็จ')
    } finally {
      setBusy(null)
    }
  }

  /** ตัดบัตรไม่ผ่าน → พาไปหน้าจ่ายใบแจ้งหนี้ที่ค้างของ Stripe (จ่ายด้วยบัตรใบใหม่ได้) · ไม่มีใบค้าง = เปิดหน้าจัดการบัตรแทน */
  async function payUnpaid() {
    setErr(null)
    setBusy('unpaid')
    try {
      const { url } = await openUnpaidInvoice()
      await goTo(url ?? (await openBillingPortal(isNativeApp)).url)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'เปิดหน้าชำระเงินไม่สำเร็จ')
    } finally {
      setBusy(null)
    }
  }

  async function manageBilling() {
    setErr(null)
    setBusy('portal')
    try {
      const r = await openBillingPortal(isNativeApp)
      await goTo(r.url)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'เปิดหน้าจัดการการชำระเงินไม่สำเร็จ')
    } finally {
      setBusy(null)
    }
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
            <h3>{done.kind === 'seats' ? 'ปรับที่นั่งสำเร็จ!' : 'ชำระเงินสำเร็จ!'}</h3>
            <p className="plan-line">
              {done.kind === 'seats' ? (
                <>องค์กร <b>{org?.name}</b> ตอนนี้ใช้ได้ <b>{seatLimit(org) ?? 'ไม่จำกัด'}</b> ที่นั่ง
                  {done.expires ? ` · ใช้ได้ถึง ${fmtDate(done.expires)}` : ''}</>
              ) : (
                <>องค์กร <b>{org?.name}</b> เป็นแพ็กเกจ{' '}
                  <b>{org?.plan === 'pro' ? 'Pro' : 'Basic'}{org?.plan_tier ? ` ≤${org.plan_tier} ทรัพย์` : ''}</b> แล้ว
                  {done.expires ? ` · ใช้ได้ถึง ${fmtDate(done.expires)}` : ''}</>
              )}
              <br />
              {done.promptpay
                ? 'รอบถัดไประบบส่งใบแจ้งหนี้ PromptPay ทางอีเมล — สแกนจ่ายภายใน 7 วันเพื่อใช้งานต่อ'
                : 'รอบถัดไประบบตัดบัตรให้อัตโนมัติ — ยกเลิกได้ทุกเมื่อ'}
            </p>
            <div className="org-row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
              {done.kind === 'seats' && <button className="btn" onClick={() => navigate('/team')}>ไปเชิญลูกทีม</button>}
              <button className="btn primary" onClick={() => navigate('/')}>เริ่มใช้งาน</button>
            </div>
          </section>
        ) : confirming ? (
          <section className="form-card">
            <h3>กำลังยืนยันการชำระเงิน</h3>
            <p className="plan-line" style={{ minHeight: '1.4em' }}>{notice}</p>
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
              {hasPlanSub && org?.sub_expires_at && (
                <> · {org.sub_cancel_at_period_end
                  ? <b style={{ color: 'var(--danger, #c0392b)' }}>ยกเลิกการต่ออายุแล้ว — ใช้ได้ถึง {fmtDate(org.sub_expires_at)}</b>
                  : subMethod.plan === 'promptpay' ? <>ส่งใบแจ้งหนี้ PromptPay ทางอีเมลทุกรอบ</>
                    : subMethod.plan === 'card' ? <>ต่ออายุอัตโนมัติ (ตัดบัตรทุกรอบ)</>
                      : <>ต่ออายุทุกรอบ</>}</>
              )}
              {/* เคยจ่ายด้วยบัตรแต่ไม่มี subscription แล้ว (ยกเลิกทันที/ตัดบัตรไม่ผ่านจนหมดรอบ) → ใช้ได้ถึงวันที่จ่ายไว้ */}
              {!hasPlanSub && org?.stripe_customer_id && (org?.plan === 'starter' || org?.plan === 'pro')
                && org?.sub_expires_at && org.sub_expires_at >= new Date().toISOString().slice(0, 10) && (
                <> · <b style={{ color: 'var(--danger, #c0392b)' }}>ไม่ต่ออายุอัตโนมัติ — ใช้ได้ถึง {fmtDate(org.sub_expires_at)}</b></>
              )}
            </p>
            {org?.billing_past_due && (
              <div className="auth-error" role="alert" style={{ marginBottom: 12 }}>
                <b>{org.billing_past_due === 'seats' ? 'ค่าที่นั่งเพิ่ม' : 'ค่าแพ็กเกจ'}รอบใหม่ยังชำระไม่สำเร็จ</b> —
                จ่ายด้วยบัตร: Stripe จะลองตัดซ้ำให้ ถ้าบัตรหมดอายุ/วงเงินไม่พอให้ชำระด้วยบัตรใบใหม่ ·
                จ่ายด้วย PromptPay: กด "ชำระเงินตอนนี้" แล้วสแกน QR
                {(() => {
                  const until = org.billing_past_due === 'seats' ? org.extra_seats_expires_at : org.sub_expires_at
                  return until ? <> ภายใน <b>{fmtDate(until)}</b>{org.billing_past_due === 'seats' ? ' ไม่งั้นที่นั่งเพิ่มจะหมดอายุ' : ' ไม่งั้นองค์กรจะถูกล็อก'}</> : null
                })()}
                <div className="org-row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
                  <button className="btn sm primary" disabled={busy !== null} onClick={() => void payUnpaid()}>
                    {busy === 'unpaid' ? 'กำลังเปิด…' : 'ชำระเงินตอนนี้'}
                  </button>
                  <button className="btn sm" disabled={busy !== null} onClick={() => void manageBilling()}>เปลี่ยนบัตรที่ผูกไว้</button>
                </div>
              </div>
            )}
            {org?.stripe_customer_id && (
              <div className="org-row" style={{ flexWrap: 'wrap', marginBottom: 14 }}>
                <button className="btn" disabled={busy !== null} onClick={() => void manageBilling()}>
                  {busy === 'portal' ? 'กำลังเปิด…' : 'จัดการการชำระเงิน (บัตร / ใบเสร็จ / ยกเลิก)'}
                </button>
              </div>
            )}
            {notice && <p className="plan-line" style={{ color: 'var(--purple)' }}>{notice}</p>}
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
            {err && (
              <div className="auth-error" ref={errRef}>
                {err}
                {invoiceUrl && (
                  <div style={{ marginTop: 8 }}>
                    <button className="btn sm primary" onClick={() => void goTo(invoiceUrl)}>เปิดหน้าใบแจ้งหนี้เพื่อชำระ</button>
                  </div>
                )}
              </div>
            )}
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
                  {(() => {
                    // แพ็กเกจ + ระดับ + รอบชำระ ตรงกับที่ใช้อยู่ = ไม่มีอะไรให้เปลี่ยน (ยกเว้นเคยกดยกเลิกต่ออายุ → ต่ออายุได้)
                    const current = hasPlanSub && org?.plan === p.key && org?.plan_tier === tier && org?.sub_cycle === cycle
                    const resume = current && Boolean(org?.sub_cancel_at_period_end)
                    return (
                      <button
                        className={`btn ${current && !resume ? '' : 'primary'}`} style={{ width: '100%' }}
                        disabled={busy !== null || (current && !resume)} onClick={() => void pay(p.key, resume)}
                      >
                        {busy === p.key ? 'กำลังดำเนินการ…'
                          : resume ? 'ต่ออายุแพ็กเกจนี้ต่อ'
                            : current ? '✓ แพ็กเกจปัจจุบัน'
                              : hasPlanSub ? `เปลี่ยนเป็นแพ็กเกจนี้ (${cycleLabel(cycle)})`
                                : 'สมัคร · ชำระด้วยบัตร'}
                      </button>
                    )
                  })()}
                  {/* PromptPay = ใบแจ้งหนี้ทุกรอบ (Stripe ตัดอัตโนมัติไม่ได้) — เฉพาะสมัครใหม่ · super เปิดสวิตช์แล้วเท่านั้น */}
                  {promptpayOn && !hasPlanSub && (
                    <button
                      className="btn" style={{ width: '100%', marginTop: 8 }}
                      disabled={busy !== null} onClick={() => void pay(p.key, false, 'promptpay')}
                    >
                      {busy === `${p.key}:pp` ? 'กำลังออกใบแจ้งหนี้…' : 'หรือจ่ายด้วย PromptPay (ใบแจ้งหนี้ทุกรอบ)'}
                    </button>
                  )}
                </section>
              ))}
            </div>
            {/* ที่นั่งเพิ่ม — subscription แยกจากแพ็กเกจ ไม่เปลี่ยนแพ็กเกจ/วันหมดอายุของแพ็กเกจ */}
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
                {activeExtraSeats(org) > 0 && <> + ซื้อเพิ่มไว้ <b>{activeExtraSeats(org)}</b> ที่นั่ง{hasSeatSub ? (subMethod.seats === 'promptpay' ? ' (ใบแจ้งหนี้ทุกรอบ)' : ' (ต่ออายุทุกรอบ)') : ''}</>}
                {' '}· 1 ที่นั่ง = 1 บัญชี
              </p>
              <div className="org-row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="form-field" style={{ marginBottom: 0, maxWidth: 190 }}>
                  <label>{hasSeatSub ? 'ที่นั่งเพิ่มทั้งหมด (ปรับได้)' : 'จำนวนที่นั่งเพิ่ม'}</label>
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
                  {busy === 'seats' ? 'กำลังดำเนินการ…' : hasSeatSub ? 'ปรับจำนวนที่นั่ง' : 'ซื้อที่นั่ง · ชำระด้วยบัตร'}
                </button>
                {promptpayOn && !hasSeatSub && (
                  <button className="btn" disabled={busy !== null} onClick={() => void paySeats('promptpay')}>
                    {busy === 'seats:pp' ? 'กำลังออกใบแจ้งหนี้…' : 'หรือจ่ายด้วย PromptPay'}
                  </button>
                )}
              </div>
              <p className="plan-line" style={{ marginTop: 10 }}>
                ตัดบัตรอัตโนมัติทุกรอบตามจำนวนที่นั่ง · เลิกใช้ที่นั่งเพิ่ม = ยกเลิกในหน้า "จัดการการชำระเงิน"
                (ใช้ได้ถึงสิ้นรอบ) · หมดอายุแล้วจะ<b>เชิญคนใหม่ไม่ได้</b> แต่ไม่มีใครถูกนำออกจากองค์กร
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
              ชำระด้วยบัตรเครดิต/เดบิตผ่าน Stripe (มาตรฐานความปลอดภัยระดับธนาคาร — HOP ไม่เห็นเลขบัตร) ·
              ตัดบัตรอัตโนมัติทุกรอบ ยกเลิกได้ทุกเมื่อ ใช้ได้ถึงสิ้นรอบที่จ่ายแล้ว · จ่ายรายปีถูกกว่า
              {promptpayOn && <> · เลือกจ่ายด้วย <b>PromptPay</b> ได้: ระบบส่งใบแจ้งหนี้ทางอีเมลทุกรอบ สแกน QR จ่ายภายใน 7 วัน (ไม่ตัดเงินอัตโนมัติ)</>}
            </p>
          </>
        )}
      </div>
    </>
  )
}
