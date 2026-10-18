// ตัวช่วย Stripe ฝั่งเซิร์ฟเวอร์ (subscription ตัดบัตรอัตโนมัติทุกรอบ)
//
// หลักการ:
//  • STRIPE_SECRET_KEY อยู่ใน env ของ Vercel เท่านั้น — client ไม่มีทางเห็น
//  • ราคาคำนวณฝั่งเซิร์ฟเวอร์จาก plan_prices / app_settings 'seats' เสมอ (ไม่เชื่อยอดจาก client)
//  • Product คงที่ต่อ (แพ็กเกจ × ระดับ) · Price ใต้ Product นั้นใช้ lookup_key คงที่ต่อรอบบิล — super แก้ราคาใน DB เมื่อไหร่
//    รอบหน้าที่มีคนกดซื้อจะสร้าง Price ใหม่ให้อัตโนมัติ (ลูกค้าเดิมยังจ่ายราคาเดิมจนกว่าจะเปลี่ยนแพ็กเกจ)
//  • "ให้สิทธิ์" ทำที่เดียว = applyInvoice() เมื่อใบแจ้งหนี้สถานะ paid เท่านั้น (webhook + หน้ายืนยัน เรียกซ้ำได้ — กันซ้ำด้วยเลขใบแจ้งหนี้)

import crypto from 'node:crypto'
import Stripe from 'stripe'
import { patchOrg } from './auth.js'
import { TIERS } from './prices.js'

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

/**
 * Product คงที่ 1 ตัวต่อแพ็กเกจ × ระดับ (ไม่แยกรอบบิล) — ราคารายเดือน/รายปีเป็น Price 2 ตัวใต้ Product เดียวกัน
 * ตามที่ Stripe แนะนำ: ใบแจ้งหนี้/รายงานแยกแพ็กเกจได้ชัด · ตั้ง id เอง (hop_starter_100, hop_seat) จะได้หาเจอโดยไม่ต้องค้น
 */
function productOf(kind, plan, tier) {
  if (kind === 'seats') return { id: 'hop_seat', name: 'HOP ที่นั่งทีมเพิ่ม', metadata: { kind } }
  return {
    id: `hop_${plan}_${tier}`,
    name: `HOP ${plan === 'pro' ? 'Pro' : 'Basic'} ≤${tier} ทรัพย์`,
    metadata: { kind, plan, tier: String(tier) },
  }
}

async function ensureProduct(stripe, product) {
  try {
    const found = await stripe.products.retrieve(product.id)
    if (!found.active) await stripe.products.update(product.id, { active: true })
    return
  } catch (e) {
    if (e?.code !== 'resource_missing') throw e
  }
  try {
    await stripe.products.create(product)
  } catch (e) {
    if (e?.code !== 'resource_already_exists') throw e // สองคำขอสร้างพร้อมกัน — อีกคำขอสร้างไปแล้ว ใช้ตัวนั้นได้เลย
  }
}

/**
 * หา/สร้าง Price ของ Stripe ให้ตรงกับราคาปัจจุบันใน DB — คืน Price object
 * kind 'plan' → lookup hop_<plan>_<tier>_<cycle> · kind 'seats' → hop_seat_<cycle> (ราคาต่อ 1 ที่นั่ง)
 * Price เก่าที่อยู่ใต้ Product แบบแยกรอบบิล (ก่อน 2026-10-18) → สร้างตัวใหม่ใต้ Product คงที่แล้วย้าย lookup_key มา
 * (ลูกค้าเดิมยังจ่าย Price เก่าต่อได้ตามปกติ)
 */
export async function ensurePrice(stripe, { kind, plan, tier, cycle, amount }) {
  const lookup = kind === 'seats' ? `hop_seat_${cycle}` : `hop_${plan}_${tier}_${cycle}`
  const unit = Math.round(Number(amount) * 100) // บาท → สตางค์
  const interval = CYCLE_INTERVAL[cycle]
  const product = productOf(kind, plan, tier)
  const found = (await stripe.prices.list({ lookup_keys: [lookup], active: true, limit: 1 })).data[0]
  if (found && idOf(found.product) === product.id && found.unit_amount === unit
    && found.currency === 'thb' && found.recurring?.interval === interval) {
    return found
  }
  await ensureProduct(stripe, product)
  // metadata บน Price = แหล่งความจริงว่าใบแจ้งหนี้นี้ให้สิทธิ์อะไร (อ่านใน describeInvoice)
  const metadata = kind === 'seats' ? { kind, cycle } : { kind, plan, tier: String(tier), cycle }
  return stripe.prices.create({
    product: product.id,
    currency: 'thb',
    unit_amount: unit,
    recurring: { interval },
    lookup_key: lookup,
    transfer_lookup_key: true, // ราคาเปลี่ยน → ย้าย lookup_key มาที่ Price ใหม่ (Price เดิมยังใช้กับลูกค้าเดิมได้)
    metadata,
  })
}

/**
 * ราคาเดียวกันในความหมายของ HOP (ชนิด/แพ็กเกจ/ระดับ/รอบ/ยอดตรงกัน) แม้เป็นคนละ Price id
 * — ลูกค้าเดิมที่ยังอยู่บน Price เก่า (ก่อนย้ายไป Product คงที่) กดแพ็กเกจเดิม = ไม่ใช่การเปลี่ยนแพ็กเกจ
 */
export function samePrice(a, b) {
  if (!a || !b) return false
  if (a.id === b.id) return true
  const m = a.metadata ?? {}
  const n = b.metadata ?? {}
  return a.unit_amount === b.unit_amount && a.currency === b.currency
    && a.recurring?.interval === b.recurring?.interval
    && (m.kind || 'plan') === (n.kind || 'plan')
    && (m.plan ?? null) === (n.plan ?? null)
    && (m.tier ?? null) === (n.tier ?? null)
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
/**
 * ชนิดของ subscription: 'plan' | 'seats' | 'enterprise'
 * ป้ายบน subscription > metadata ของ Price > 'plan' (subscription เก่า/ตั้งเองที่ไม่มีป้าย นับเป็นแพ็กเกจตามเดิม)
 * Enterprise จาก Quote ที่ Price ไม่มีป้าย → stampEnterprise ดูจาก Product แล้วติดป้ายให้ก่อน
 */
const kindOf = (sub) => sub?.metadata?.kind || sub?.items?.data?.[0]?.price?.metadata?.kind || 'plan'
/** นับเป็น "แพ็กเกจ" ขององค์กร (ที่นั่งเพิ่มผูกกับทั้งสองแบบ) */
const PLAN_KINDS = ['plan', 'enterprise']
/** subscription ที่ยังใช้งานของชนิดนี้ — มีหลายตัว (จ่าย Checkout ซ้อน) = เอาตัวที่สร้างก่อน ให้ตรงกับ refundIfDuplicate */
const pickLive = (subs, kind) => subs
  .filter((sub) => LIVE_STATUSES.includes(sub.status) && kindOf(sub) === kind)
  .sort(olderFirst)[0] || null
/** ตั้งยกเลิกปลายรอบไว้ไหม (API ใหม่: portal อาจตั้ง cancel_at แทน cancel_at_period_end) */
const cancelScheduled = (sub) => Boolean(sub?.cancel_at_period_end || sub?.cancel_at)
const PAST_DUE = ['past_due', 'unpaid'] // ตัดบัตรรอบใหม่ไม่ผ่าน (Stripe กำลังลองตัดซ้ำ) / ใบแจ้งหนี้เกินกำหนด
/** 'promptpay' = ส่งใบแจ้งหนี้ทุกรอบ · 'card' = ตัดบัตรอัตโนมัติ (หน้าเว็บใช้เลือกข้อความให้ตรง) */
const payMethodOf = (sub) => (sub?.collection_method === 'send_invoice' ? 'promptpay' : 'card')

/** สถานะที่ต้องเขียนลงองค์กร จากรายการ subscription ทั้งหมดของลูกค้า (แหล่งความจริง = Stripe) */
function billingState(subs) {
  // Enterprise ที่ยังใช้งาน = แพ็กเกจหลักขององค์กร (Basic/Pro ตัวเก่าที่รอหมดรอบ ไม่ใช่ตัวที่ต้องแสดง)
  const plan = pickLive(subs, 'enterprise') || pickLive(subs, 'plan')
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

// ── ดีล Enterprise (ทีมงานทำ Quote ใน Stripe Dashboard) ──
// Product "HOP Enterprise" ติด metadata kind=enterprise ครั้งเดียว → Quote ที่ลูกค้ายอมรับได้ subscription ที่ไม่มีป้ายของ HOP
// ระบบติดป้าย kind/org_id ให้เองครั้งแรกที่เจอ แล้วโค้ดส่วนอื่นอ่านจากป้ายต่อ (ชนิด/ที่นั่ง/ต่ออายุ/ตัดบัตรไม่ผ่าน)

/** องค์กรของลูกค้า Stripe: metadata org_id ของลูกค้า (ลูกค้าที่ HOP สร้าง) > องค์กรที่ผูก stripe_customer_id ไว้ · ไม่เจอ = null */
async function orgOfCustomer(stripe, s, customerId) {
  if (!customerId) return null
  const c = await stripe.customers.retrieve(customerId).catch(() => null)
  if (c && !c.deleted && c.metadata?.org_id) return c.metadata.org_id
  if (!s) return null
  const r = await fetch(`${s.url}/rest/v1/organizations?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=id`, {
    headers: s.svc,
  }).catch(() => null)
  if (!r?.ok) return null
  return ((await r.json().catch(() => [])) || [])[0]?.id ?? null
}

/**
 * subscription ที่ยังไม่มีป้ายของ HOP แต่เป็น Product/Price ที่ติด kind=enterprise → ติดป้าย kind + org_id (แก้ใน Stripe + ในรายการที่ส่งมา)
 * orgHint = รู้องค์กรอยู่แล้ว (ลิสต์จากลูกค้าขององค์กรนั้น) · ไม่ใช่ Enterprise / หาองค์กรไม่เจอ = ไม่แตะ
 */
async function stampEnterprise(stripe, s, subs, orgHint = null) {
  const productKind = new Map()
  for (const sub of subs) {
    if (sub.metadata?.kind && sub.metadata?.org_id) continue
    const price = sub.items?.data?.[0]?.price
    let kind = sub.metadata?.kind || price?.metadata?.kind || null
    const pid = idOf(price?.product)
    if (!kind && pid) {
      if (!productKind.has(pid)) {
        const prod = typeof price.product === 'object' ? price.product : await stripe.products.retrieve(pid).catch(() => null)
        productKind.set(pid, prod?.metadata?.kind || null)
      }
      kind = productKind.get(pid)
    }
    if (kind !== 'enterprise') continue
    const orgId = sub.metadata?.org_id || orgHint || await orgOfCustomer(stripe, s, idOf(sub.customer))
    if (!orgId) continue
    const meta = { kind: 'enterprise', org_id: orgId }
    // subscription ที่จบแล้วแก้ metadata ไม่ได้ — ติดป้ายในหน่วยความจำอย่างเดียวพอ (ใช้แค่ในรอบนี้)
    if (!['canceled', 'incomplete_expired'].includes(sub.status)) await stripe.subscriptions.update(sub.id, { metadata: meta })
    sub.metadata = { ...(sub.metadata || {}), ...meta }
  }
  return subs
}

/** ติดป้าย Enterprise แบบไม่ทำให้งานหลักล้ม (ติดไม่สำเร็จ = ใช้ชนิดจาก Price metadata ไปก่อน ครั้งหน้าลองใหม่) */
async function stampEnterpriseSafe(stripe, s, subs, orgHint = null) {
  try {
    await stampEnterprise(stripe, s, subs, orgHint)
  } catch (e) {
    console.error('[stripe] ติดป้าย Enterprise ไม่สำเร็จ', e?.raw?.message || e?.message || e)
  }
  return subs
}

/** subscription Enterprise ที่ยังใช้งานและไม่ได้ตั้งยกเลิก — มี = องค์กรห้ามสมัคร/เปลี่ยน Basic/Pro เอง (ไม่งั้นไปแก้ราคาในดีล) */
export async function findLiveEnterprise(stripe, s, customerId, orgId) {
  const subs = (await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 20 })).data
  await stampEnterpriseSafe(stripe, s, subs, orgId)
  const ent = pickLive(subs, 'enterprise')
  return ent && !cancelScheduled(ent) ? ent : null
}

/** วันสิ้นรอบปัจจุบัน (API ใหม่อยู่ที่ subscription item) */
const itemEnd = (sub) => Number(sub?.items?.data?.[0]?.current_period_end) || 0
/** subscription แพ็กเกจจริง — ไม่นับตัวซ้ำที่ถูกคืนเงิน และ PromptPay ที่ทิ้งเพราะไม่เคยจ่าย */
const realPlans = (subs) => subs.filter((x) =>
  PLAN_KINDS.includes(kindOf(x)) && !x.metadata?.hop_duplicate_of && !x.metadata?.hop_discarded)

/**
 * ที่นั่งเพิ่มผูกกับแพ็กเกจ (ไม่มีแพ็กเกจ = ใช้ที่นั่งไม่ได้ ห้ามเก็บเงินค่าที่นั่งต่อ)
 *  • แพ็กเกจตั้งยกเลิกปลายรอบ → ที่นั่งจบวันเดียวกัน (ที่นั่งต่ออายุก่อนวันนั้น = รอบสุดท้าย Stripe คิดตามสัดส่วนถึงวันจบ)
 *  • แพ็กเกจจบไปแล้ว → ที่นั่งไม่ต่ออายุอีก · ค่าที่นั่งค้างจ่ายอยู่ = ยกเลิกทันที เลิกลองตัดบัตร
 *  • แพ็กเกจกลับมาต่ออายุ → ที่นั่งที่ระบบตั้งยกเลิกให้ (ป้าย hop_cancel_with_plan) กลับมาด้วย
 *    ที่นั่งที่ลูกค้ากดยกเลิกเองใน Portal = ไม่แตะ
 * องค์กรที่จ่ายแพ็กเกจผ่าน PunPay ยุคก่อน (ไม่มี subscription แพ็กเกจใน Stripe) = ไม่แตะ
 * คืน subscription ที่นั่งหลังแก้ · ไม่ได้แก้อะไร = null
 */
export async function cascadeSeats(stripe, subs) {
  const seats = pickLive(subs, 'seats')
  if (!seats) return null
  const plans = realPlans(subs)
  const live = plans.filter((x) => LIVE_STATUSES.includes(x.status))
  if (live.some((x) => !cancelScheduled(x))) {
    if (!seats.metadata?.hop_cancel_with_plan || !cancelScheduled(seats)) return null
    return stripe.subscriptions.update(seats.id, {
      ...(seats.cancel_at_period_end ? { cancel_at_period_end: false } : { cancel_at: '' }),
      metadata: { hop_cancel_with_plan: '' },
    })
  }
  if (cancelScheduled(seats)) return null // ตั้งยกเลิกไว้แล้ว (ระบบหรือลูกค้าตั้ง)
  const mark = { metadata: { hop_cancel_with_plan: '1' } }
  if (live.length) {
    const planEnd = Math.max(...live.map((x) => Number(x.cancel_at) || itemEnd(x)))
    // ที่นั่งหมดรอบหลังแพ็กเกจ = แค่ไม่ต่ออายุ (จ่ายถึงไหนใช้ถึงนั่น) · หมดรอบก่อน = ต่ออายุได้จนถึงวันแพ็กเกจจบพอดี
    return stripe.subscriptions.update(seats.id,
      planEnd > itemEnd(seats) ? { cancel_at: planEnd, ...mark } : { cancel_at_period_end: true, ...mark })
  }
  // ไม่มีแพ็กเกจเหลือ — ต้องเป็นแพ็กเกจที่จบ "หลัง" ซื้อที่นั่ง (ไม่ใช่ subscription เก่าก่อนหน้านั้น)
  if (!plans.some((x) => (Number(x.ended_at) || 0) > seats.created)) return null
  if (PAST_DUE.includes(seats.status)) {
    await stripe.subscriptions.update(seats.id, mark)
    return stripe.subscriptions.cancel(seats.id, {
      cancellation_details: { comment: 'HOP: แพ็กเกจจบแล้ว — ยกเลิกที่นั่งเพิ่มตาม ไม่ลองตัดค่าที่นั่งต่อ' },
    })
  }
  return stripe.subscriptions.update(seats.id, { cancel_at_period_end: true, ...mark })
}

/** ใส่ subscription ที่เพิ่งแก้กลับเข้ารายการ (ให้ billingState เห็นสถานะล่าสุด) */
const withUpdated = (subs, moved) => (moved ? subs.map((x) => (x.id === moved.id ? moved : x)) : subs)

/** cascadeSeats แบบไม่ทำให้งานหลักล้ม — ซิงก์สถานะ/ตอบ webhook ต้องไปต่อได้ (ครั้งหน้ายังลองใหม่) */
async function cascadeSeatsSafe(stripe, subs) {
  try {
    return await cascadeSeats(stripe, subs)
  } catch (e) {
    console.error('[stripe] ยกเลิก/คืนที่นั่งตามแพ็กเกจไม่สำเร็จ', e?.raw?.message || e?.message || e)
    return null
  }
}

/** แพ็กเกจเพิ่งกลับมาต่ออายุ (กดซื้อซ้ำตอนตั้งยกเลิกไว้) → ดึงที่นั่งที่ระบบตั้งยกเลิกตามกลับมาด้วย */
export async function resumeSeatsWithPlan(stripe, customer) {
  const subs = (await stripe.subscriptions.list({ customer, status: 'all', limit: 20 })).data
  return cascadeSeatsSafe(stripe, subs)
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
  await stampEnterpriseSafe(stripe, s, subs, orgId)
  subs = withUpdated(subs, await cascadeSeatsSafe(stripe, subs))
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
  // ป้ายนี้ = ไม่ใช่ "แพ็กเกจที่จบ" (cascadeSeats จะได้ไม่ยกเลิกที่นั่งตาม ตอนกำลังสมัครแพ็กเกจใหม่แทน)
  await stripe.subscriptions.update(sub.id, { metadata: { hop_discarded: '1' } })
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
export async function describeInvoice(stripe, invoice, s = null) {
  const subId = invoiceSubscriptionId(invoice)
  if (!subId) return null
  const sub = await stripe.subscriptions.retrieve(subId)
  // subscription จาก Quote (Enterprise) ยังไม่มีป้าย → ติดป้าย + หาองค์กรจากลูกค้าก่อน
  if (!sub.metadata?.org_id || !sub.metadata?.kind) await stampEnterpriseSafe(stripe, s, [sub])
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
    cycle: pm.cycle || sub.metadata?.cycle || (price?.recurring?.interval === 'year' ? 'yearly' : 'monthly'),
    qty: Number(pick?.quantity ?? item?.quantity ?? 1) || 1,
    periodEnd,
    customer: idOf(sub.customer),
    subscription: sub.id,
    sub,
  }
}

/** ใบนี้มาจาก Price ที่ระบบสมัครเองสร้าง (ensurePrice) — ชนิด/แพ็กเกจ/ระดับครบและถูกต้องตามที่ apply_stripe_invoice รับ */
function isHopPrice(d) {
  if (d.kind === 'seats') return true
  return d.kind === 'plan' && ['starter', 'pro'].includes(d.plan) && TIERS.includes(d.tier)
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

/** เท่ากับ +3 วันใน apply_stripe_invoice (เผื่อ Stripe ตัดบัตรรอบใหม่ช้า) */
const PAID_GRACE_DAYS = 3

/** บันทึกยอดลงตาราง payments (ใช้ทำสถิติ/ประวัติ) — เลขใบแจ้งหนี้ซ้ำ = ข้าม · บันทึกพลาด = log ไว้ ไม่ทำให้การให้สิทธิ์ล้ม */
async function recordPayment(s, row) {
  const r = await fetch(`${s.url}/rest/v1/payments`, {
    method: 'POST',
    headers: { ...s.svc, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(row),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }))
  if (!r.ok) console.error('[stripe] บันทึกยอดลง payments ไม่สำเร็จ', r.status, (await r.text().catch(() => '')).slice(0, 200))
}

/**
 * ใบแจ้งหนี้ Enterprise จ่ายแล้ว (ตัดบัตร / ทีมงานกด Mark as paid ใน Dashboard) → แพ็กเกจ enterprise + ต่ออายุถึงสิ้นรอบ
 * ไม่ผ่าน RPC apply_stripe_invoice (รับเฉพาะ Basic/Pro) — เขียนด้วย service role ตรงๆ แต่ทุกขั้นเรียกซ้ำได้:
 * วันหมดอายุ "ขยายอย่างเดียว" + บันทึกยอดแบบข้ามถ้ามีแล้ว → webhook ส่งซ้ำ/สลับลำดับได้ผลเหมือนเดิม
 * ใบที่สิ้นรอบไปแล้ว (เช่น webhook ซ้ำหลังเลิกใช้ Enterprise) = บันทึกยอดอย่างเดียว ไม่ดึงแพ็กเกจกลับเป็น Enterprise
 */
async function applyEnterprise(s, invoice, d) {
  if (!d.periodEnd) throw new Error('ไม่พบวันสิ้นรอบของใบแจ้งหนี้')
  const until = bkkDate(d.periodEnd + (d.graceDays + PAID_GRACE_DAYS) * 86400)
  const current = until >= bkkDate(Date.now() / 1000)
  let extended = 0
  if (current) {
    await patchOrg(s, d.orgId, {
      plan: 'enterprise',
      sub_status: 'active',
      sub_cycle: d.cycle,
      stripe_customer_id: d.customer,
      stripe_subscription_id: d.subscription,
    })
    extended = await patchOrg(s, d.orgId, { sub_expires_at: until }, `&or=(sub_expires_at.is.null,sub_expires_at.lt.${until})`)
    await patchOrg(s, d.orgId, { billing_past_due: null }, '&billing_past_due=eq.plan') // จ่ายแล้ว → เลิกเตือนค่าแพ็กเกจ
  }
  await recordPayment(s, {
    charge_id: invoice.id,
    org_id: d.orgId,
    plan: 'enterprise',
    months: d.cycle === 'yearly' ? 12 : 1,
    amount: (Number(invoice.amount_paid) || 0) / 100,
    tier: null,
  })
  return { applied: extended > 0, paid: true, expires: until, kind: 'enterprise', ...(current ? {} : { note: 'past-period' }) }
}

/**
 * ใบแจ้งหนี้จ่ายแล้ว → ให้สิทธิ์ผ่าน RPC apply_stripe_invoice (idempotent ด้วยเลขใบแจ้งหนี้)
 * expectOrg = ถ้าระบุ ต้องตรงกับองค์กรในใบ (หน้ายืนยันของผู้ใช้ กันยืนยันใบขององค์กรอื่น)
 */
export async function applyInvoice(stripe, s, invoice, expectOrg = null) {
  if (!invoice || invoice.status !== 'paid') return { applied: false, paid: false }
  const d = await describeInvoice(stripe, invoice, s)
  if (!d) return { applied: false, paid: true, note: 'not-hop' }
  if (expectOrg && d.orgId !== expectOrg) return { applied: false, paid: true, note: 'other-org' }
  // ดีล Enterprise (Product ติด kind=enterprise) → ตั้งแพ็กเกจ + ต่ออายุเอง (ไม่ผ่านตัวกันซ้ำ — ทีมงานตั้งดีลเอง)
  if (d.kind === 'enterprise') return applyEnterprise(s, invoice, d)
  // Price อื่นที่ไม่ได้มาจาก ensurePrice (ตั้งเองใน Dashboard โดยไม่ติด kind) → ไม่ใช่ของระบบสมัครเอง: ข้าม ตอบ 200
  // · ห้ามส่งค่าว่างไปตั้งแพ็กเกจ · ไม่ throw (เดิม 500 → Stripe ส่ง webhook ซ้ำไปอีก ~3 วันทั้งที่แก้อะไรไม่ได้)
  // · ต้องเช็กก่อนตัวกันซ้ำ: ไม่งั้น subscription ที่ตั้งเองตอน Pro ตัวเก่ายังไม่หมด ถูกนับเป็นตัวซ้ำแล้วโดนยกเลิก + คืนเงิน
  if (!isHopPrice(d)) {
    console.warn('[stripe] ใบแจ้งหนี้ไม่ใช่ราคาของระบบสมัครเอง (Price ไม่มี metadata ของ HOP) — ข้าม', { invoice: invoice.id, sub: d.subscription })
    return { applied: false, paid: true, kind: d.kind, note: 'not-hop-price' }
  }
  const keep = await refundIfDuplicate(stripe, invoice, d)
  if (keep) return { applied: false, paid: true, duplicate: true, kind: d.kind, note: `duplicate-of ${keep}` }
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
  const customer = idOf(sub?.customer)
  // subscription จาก Quote (Enterprise) ยังไม่มีป้าย → ติดป้าย + หาองค์กรจากลูกค้า
  if (sub && customer && !sub.metadata?.org_id) await stampEnterpriseSafe(stripe, s, [sub])
  const orgId = sub?.metadata?.org_id
  if (!orgId || !customer) return { ok: true, note: 'not-hop' }
  let subs = (await stripe.subscriptions.list({ customer, status: 'all', limit: 20 })).data
  await stampEnterpriseSafe(stripe, s, subs, orgId)
  const moved = await cascadeSeatsSafe(stripe, subs)
  subs = withUpdated(subs, moved)
  const { next } = billingState(subs)
  const matched = await patchOrg(s, orgId, next)
  // โชว์ในหน้า Event deliveries ของ Stripe — matched 0 = ไม่พบองค์กร (ไว้ไล่ปัญหา)
  return { ok: true, status: sub.status, ...next, matched, ...(moved ? { seats_cascade: moved.id } : {}) }
}

// ── ตัดบัตรรอบใหม่ไม่ผ่าน → ขยายสิทธิ์ตามรอบที่ Stripe จะลองตัดซ้ำ (Smart Retries) ──
// ปกติสิทธิ์ = สิ้นรอบ + 3 วัน (apply_stripe_invoice) แต่ Stripe อาจลองตัดซ้ำนานถึง 1 สัปดาห์–2 เดือนตามที่ตั้งใน Dashboard
// → ทุกครั้งที่ตัดไม่ผ่าน ขยายถึง "วันที่จะลองครั้งถัดไป + 1 วัน" (เผื่อเวลาตัดเงิน + webhook invoice.paid มาถึง)
// ไม่ต้องรู้ค่าตั้งใน Dashboard: ตามวันจริงที่ Stripe นัดไว้ (next_payment_attempt) · Stripe เลิกลองแล้ว (null) = ไม่ขยายอีก ล็อกตามวันเดิม
const RETRY_BUFFER_DAYS = 1
const RETRY_MAX_DAYS = 62 // นโยบายยาวสุดของ Smart Retries คือ 2 เดือน — กันค่าแปลกปลอม

/**
 * ใบรอบต่ออายุ (subscription_cycle) ที่ตัดบัตรไม่ผ่านและ Stripe ยังนัดลองตัดซ้ำ → ขยายวันหมดอายุของแพ็กเกจ/ที่นั่ง
 * ขยายอย่างเดียว ไม่หด (อัปเดตเฉพาะเมื่อวันเดิมน้อยกว่า) · event มาซ้ำ/สลับลำดับได้ผลเหมือนเดิม
 * ใช้กับ invoice.payment_failed และ invoice.updated (บัญชีที่ใช้ Automations ได้ next_payment_attempt จาก event นี้แทน)
 */
export async function extendForRetry(stripe, s, invoice) {
  if (invoice?.status !== 'open' || invoice.billing_reason !== 'subscription_cycle') return { extended: false }
  if (invoice.collection_method === 'send_invoice') return { extended: false } // PromptPay ขยายด้วย days_until_due อยู่แล้ว
  if (!(Number(invoice.attempt_count) >= 1)) return { extended: false } // ยังไม่เคยตัดไม่ผ่าน (เช่น เพิ่งออกใบรอบใหม่)
  const next = Number(invoice.next_payment_attempt) || 0
  if (!next) return { extended: false, note: 'no-more-retries' }
  const subId = invoiceSubscriptionId(invoice)
  const sub = subId ? await stripe.subscriptions.retrieve(subId) : null
  if (sub && !sub.metadata?.org_id) await stampEnterpriseSafe(stripe, s, [sub]) // Enterprise จาก Quote ยังไม่มีป้าย
  const orgId = sub?.metadata?.org_id
  if (!orgId || sub.metadata?.hop_duplicate_of) return { extended: false, note: 'not-hop' }
  const kind = kindOf(sub) // 'enterprise' ต่ออายุแพ็กเกจเหมือน 'plan'
  const cap = Date.now() / 1000 + RETRY_MAX_DAYS * 86400
  const until = bkkDate(Math.min(next, cap) + RETRY_BUFFER_DAYS * 86400)
  const col = kind === 'seats' ? 'extra_seats_expires_at' : 'sub_expires_at'
  const matched = await patchOrg(s, orgId, { [col]: until }, `&${col}=lt.${until}`)
  return { extended: matched > 0, kind, until, attempt: invoice.attempt_count ?? null }
}
