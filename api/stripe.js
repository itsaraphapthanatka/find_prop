// Vercel Serverless Function — ชำระเงินผ่าน Stripe (subscription ตัดบัตรอัตโนมัติทุกรอบ)
// รวมไว้ endpoint เดียว (ประหยัดโควตาจำนวน function ของ Vercel) แยกงานด้วย body.action:
//   'checkout' → สมัครแพ็กเกจ/ที่นั่งเพิ่ม · method 'card' (ตัดบัตรอัตโนมัติ) | 'promptpay' (ใบแจ้งหนี้ทุกรอบ — super เปิดสวิตช์ก่อน)
//                (บัตร + ยังไม่มี subscription = เปิดหน้า Stripe Checkout
//                · มีอยู่แล้ว = เปลี่ยนแพ็กเกจ/จำนวนที่นั่งในที่เดิม คิดส่วนต่างตามวันที่เหลือ)
//   'confirm'  → กลับจากหน้า Checkout (session_id) หรือหน้าใบแจ้งหนี้ PromptPay (invoice_id) แล้วยืนยันทันที
//   'portal'   → เปิด Stripe Customer Portal (เปลี่ยนบัตร / ดูใบเสร็จ / ยกเลิกต่ออายุ)
//   'sync'     → ดึงสถานะ subscription จริงจาก Stripe มาเขียนลงองค์กร (เปิดหน้าอัปเกรดทุกครั้ง)
//   'open-invoice' → ลิงก์จ่ายใบแจ้งหนี้ที่ค้าง (ตัดบัตรรอบใหม่ไม่ผ่าน)
//
// ความปลอดภัย: เฉพาะ Owner ขององค์กร · ยอดเงินคำนวณฝั่งเซิร์ฟเวอร์ · ให้สิทธิ์เฉพาะใบแจ้งหนี้ที่ "paid" จริง

import { cors, requireOrgOwner, patchOrg } from './_lib/auth.js'
import {
  stripeClient, appUrl, ensurePrice, ensureCustomer, findLiveSubscription, applyInvoice, syncFromStripe, openInvoiceUrl,
  finalizeIfDraft, discardIfNeverPaid, startInvoiceSubscription,
} from './_lib/stripe.js'
import { fetchPlanPrices, TIERS } from './_lib/prices.js'
import { fetchSeatPrice, MAX_SEAT_QTY } from './_lib/seats.js'
import { promptpayEnabled } from './_lib/settings.js'

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
    if (body.action === 'open-invoice') {
      return res.status(200).json({ url: await openInvoiceUrl(stripe, a.org.stripe_customer_id) })
    }
    return res.status(400).json({ error: 'action ไม่ถูกต้อง (checkout | confirm | portal | sync | open-invoice)' })
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
  const method = body.method === 'promptpay' ? 'promptpay' : 'card'
  const cycle = body.cycle
  if (!['monthly', 'yearly'].includes(cycle)) {
    return res.status(400).json({ error: 'รอบชำระไม่ถูกต้อง (cycle: monthly|yearly)' })
  }
  // PromptPay ปิดไว้จนกว่า super จะเปิดสวิตช์ (app_settings 'promptpay') — หน้าเว็บซ่อนปุ่มอยู่แล้ว ที่นี่บังคับซ้ำ
  if (method === 'promptpay' && !(await promptpayEnabled(a.s.url, a.s.anonKey))) {
    return res.status(400).json({ error: 'ยังไม่เปิดให้ชำระด้วย PromptPay — ใช้บัตรเครดิต/เดบิตไปก่อน' })
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
  let live = await findLiveSubscription(stripe, customer, kind)
  // เคยกดจ่าย PromptPay แต่ไม่ได้สแกนจ่ายเลย → ทิ้งของค้าง เริ่มใหม่ (จะเลือกบัตรหรือ PromptPay รอบนี้ก็ได้)
  if (live && await discardIfNeverPaid(stripe, live)) live = null
  const invoiceSub = live?.collection_method === 'send_invoice' // ลูกค้า PromptPay ที่จ่ายแล้วอย่างน้อย 1 รอบ

  // ── มี subscription อยู่แล้ว → เปลี่ยนในที่เดิม (ไม่สร้างซ้อน = ไม่โดนตัดเงินสองทาง) ──
  if (live) {
    if (['past_due', 'unpaid'].includes(live.status)) {
      return res.status(409).json({
        error: invoiceSub
          ? 'มีใบแจ้งหนี้ค้างชำระ — กด "ชำระเงินตอนนี้" ด้านบนเพื่อสแกนจ่ายก่อน แล้วค่อยเปลี่ยนแพ็กเกจ'
          : 'มีบิลค้างชำระ — กด "จัดการการชำระเงิน" เพื่ออัปเดตบัตรก่อน แล้วค่อยเปลี่ยนแพ็กเกจ',
      })
    }
    // วิธีจ่ายของ subscription เปลี่ยนกลางทางไม่ได้ (บัตร ↔ PromptPay) — ต้องยกเลิกต่ออายุแล้วสมัครใหม่หลังหมดรอบ
    if (method === 'promptpay' && !invoiceSub) {
      return res.status(409).json({ error: 'องค์กรนี้ตัดบัตรอัตโนมัติอยู่ — เปลี่ยนแพ็กเกจด้วยปุ่มปกติ (ตัดบัตรส่วนต่าง)' })
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

    // ลูกค้า PromptPay: Stripe ตัดเงินเองไม่ได้ → ออกใบแจ้งหนี้ส่วนต่างให้สแกนจ่าย (pending_if_incomplete ใช้กับแบบนี้ไม่ได้)
    // แพ็กเกจในระบบเราเปลี่ยนตอนจ่ายใบนี้แล้วเท่านั้น (invoice.paid → applyInvoice อ่านแพ็กเกจจากบรรทัดยอดบวก)
    if (invoiceSub) {
      const changed = await stripe.subscriptions.update(live.id, {
        items: [{ id: item.id, price: priceId, quantity: qty }],
        proration_behavior: 'always_invoice',
        expand: ['latest_invoice'],
      })
      const inv = await finalizeIfDraft(stripe, changed.latest_invoice)
      if (inv?.status === 'paid') { // ลดแพ็กเกจ/ยอด 0 = จ่ายจบในตัว
        const r = await applyInvoice(stripe, a.s, inv, a.orgId)
        return res.status(200).json({ updated: true, kind, applied: r.applied, expires: r.expires ?? null, qty })
      }
      return res.status(200).json({
        updated: false,
        pending: true,
        kind,
        url: inv?.hosted_invoice_url || null,
        invoice: inv?.id || null,
        error: 'สแกน PromptPay ชำระส่วนต่างในหน้าใบแจ้งหนี้ — จ่ายแล้วระบบเปลี่ยนแพ็กเกจให้อัตโนมัติ',
      })
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

  // ── ยังไม่มี subscription + เลือก PromptPay → ออกใบแจ้งหนี้ใบแรก แล้วพาไปหน้าสแกนจ่ายของ Stripe ──
  // (Checkout แบบ subscription ไม่รองรับ PromptPay — ต้องเป็น subscription แบบส่งใบแจ้งหนี้)
  if (method === 'promptpay') {
    const inv = await startInvoiceSubscription(stripe, { customer, priceId, qty, orgId: a.orgId, kind })
    return res.status(200).json({ url: inv.hosted_invoice_url, invoice: inv.id, kind, method })
  }

  // ── ยังไม่มี subscription → หน้า Stripe Checkout ──
  // แอปมือถือ: เปิดใน in-app browser → จบแล้วไปหน้าบอกให้ปิดกลับแอป (แอปยืนยันเองตอนปิด browser)
  const base = appUrl(req)
  const native = body.native === true
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer,
    // ⚠️ ห้ามใส่ payment_method_types — API รุ่นนี้ยกเลิกแล้ว (Stripe ตอบ error ทุกครั้ง)
    // ช่องทางจ่ายเปิด/ปิดที่ Dashboard → Settings → Payment methods (แยก Test/Live) · subscription สกุลบาทใช้ได้แค่บัตร
    // ไม่ได้เปิด Cards ในโหมด Live = "No valid payment method types for this Checkout Session" (เจอจริง 2026-10-16)
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

// ── กลับจากหน้า Checkout / หน้าใบแจ้งหนี้ PromptPay → ยืนยัน + ให้สิทธิ์ทันที ──
async function confirm(res, stripe, a, body) {
  if (body.invoice_id) return confirmInvoice(res, stripe, a, String(body.invoice_id))
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

/** ใบแจ้งหนี้ PromptPay: ต้องเป็นของ subscription ขององค์กรนี้ · ยังไม่จ่าย = บอกสถานะ (open/void) */
async function confirmInvoice(res, stripe, a, id) {
  if (!/^in_[A-Za-z0-9_]+$/.test(id)) return res.status(400).json({ error: 'invoice_id ไม่ถูกต้อง' })
  const invoice = await stripe.invoices.retrieve(id)
  const subId = idOf(invoice.parent?.subscription_details?.subscription) || idOf(invoice.subscription)
  const sub = subId ? await stripe.subscriptions.retrieve(subId) : null
  if (sub?.metadata?.org_id !== a.orgId) return res.status(403).json({ error: 'รายการนี้ไม่ใช่ขององค์กรคุณ' })
  const kind = sub.metadata?.kind || 'plan'
  if (invoice.status !== 'paid') return res.status(200).json({ paid: false, status: invoice.status, kind })
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
