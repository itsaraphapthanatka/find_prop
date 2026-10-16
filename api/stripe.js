// Vercel Serverless Function — ชำระเงินผ่าน Stripe (subscription ตัดบัตรอัตโนมัติทุกรอบ)
// รวมไว้ endpoint เดียว (ประหยัดโควตาจำนวน function ของ Vercel) แยกงานด้วย body.action:
//   'checkout' → สมัครแพ็กเกจ/ที่นั่งเพิ่ม (ยังไม่มี subscription = เปิดหน้า Stripe Checkout
//                · มีอยู่แล้ว = เปลี่ยนแพ็กเกจ/จำนวนที่นั่งในที่เดิม คิดส่วนต่างตามวันที่เหลือ)
//   'confirm'  → กลับจากหน้า Checkout แล้วยืนยันทันที (ไม่ต้องรอ webhook)
//   'portal'   → เปิด Stripe Customer Portal (เปลี่ยนบัตร / ดูใบเสร็จ / ยกเลิกต่ออายุ)
//   'sync'     → ดึงสถานะ subscription จริงจาก Stripe มาเขียนลงองค์กร (เปิดหน้าอัปเกรดทุกครั้ง)
//
// ความปลอดภัย: เฉพาะ Owner ขององค์กร · ยอดเงินคำนวณฝั่งเซิร์ฟเวอร์ · ให้สิทธิ์เฉพาะใบแจ้งหนี้ที่ "paid" จริง

import { cors, requireOrgOwner, patchOrg } from './_lib/auth.js'
import {
  stripeClient, appUrl, ensurePrice, ensureCustomer, findLiveSubscription, applyInvoice, syncFromStripe,
} from './_lib/stripe.js'
import { fetchPlanPrices, TIERS } from './_lib/prices.js'
import { fetchSeatPrice, MAX_SEAT_QTY } from './_lib/seats.js'

const idOf = (x) => (typeof x === 'string' ? x : x?.id) || null

export default async function handler(req, res) {
  if (cors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const stripe = stripeClient()
  if (!stripe) return res.status(500).json({ error: 'ยังไม่ได้ตั้งค่า STRIPE_SECRET_KEY ใน Vercel Environment Variables' })
  const a = await requireOrgOwner(req)
  if (!a.ok) return res.status(a.status).json({ error: a.error })

  const body = req.body || {}
  try {
    if (body.action === 'checkout') return await checkout(req, res, stripe, a, body)
    if (body.action === 'confirm') return await confirm(res, stripe, a, body)
    if (body.action === 'portal') return await portal(req, res, stripe, a, body)
    if (body.action === 'sync') return res.status(200).json(await syncFromStripe(stripe, a))
    return res.status(400).json({ error: 'action ไม่ถูกต้อง (checkout | confirm | portal | sync)' })
  } catch (e) {
    // ข้อความจาก Stripe (เช่น บัตรถูกปฏิเสธ / ยังไม่ได้ตั้งค่า Customer Portal) ส่งกลับให้เห็น — ไม่มีข้อมูลลับ
    const msg = e?.raw?.message || e?.message || 'ไม่ทราบสาเหตุ'
    console.error('[stripe]', body.action, e?.type || '', msg)
    const status = e?.type === 'StripeCardError' ? 402 : 500
    return res.status(status).json({
      error: e?.type === 'StripeCardError' ? 'ตัดบัตรไม่สำเร็จ' : 'ระบบชำระเงินขัดข้อง',
      detail: msg,
    })
  }
}

// ── สมัคร / เปลี่ยนแพ็กเกจ / ที่นั่งเพิ่ม ──
async function checkout(req, res, stripe, a, body) {
  const kind = body.kind === 'seats' ? 'seats' : 'plan'
  const cycle = body.cycle
  if (!['monthly', 'yearly'].includes(cycle)) {
    return res.status(400).json({ error: 'รอบชำระไม่ถูกต้อง (cycle: monthly|yearly)' })
  }

  let plan = null
  let tier = null
  let qty = 1
  let amount
  if (kind === 'plan') {
    plan = body.plan
    tier = Number(body.tier)
    if (!['starter', 'pro'].includes(plan)) return res.status(400).json({ error: 'แพ็กเกจไม่ถูกต้อง (starter|pro)' })
    if (!TIERS.includes(tier)) {
      return res.status(400).json({ error: 'ระดับแพ็กเกจไม่ถูกต้อง (100|250|500) — ทรัพย์เกิน 500 ติดต่อทีมงาน' })
    }
    const p = (await fetchPlanPrices(a.s.url, a.s.anonKey))[plan][tier]
    amount = cycle === 'yearly' ? p.yearly : p.monthly
  } else {
    // qty = จำนวนที่นั่งเพิ่ม "ทั้งหมด" ที่ต้องการ (subscription เดียว ปรับจำนวนได้)
    qty = Math.floor(Number(body.qty))
    if (!(qty >= 1 && qty <= MAX_SEAT_QTY)) {
      return res.status(400).json({ error: `จำนวนที่นั่งต้องอยู่ระหว่าง 1–${MAX_SEAT_QTY}` })
    }
    const sp = await fetchSeatPrice(a.s.url, a.s.anonKey)
    amount = cycle === 'yearly' ? sp.yearly : sp.monthly
  }

  const priceId = await ensurePrice(stripe, { kind, plan, tier, cycle, amount })
  const customer = await ensureCustomer(stripe, a)
  const live = await findLiveSubscription(stripe, customer, kind)

  // ── มี subscription อยู่แล้ว → เปลี่ยนในที่เดิม (ไม่สร้างซ้อน = ไม่โดนตัดเงินสองทาง) ──
  if (live) {
    if (['past_due', 'unpaid'].includes(live.status)) {
      return res.status(409).json({ error: 'มีบิลค้างชำระ — กด "จัดการการชำระเงิน" เพื่ออัปเดตบัตรก่อน แล้วค่อยเปลี่ยนแพ็กเกจ' })
    }
    const item = live.items.data[0]
    const scheduledCancel = Boolean(live.cancel_at_period_end || live.cancel_at)
    const same = item.price.id === priceId && (item.quantity ?? 1) === qty

    if (same && !scheduledCancel) {
      return res.status(409).json({
        error: kind === 'seats' ? 'จำนวนที่นั่งนี้ตรงกับที่ใช้อยู่แล้ว' : 'องค์กรใช้แพ็กเกจและรอบชำระนี้อยู่แล้ว',
      })
    }
    // เคยกดยกเลิกต่ออายุไว้ → กดซื้ออีกครั้ง = กลับมาต่ออายุตามเดิม
    if (scheduledCancel) {
      await stripe.subscriptions.update(live.id, live.cancel_at_period_end ? { cancel_at_period_end: false } : { cancel_at: '' })
      if (kind === 'plan') await patchOrg(a.s, a.orgId, { sub_cancel_at_period_end: false })
      if (same) return res.status(200).json({ updated: true, resumed: true, kind })
    }

    // pending_if_incomplete: ถ้าตัดส่วนต่างไม่ผ่าน (บัตรถูกปฏิเสธ/ธนาคารขอยืนยันตัวตน) → ยังไม่เปลี่ยนแพ็กเกจ
    // จนกว่าจะจ่ายผ่านหน้าใบแจ้งหนี้ — ไม่มีทางได้แพ็กเกจแพงขึ้นโดยไม่จ่าย
    const updated = await stripe.subscriptions.update(live.id, {
      items: [{ id: item.id, price: priceId, quantity: qty }],
      proration_behavior: 'always_invoice',
      payment_behavior: 'pending_if_incomplete',
      expand: ['latest_invoice'],
    })
    const inv = typeof updated.latest_invoice === 'object' ? updated.latest_invoice : null
    if (updated.pending_update) {
      return res.status(200).json({
        updated: false,
        pending: true,
        kind,
        url: inv?.hosted_invoice_url || null,
        error: 'ตัดบัตรส่วนต่างไม่สำเร็จ หรือธนาคารต้องให้ยืนยันตัวตน — เปิดหน้าใบแจ้งหนี้เพื่อชำระ แล้วระบบจะเปลี่ยนให้อัตโนมัติ',
      })
    }
    // จ่ายส่วนต่างแล้ว (หรือลดแพ็กเกจ = ได้เครดิตเข้ารอบถัดไป) → ให้สิทธิ์ทันที ไม่ต้องรอ webhook
    const r = inv ? await applyInvoice(stripe, a.s, inv, a.orgId) : { applied: false }
    return res.status(200).json({ updated: true, kind, applied: r.applied, expires: r.expires ?? null, qty })
  }

  // ── ยังไม่มี subscription → หน้า Stripe Checkout ──
  // แอปมือถือ: เปิดใน in-app browser → จบแล้วไปหน้าบอกให้ปิดกลับแอป (แอปยืนยันเองตอนปิด browser)
  const base = appUrl(req)
  const native = body.native === true
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer,
    line_items: [{ price: priceId, quantity: qty }],
    subscription_data: { metadata: { org_id: a.orgId, kind } },
    metadata: { org_id: a.orgId, kind },
    client_reference_id: a.orgId,
    locale: 'th',
    success_url: native
      ? `${base}/pay-done.html?s=ok`
      : `${base}/?stripe=success&session_id={CHECKOUT_SESSION_ID}#/upgrade`,
    cancel_url: native ? `${base}/pay-done.html?s=cancel` : `${base}/?stripe=cancel#/upgrade`,
  })
  return res.status(200).json({ url: session.url, id: session.id, kind })
}

// ── กลับจากหน้า Checkout → ยืนยัน + ให้สิทธิ์ทันที ──
async function confirm(res, stripe, a, body) {
  const id = String(body.session_id || '')
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return res.status(400).json({ error: 'session_id ไม่ถูกต้อง' })
  const session = await stripe.checkout.sessions.retrieve(id)
  if (session.client_reference_id !== a.orgId && session.metadata?.org_id !== a.orgId) {
    return res.status(403).json({ error: 'รายการนี้ไม่ใช่ขององค์กรคุณ' })
  }
  const kind = session.metadata?.kind || 'plan'
  if (session.status !== 'complete') return res.status(200).json({ paid: false, status: session.status, kind })

  let invoiceId = idOf(session.invoice)
  if (!invoiceId && session.subscription) {
    invoiceId = idOf((await stripe.subscriptions.retrieve(idOf(session.subscription))).latest_invoice)
  }
  if (!invoiceId) return res.status(200).json({ paid: false, status: 'no-invoice', kind })
  const invoice = await stripe.invoices.retrieve(invoiceId)
  const r = await applyInvoice(stripe, a.s, invoice, a.orgId)
  return res.status(200).json({ paid: r.paid, applied: r.applied, expires: r.expires ?? null, kind, qty: r.qty ?? null })
}

// ── Stripe Customer Portal ──
async function portal(req, res, stripe, a, body) {
  const customer = a.org.stripe_customer_id
  if (!customer) return res.status(400).json({ error: 'องค์กรนี้ยังไม่เคยชำระเงินผ่านบัตร' })
  const base = appUrl(req)
  const session = await stripe.billingPortal.sessions.create({
    customer,
    locale: 'th',
    return_url: body.native === true ? `${base}/pay-done.html?s=portal` : `${base}/#/upgrade`,
  })
  return res.status(200).json({ url: session.url })
}
