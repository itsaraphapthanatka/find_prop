// ตัวช่วย Stripe ฝั่งเซิร์ฟเวอร์ (subscription ตัดบัตรอัตโนมัติทุกรอบ)
//
// หลักการ:
//  • STRIPE_SECRET_KEY อยู่ใน env ของ Vercel เท่านั้น — client ไม่มีทางเห็น
//  • ราคาคำนวณฝั่งเซิร์ฟเวอร์จาก plan_prices / app_settings 'seats' เสมอ (ไม่เชื่อยอดจาก client)
//  • Price ใน Stripe ใช้ lookup_key คงที่ต่อ (แพ็กเกจ × ระดับ × รอบ) — super แก้ราคาใน DB เมื่อไหร่
//    รอบหน้าที่มีคนกดซื้อจะสร้าง Price ใหม่ให้อัตโนมัติ (ลูกค้าเดิมยังจ่ายราคาเดิมจนกว่าจะเปลี่ยนแพ็กเกจ)
//  • "ให้สิทธิ์" ทำที่เดียว = applyInvoice() เมื่อใบแจ้งหนี้สถานะ paid เท่านั้น (webhook + หน้ายืนยัน เรียกซ้ำได้ — กันซ้ำด้วยเลขใบแจ้งหนี้)

import crypto from 'node:crypto'
import Stripe from 'stripe'
import { patchOrg } from './auth.js'

let client = null

/** Stripe client (null = ยังไม่ได้ตั้ง STRIPE_SECRET_KEY) */
export function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  if (!client) client = new Stripe(key, { maxNetworkRetries: 2, timeout: 20000 })
  return client
}

/** โดเมนของเว็บแอป สำหรับลิงก์กลับจากหน้าจ่ายเงิน */
export function appUrl(req) {
  const fixed = process.env.PUBLIC_APP_URL
  if (fixed) return fixed.replace(/\/+$/, '')
  return `https://${req.headers['x-forwarded-host'] || req.headers.host}`
}

const CYCLE_INTERVAL = { monthly: 'month', yearly: 'year' }
const CYCLE_TH = { monthly: 'รายเดือน', yearly: 'รายปี' }

/**
 * หา/สร้าง Price ของ Stripe ให้ตรงกับราคาปัจจุบันใน DB
 * kind 'plan' → lookup hop_<plan>_<tier>_<cycle> · kind 'seats' → hop_seat_<cycle> (ราคาต่อ 1 ที่นั่ง)
 */
export async function ensurePrice(stripe, { kind, plan, tier, cycle, amount }) {
  const lookup = kind === 'seats' ? `hop_seat_${cycle}` : `hop_${plan}_${tier}_${cycle}`
  const unit = Math.round(Number(amount) * 100) // บาท → สตางค์
  const interval = CYCLE_INTERVAL[cycle]
  const found = (await stripe.prices.list({ lookup_keys: [lookup], active: true, limit: 1 })).data[0]
  if (found && found.unit_amount === unit && found.currency === 'thb' && found.recurring?.interval === interval) {
    return found.id
  }
  // metadata บน Price = แหล่งความจริงว่าใบแจ้งหนี้นี้ให้สิทธิ์อะไร (อ่านใน describeInvoice)
  const metadata = kind === 'seats' ? { kind, cycle } : { kind, plan, tier: String(tier), cycle }
  const params = {
    currency: 'thb',
    unit_amount: unit,
    recurring: { interval },
    lookup_key: lookup,
    transfer_lookup_key: true, // ราคาเปลี่ยน → ย้าย lookup_key มาที่ Price ใหม่ (Price เดิมยังใช้กับลูกค้าเดิมได้)
    metadata,
  }
  if (found) {
    params.product = typeof found.product === 'string' ? found.product : found.product.id
  } else {
    const name = kind === 'seats'
      ? `HOP ที่นั่งทีมเพิ่ม (${CYCLE_TH[cycle]})`
      : `HOP ${plan === 'pro' ? 'Pro' : 'Basic'} ≤${tier} ทรัพย์ (${CYCLE_TH[cycle]})`
    params.product_data = { name, metadata }
  }
  return (await stripe.prices.create(params)).id
}

/** 1 องค์กร = 1 Stripe customer — สร้างครั้งแรกแล้วผูกกับองค์กร */
export async function ensureCustomer(stripe, auth) {
  const { org, orgId, email, s } = auth
  if (org.stripe_customer_id) {
    try {
      const c = await stripe.customers.retrieve(org.stripe_customer_id)
      if (c && !c.deleted) return c.id
    } catch { /* customer หาย (เช่น สลับ test ↔ live key) → สร้างใหม่ */ }
  }
  // idempotency key: Owner กดซ้ำ/เปิดสองแท็บพร้อมกัน → Stripe คืนลูกค้าคนเดิม ไม่สร้างซ้ำ
  // (ผูกกับรหัสลูกค้าเดิมที่กำลังแทนที่ด้วย — ลูกค้าเก่าถูกลบแล้วสร้างใหม่ภายใน 24 ชม. จะได้ไม่ได้ตัวที่ลบไปแล้วกลับมา)
  const params = { name: org.name || undefined, email: email || undefined, metadata: { org_id: orgId } }
  const idempotencyKey = 'hop-customer-' + crypto.createHash('sha256')
    .update(JSON.stringify([orgId, org.stripe_customer_id || null, params.name ?? null, params.email ?? null]))
    .digest('hex').slice(0, 48)
  const c = await stripe.customers.create(params, { idempotencyKey })
  await patchOrg(s, orgId, { stripe_customer_id: c.id })
  return c.id
}

const LIVE_STATUSES = ['active', 'trialing', 'past_due', 'unpaid']
const pickLive = (subs, kind) => subs.find((sub) =>
  LIVE_STATUSES.includes(sub.status) && (sub.metadata?.kind || 'plan') === kind) || null
/** ตั้งยกเลิกปลายรอบไว้ไหม (API ใหม่: portal อาจตั้ง cancel_at แทน cancel_at_period_end) */
const cancelScheduled = (sub) => Boolean(sub?.cancel_at_period_end || sub?.cancel_at)
const PAST_DUE = ['past_due', 'unpaid'] // ตัดบัตรรอบใหม่ไม่ผ่าน (Stripe กำลังลองตัดซ้ำ)

/** สถานะที่ต้องเขียนลงองค์กร จากรายการ subscription ทั้งหมดของลูกค้า (แหล่งความจริง = Stripe) */
function billingState(subs) {
  const plan = pickLive(subs, 'plan')
  const seats = pickLive(subs, 'seats')
  return {
    plan,
    seats,
    next: {
      stripe_subscription_id: plan?.id ?? null,
      sub_cancel_at_period_end: plan ? cancelScheduled(plan) : false,
      stripe_seat_subscription_id: seats?.id ?? null,
      // แพ็กเกจสำคัญกว่า (ไม่จ่าย = ล็อกทั้งองค์กร) → เตือนแพ็กเกจก่อน
      billing_past_due: PAST_DUE.includes(plan?.status) ? 'plan' : PAST_DUE.includes(seats?.status) ? 'seats' : null,
    },
  }
}

/** subscription ที่ยังใช้งานของลูกค้า แยกตามชนิด ('plan' | 'seats') — ไม่มี = null */
export async function findLiveSubscription(stripe, customerId, kind) {
  const list = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 20 })
  return pickLive(list.data, kind)
}

/**
 * ดึงสถานะจริงจาก Stripe มาเขียนทับในองค์กร (เปิดหน้าอัปเกรดทุกครั้ง) — ไม่พึ่ง webhook อย่างเดียว
 * กันกรณี webhook ไม่ได้ติ๊ก event / มาช้ากว่าหน้า / portal ตั้งให้ยกเลิกทันที
 * แตะเฉพาะคอลัมน์ stripe_* + ธงยกเลิก — ไม่แตะแพ็กเกจ/วันหมดอายุ (สิทธิ์ที่จ่ายแล้วยังอยู่ถึงวันหมดอายุ)
 */
export async function syncFromStripe(stripe, auth) {
  const { org, orgId, s } = auth
  if (!org.stripe_customer_id) return { changed: false, customer: null }
  let subs
  try {
    subs = (await stripe.subscriptions.list({ customer: org.stripe_customer_id, status: 'all', limit: 20 })).data
  } catch (e) {
    // ลูกค้าไม่มีในโหมดนี้ (เช่น สลับคีย์ test → live) → ล้างรหัสเก่าทิ้ง ครั้งหน้ากดซื้อจะสร้างลูกค้าใหม่ให้
    if (e?.code !== 'resource_missing') throw e
    await patchOrg(s, orgId, {
      stripe_customer_id: null, stripe_subscription_id: null,
      stripe_seat_subscription_id: null, sub_cancel_at_period_end: false, billing_past_due: null,
    })
    return { changed: true, customer: 'missing' }
  }
  const { plan, seats, next } = billingState(subs)
  const changed = next.stripe_subscription_id !== (org.stripe_subscription_id ?? null)
    || next.sub_cancel_at_period_end !== Boolean(org.sub_cancel_at_period_end)
    || next.stripe_seat_subscription_id !== (org.stripe_seat_subscription_id ?? null)
    || next.billing_past_due !== (org.billing_past_due ?? null)
  if (changed) await patchOrg(s, orgId, next)
  return {
    changed,
    pastDue: next.billing_past_due,
    plan: plan ? { status: plan.status, cancel: cancelScheduled(plan) } : null,
    seats: seats ? { status: seats.status, cancel: cancelScheduled(seats) } : null,
  }
}

/** ใบแจ้งหนี้ที่ค้างจ่าย (ตัดบัตรไม่ผ่าน) ล่าสุดของลูกค้า → ลิงก์หน้าจ่ายของ Stripe · ไม่มี = null */
export async function openInvoiceUrl(stripe, customerId) {
  if (!customerId) return null
  const list = await stripe.invoices.list({ customer: customerId, status: 'open', limit: 1 })
  return list.data[0]?.hosted_invoice_url ?? null
}

const idOf = (x) => (typeof x === 'string' ? x : x?.id) || null

/** subscription id ของใบแจ้งหนี้ (API ใหม่อยู่ใต้ parent.subscription_details) */
export function invoiceSubscriptionId(invoice) {
  return idOf(invoice?.parent?.subscription_details?.subscription)
    || idOf(invoice?.subscription)
    || idOf(invoice?.lines?.data?.find((l) => l.subscription)?.subscription)
}

/**
 * อ่านว่าใบแจ้งหนี้ (ที่จ่ายแล้ว) ให้สิทธิ์อะไร
 * ใช้บรรทัดยอดบวก (= สถานะใหม่ เช่น ส่วนต่างตอนอัปเกรด/ต่ออายุ) → Price metadata
 * คืน null = ไม่ใช่ใบของ HOP
 */
export async function describeInvoice(stripe, invoice) {
  const subId = invoiceSubscriptionId(invoice)
  if (!subId) return null
  const sub = await stripe.subscriptions.retrieve(subId)
  const orgId = sub.metadata?.org_id
  if (!orgId) return null

  const lines = invoice.lines?.data ?? []
  const positive = lines.filter((l) => l.amount > 0)
  const pick = (positive.length ? positive : lines.filter((l) => l.amount >= 0)).at(-1)
  const item = sub.items?.data?.[0]
  let price = item?.price ?? null
  const linePriceId = idOf(pick?.pricing?.price_details?.price)
  if (linePriceId && linePriceId !== price?.id) price = await stripe.prices.retrieve(linePriceId)
  const pm = price?.metadata ?? {}

  const kind = pm.kind || sub.metadata?.kind || 'plan'
  const periodEnd = Math.max(0, ...lines.map((l) => Number(l.period?.end) || 0)) || item?.current_period_end
  return {
    orgId,
    kind,
    plan: pm.plan || sub.metadata?.plan || null,
    tier: Number(pm.tier || sub.metadata?.tier) || null,
    cycle: pm.cycle || sub.metadata?.cycle || 'monthly',
    qty: Number(pick?.quantity ?? item?.quantity ?? 1) || 1,
    periodEnd,
    customer: idOf(sub.customer),
    subscription: sub.id,
  }
}

/** วันที่ (YYYY-MM-DD ตามเวลาไทย) จาก unix seconds */
function bkkDate(unix) {
  return new Date(Number(unix) * 1000 + 7 * 3600 * 1000).toISOString().slice(0, 10)
}

/**
 * ใบแจ้งหนี้จ่ายแล้ว → ให้สิทธิ์ผ่าน RPC apply_stripe_invoice (idempotent ด้วยเลขใบแจ้งหนี้)
 * expectOrg = ถ้าระบุ ต้องตรงกับองค์กรในใบ (หน้ายืนยันของผู้ใช้ กันยืนยันใบขององค์กรอื่น)
 */
export async function applyInvoice(stripe, s, invoice, expectOrg = null) {
  if (!invoice || invoice.status !== 'paid') return { applied: false, paid: false }
  const d = await describeInvoice(stripe, invoice)
  if (!d) return { applied: false, paid: true, note: 'not-hop' }
  if (expectOrg && d.orgId !== expectOrg) return { applied: false, paid: true, note: 'other-org' }
  if (!d.periodEnd) throw new Error('ไม่พบวันสิ้นรอบของใบแจ้งหนี้')

  const r = await fetch(`${s.url}/rest/v1/rpc/apply_stripe_invoice`, {
    method: 'POST',
    headers: { ...s.svc, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_invoice_id: invoice.id,
      p_org: d.orgId,
      p_kind: d.kind,
      p_plan: d.kind === 'plan' ? d.plan : null,
      p_tier: d.kind === 'plan' ? d.tier : null,
      p_qty: d.kind === 'seats' ? d.qty : null,
      p_months: d.cycle === 'yearly' ? 12 : 1,
      p_period_end: bkkDate(d.periodEnd),
      p_amount: (Number(invoice.amount_paid) || 0) / 100,
      p_customer: d.customer,
      p_subscription: d.subscription,
    }),
  })
  if (!r.ok) throw new Error(`บันทึกการชำระเงินไม่สำเร็จ (${r.status}) ${(await r.text().catch(() => '')).slice(0, 300)}`)
  const row = ((await r.json().catch(() => [])) || [])[0]
  return { applied: Boolean(row?.applied), paid: true, expires: row?.expires ?? null, kind: d.kind, qty: d.qty }
}

/**
 * subscription เปลี่ยนสถานะ (ยกเลิกปลายรอบ / ยกเลิกแล้ว / ตัดบัตรไม่ผ่าน / กลับมาปกติ) → สะท้อนลงองค์กร
 * อ่านรายการ subscription "ปัจจุบัน" ของลูกค้าจาก Stripe ทุกครั้ง แทนการเชื่อข้อมูลใน event
 * → event มาสลับลำดับ/มาซ้ำก็ได้ผลถูกเสมอ · ไม่ตัดสิทธิ์ทันที: ใช้ได้ถึงวันหมดอายุที่จ่ายไว้ แล้วระบบล็อกตามกติกาเดิม
 */
export async function syncSubscription(stripe, s, sub) {
  const orgId = sub?.metadata?.org_id
  const customer = idOf(sub?.customer)
  if (!orgId || !customer) return { ok: true, note: 'not-hop' }
  const subs = (await stripe.subscriptions.list({ customer, status: 'all', limit: 20 })).data
  const { next } = billingState(subs)
  const matched = await patchOrg(s, orgId, next)
  // โชว์ในหน้า Event deliveries ของ Stripe — matched 0 = ไม่พบองค์กร (ไว้ไล่ปัญหา)
  return { ok: true, status: sub.status, ...next, matched }
}
