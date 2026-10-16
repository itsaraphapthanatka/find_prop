// Vercel Serverless Function — รับ webhook จาก Stripe (แหล่งความจริงของการตัดบัตรทุกรอบ)
//
// ตั้งใน Stripe Dashboard → Developers → Webhooks → Add endpoint
//   URL: https://<โดเมน>/api/stripe-webhook
//   Events: checkout.session.completed, invoice.paid,
//           customer.subscription.updated, customer.subscription.deleted
//   แล้วนำ Signing secret (whsec_...) ไปใส่ env STRIPE_WEBHOOK_SECRET ใน Vercel
//
// ความปลอดภัย: ตรวจลายเซ็น Stripe-Signature จาก raw body ก่อนเสมอ (ไม่ผ่าน = 400 ไม่แตะฐานข้อมูล)
// ให้สิทธิ์ผ่าน applyInvoice() → RPC apply_stripe_invoice (กันซ้ำด้วยเลขใบแจ้งหนี้ — Stripe ส่งซ้ำได้ไม่เป็นไร)
// ตอบ 5xx เมื่อบันทึกไม่สำเร็จ → Stripe ส่งซ้ำให้เองภายหลัง (สูงสุด ~3 วัน)

import { supa } from './_lib/auth.js'
import { stripeClient, applyInvoice, syncSubscription, invoiceSubscriptionId } from './_lib/stripe.js'

export const config = { api: { bodyParser: false } }

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(typeof c === 'string' ? Buffer.from(c) : c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

const idOf = (x) => (typeof x === 'string' ? x : x?.id) || null

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const stripe = stripeClient()
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  const s = supa()
  if (!stripe || !secret || !s) {
    return res.status(500).json({ error: 'env ไม่ครบ (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)' })
  }

  let event
  try {
    const raw = await readRawBody(req)
    event = stripe.webhooks.constructEvent(raw, String(req.headers['stripe-signature'] || ''), secret)
  } catch {
    return res.status(400).json({ error: 'ลายเซ็นไม่ถูกต้อง' })
  }

  try {
    const obj = event.data.object
    let out = { ignored: event.type }
    switch (event.type) {
      case 'invoice.paid':
      case 'invoice.payment_succeeded':
        out = await applyInvoice(stripe, s, obj)
        break
      case 'checkout.session.completed':
        // ปกติ invoice.paid มาด้วยอยู่แล้ว — ทำซ้ำตรงนี้เผื่อ endpoint ไม่ได้ติ๊ก invoice.paid (กันซ้ำในตัว)
        if (obj.mode === 'subscription' && obj.invoice) {
          out = await applyInvoice(stripe, s, await stripe.invoices.retrieve(idOf(obj.invoice)))
        }
        break
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        out = await syncSubscription(stripe, s, obj)
        break
      case 'invoice.payment_failed': {
        // ปกติ customer.subscription.updated (→ past_due) ครอบอยู่แล้ว — รองรับไว้เผื่อติ๊ก event นี้ด้วย
        const subId = invoiceSubscriptionId(obj)
        if (subId) out = await syncSubscription(stripe, s, await stripe.subscriptions.retrieve(subId))
        break
      }
    }
    return res.status(200).json({ received: true, type: event.type, ...out })
  } catch (e) {
    console.error('[stripe-webhook]', event.type, event.id, e?.message || e)
    return res.status(500).json({ error: 'ประมวลผล webhook ไม่สำเร็จ' })
  }
}
