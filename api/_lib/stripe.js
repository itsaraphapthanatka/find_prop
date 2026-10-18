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

// ── PromptPay = subscription แบบ "ส่งใบแจ้งหนี้" (collection_method send_invoice) ──
// Stripe ตัด PromptPay อัตโนมัติไม่ได้ (ลูกค้าต้องสแกน QR เอง) → ทุกรอบ Stripe ออกใบแจ้งหนี้ ส่งอีเมล ให้จ่ายภายใน N วัน
// สิทธิ์ขยายเพิ่ม N วัน (+3 เดิม) เพื่อไม่ให้ล็อกองค์กรก่อนครบกำหนดจ่าย
export const PROMPTPAY_DUE_DAYS = 7
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
/** สร้างก่อน = มาก่อน (created เท่ากัน → เทียบ id) — ใช้ตัดสินว่าตัวไหนคือ subscription ตัวจริงเมื่อมีซ้ำ */
const olderFirst = (a, b) => (a.created - b.created) || (a.id < b.id ? -1 : 1)
/** subscription ที่ยังใช้งานของชนิดนี้ — มีหลายตัว (จ่าย Checkout ซ้อน) = เอาตัวที่สร้างก่อน ให้ตรงกับ refundIfDuplicate */
const pickLive = (subs, kind) => subs
  .filter((sub) => LIVE_STATUSES.includes(sub.status) && (sub.metadata?.kind || 'plan') === kind)
  .sort(olderFirst)[0] || null
/** ตั้งยกเลิกปลายรอบไว้ไหม (API ใหม่: portal อาจตั้ง cancel_at แทน cancel_at_period_end) */
const cancelScheduled = (sub) => Boolean(sub?.cancel_at_period_end || sub?.cancel_at)
const PAST_DUE = ['past_due', 'unpaid'] // ตัดบัตรรอบใหม่ไม่ผ่าน (Stripe กำลังลองตัดซ้ำ) / ใบแจ้งหนี้เกินกำหนด
/** 'promptpay' = ส่งใบแจ้งหนี้ทุกรอบ · 'card' = ตัดบัตรอัตโนมัติ (หน้าเว็บใช้เลือกข้อความให้ตรง) */
const payMethodOf = (sub) => (sub?.collection_method === 'send_invoice' ? 'promptpay' : 'card')

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
 * ปิดหน้าจ่าย (Checkout Session) ที่ยังเปิดค้างของชนิดเดียวกัน ก่อนเริ่มรายการใหม่
 * เปิดหน้าอัปเกรดสองแท็บแล้วจ่ายครบทั้งคู่ = ได้ subscription ซ้ำ ตัดเงินสองทาง → ให้จ่ายได้แค่หน้าล่าสุด
 * (ชั้นแรก · ถ้ายังหลุดมาได้ applyInvoice จะยกเลิก + คืนเงินตัวซ้ำให้เอง)
 */
export async function expireOpenCheckouts(stripe, customer, kind) {
  const open = await stripe.checkout.sessions.list({ customer, status: 'open', limit: 20 })
  await Promise.all(open.data
    .filter((cs) => cs.mode === 'subscription' && (cs.metadata?.kind || 'plan') === kind)
    // จ่ายเสร็จพอดี / หมดอายุไปก่อน = Stripe ตอบ error → ข้าม (กรณีนั้น refundIfDuplicate รับช่วงต่อ)
    .map((cs) => stripe.checkout.sessions.expire(cs.id).catch(() => null)))
}

// ── Customer Portal: ใช้ configuration ของ HOP เอง ไม่พึ่งค่าตั้งใน Dashboard ──
// เปลี่ยนแพ็กเกจ/จำนวนที่นั่งต้องทำที่หน้าอัปเกรดของเราเท่านั้น (คิดส่วนต่าง + pending_if_incomplete กันได้ของโดยไม่จ่าย)
// ถ้าใครไปเปิด "เปลี่ยนแพ็กเกจ" ใน Dashboard ภายหลัง ลูกค้าจะข้ามการกันนี้ได้ → ล็อกไว้ในโค้ด
// ค่าที่เหลือตั้งให้ตรงกับ configuration Default บน Live (อ่านมาเทียบ 2026-10-18)
// แก้ค่าในนี้ = ต้องเปลี่ยนเลขรุ่น (configuration เดิมไม่ถูกแก้ตาม — ระบบสร้างตัวใหม่ตามรุ่น)
const PORTAL_CONFIG_VERSION = 'v1'
let portalConfigId = null

/** configuration ของ Portal ตามรุ่นปัจจุบัน — หาเจอใช้ตัวเดิม ไม่เจอสร้างใหม่ (แยก Test/Live เอง) */
export async function ensurePortalConfig(stripe) {
  if (portalConfigId) return portalConfigId
  for await (const c of stripe.billingPortal.configurations.list({ active: true, limit: 100 })) {
    if (c.metadata?.hop_portal === PORTAL_CONFIG_VERSION) return (portalConfigId = c.id)
  }
  const c = await stripe.billingPortal.configurations.create({
    name: `HOP ${PORTAL_CONFIG_VERSION} — เปลี่ยนบัตร / ใบเสร็จ / ยกเลิกปลายรอบ (สร้างจากโค้ด)`,
    metadata: { hop_portal: PORTAL_CONFIG_VERSION },
    features: {
      customer_update: { enabled: true, allowed_updates: ['name', 'email', 'address', 'phone'] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: {
        enabled: true,
        mode: 'at_period_end',
        proration_behavior: 'none',
        cancellation_reason: { enabled: true, options: ['too_expensive', 'switched_service', 'unused', 'other'] },
      },
      subscription_update: { enabled: false },
    },
  }, { idempotencyKey: `hop-portal-config-${PORTAL_CONFIG_VERSION}` })
  return (portalConfigId = c.id)
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
    plan: plan ? { status: plan.status, cancel: cancelScheduled(plan), method: payMethodOf(plan) } : null,
    seats: seats ? { status: seats.status, cancel: cancelScheduled(seats), method: payMethodOf(seats) } : null,
  }
}

/** ใบแจ้งหนี้ร่าง → ออกจริงทันที (ไม่รอ Stripe ออกเองราว 1 ชม.) เพื่อให้มีลิงก์หน้าจ่ายให้ลูกค้าตอนนี้เลย */
export async function finalizeIfDraft(stripe, inv) {
  if (inv && typeof inv === 'object' && inv.status === 'draft') return stripe.invoices.finalizeInvoice(inv.id)
  return inv
}

/**
 * subscription แบบส่งใบแจ้งหนี้ (PromptPay) ที่สมัครค้างไว้แต่ "ไม่เคยจ่ายเลย" (เปิดหน้าจ่ายแล้วปิดไป)
 * → ยกเลิกใบที่ค้าง + ยกเลิก subscription ทิ้ง ให้เริ่มใหม่ได้สะอาด (ไม่งั้นค้างเป็นของที่ต้องจ่ายและขึ้นแถบเตือน)
 * คืน true = ทิ้งแล้ว · false = เคยจ่ายแล้ว (เป็นลูกค้าจริง ห้ามแตะ)
 */
export async function discardIfNeverPaid(stripe, sub) {
  if (!sub || sub.collection_method !== 'send_invoice') return false
  const paid = await stripe.invoices.list({ subscription: sub.id, status: 'paid', limit: 1 })
  if (paid.data.length) return false
  const open = await stripe.invoices.list({ subscription: sub.id, status: 'open', limit: 10 })
  for (const inv of open.data) await stripe.invoices.voidInvoice(inv.id)
  await stripe.subscriptions.cancel(sub.id)
  return true
}

/** สมัครแบบจ่ายด้วย PromptPay → ออกใบแจ้งหนี้ใบแรกทันที คืนใบแจ้งหนี้ (มี hosted_invoice_url ไว้ให้สแกนจ่าย) */
export async function startInvoiceSubscription(stripe, { customer, priceId, qty, orgId, kind }) {
  const sub = await stripe.subscriptions.create({
    customer,
    items: [{ price: priceId, quantity: qty }],
    collection_method: 'send_invoice',
    days_until_due: PROMPTPAY_DUE_DAYS,
    payment_settings: { payment_method_types: ['promptpay'] },
    metadata: { org_id: orgId, kind, method: 'promptpay' },
    expand: ['latest_invoice'],
  })
  return finalizeIfDraft(stripe, sub.latest_invoice)
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
  // แบบส่งใบแจ้งหนี้ (PromptPay): รอบใหม่ออกใบตอนสิ้นรอบ + ให้เวลาจ่าย days_until_due วัน → ขยายสิทธิ์เท่านั้น
  const graceDays = sub.collection_method === 'send_invoice' ? Number(sub.days_until_due) || 0 : 0
  return {
    graceDays,
    orgId,
    kind,
    plan: pm.plan || sub.metadata?.plan || null,
    tier: Number(pm.tier || sub.metadata?.tier) || null,
    cycle: pm.cycle || sub.metadata?.cycle || 'monthly',
    qty: Number(pick?.quantity ?? item?.quantity ?? 1) || 1,
    periodEnd,
    customer: idOf(sub.customer),
    subscription: sub.id,
    sub,
  }
}

/** ตัดบัตรอัตโนมัติ (ไม่ใช่ PromptPay ส่งใบแจ้งหนี้) */
const isCardSub = (sub) => sub?.collection_method !== 'send_invoice'

/**
 * subscription ที่ใบนี้สังกัดเป็น "ตัวซ้ำ" ไหม (จ่าย Checkout สองแท็บพร้อมกัน หลุด expireOpenCheckouts มาได้)
 * ตัวจริง = ตัวที่ยังใช้งานและสร้างก่อน · ตัวซ้ำ = ชนิดเดียวกัน สร้างทีหลัง → ยกเลิกทันที + คืนเงินเต็มจำนวน ไม่ให้สิทธิ์
 * จัดการอัตโนมัติเฉพาะ "บัตรทั้งคู่" — PromptPay ลูกค้าต้องสแกนจ่ายเองทีละใบ ไม่ใช่การตัดเงินซ้ำโดยไม่ตั้งใจ
 * เรียกซ้ำได้: ตัวซ้ำถูกติดป้าย metadata ไว้ก่อนยกเลิก · คืนเงินใช้ idempotency key + ข้ามถ้าคืนไปแล้ว
 * คืน null = ไม่ใช่ตัวซ้ำ · คืน id ตัวจริง = เป็นตัวซ้ำ (ยกเลิก + คืนเงินแล้ว)
 */
async function refundIfDuplicate(stripe, invoice, d) {
  const sub = d.sub
  let keep = sub.metadata?.hop_duplicate_of || null
  if (!keep) {
    if (!isCardSub(sub)) return null
    const subs = (await stripe.subscriptions.list({ customer: d.customer, status: 'all', limit: 20 })).data
    const first = pickLive(subs, d.kind)
    // ไม่มีตัวอื่น / ตัวนี้คือตัวจริง / ใบของ subscription เก่ากว่า (เช่น ตัวที่ยกเลิกไปแล้ว ส่ง webhook ซ้ำ) = ปกติ
    if (!first || first.id === sub.id || olderFirst(sub, first) < 0 || !isCardSub(first)) return null
    keep = first.id
    // ติดป้ายก่อนยกเลิก (subscription ที่ยกเลิกแล้วแก้ metadata ไม่ได้) → รอบหน้ารู้ทันทีว่าเป็นตัวซ้ำ
    if (sub.status !== 'canceled') await stripe.subscriptions.update(sub.id, { metadata: { hop_duplicate_of: keep } })
  }
  if (sub.status !== 'canceled') {
    await stripe.subscriptions.cancel(sub.id, {
      cancellation_details: { comment: `HOP: จ่ายซ้ำกับ ${keep} (เปิดหน้าจ่ายหลายแท็บ) — ยกเลิก + คืนเงินอัตโนมัติ` },
    }).catch((e) => { if (e?.code !== 'resource_missing') throw e })
  }
  const pays = await stripe.invoicePayments.list({ invoice: invoice.id, status: 'paid', limit: 10 })
  for (const p of pays.data) {
    const pi = idOf(p.payment?.payment_intent)
    const charge = idOf(p.payment?.charge)
    if (!pi && !charge) continue
    try {
      await stripe.refunds.create(
        { ...(pi ? { payment_intent: pi } : { charge }), reason: 'duplicate', metadata: { hop_duplicate_of: keep, invoice: invoice.id } },
        { idempotencyKey: `hop-dup-refund-${p.id}` },
      )
    } catch (e) {
      if (e?.code !== 'charge_already_refunded') throw e
    }
  }
  console.warn('[stripe] จ่ายซ้ำ — ยกเลิก + คืนเงินแล้ว', { invoice: invoice.id, sub: sub.id, keep })
  return keep
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
  const keep = await refundIfDuplicate(stripe, invoice, d)
  if (keep) return { applied: false, paid: true, duplicate: true, kind: d.kind, note: `duplicate-of ${keep}` }
  if (!d.periodEnd) throw new Error('ไม่พบวันสิ้นรอบของใบแจ้งหนี้')
  // Price ไม่มี metadata (เช่น สร้าง Price เองใน Dashboard) → ห้ามส่งค่าว่างไปตั้งแพ็กเกจ · 500 ให้ Stripe ส่ง webhook ซ้ำหลังแก้
  if (d.kind === 'plan' && !(d.plan && d.tier)) {
    throw new Error(`ใบแจ้งหนี้ ${invoice.id}: Price ไม่มี metadata plan/tier — ต้องเป็น Price ที่ระบบสร้าง (lookup hop_…)`)
  }

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
      p_period_end: bkkDate(d.periodEnd + d.graceDays * 86400),
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
