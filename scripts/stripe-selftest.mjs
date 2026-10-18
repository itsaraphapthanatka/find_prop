// ทดสอบตรรกะ Stripe ฝั่งเซิร์ฟเวอร์ (api/_lib/stripe.js) ด้วย Stripe จำลอง — ไม่ยิง Stripe/Supabase จริง · รัน: npm run test:stripe
// ครอบ: กันจ่ายซ้ำ (ปิดหน้าจ่ายเก่า + ยกเลิก/คืนเงินตัวซ้ำ) · Price ไม่มี metadata ห้ามให้สิทธิ์ · Portal ปิดเปลี่ยนแพ็กเกจ
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const LIB = pathToFileURL(resolve('api/_lib/stripe.js')).href
let n = 0
/** โหลดโมดูลใหม่ทุกครั้ง (ล้างแคช configuration ของ Portal ที่เก็บไว้ในตัวแปรระดับโมดูล) */
const fresh = () => import(`${LIB}?t=${++n}`)

const fails = []
let pass = 0
const eq = (name, got, want) =>
  (JSON.stringify(got) === JSON.stringify(want) ? pass++ : fails.push(`${name} — ได้ ${JSON.stringify(got)} ควรเป็น ${JSON.stringify(want)}`))

// ── Supabase จำลอง: จด RPC ที่ถูกเรียก ──
const rpc = []
globalThis.fetch = async (url, init) => {
  if (String(url).includes('/rpc/apply_stripe_invoice')) {
    rpc.push(JSON.parse(init.body))
    return new Response(JSON.stringify([{ applied: true, expires: '2026-11-20' }]), { status: 200 })
  }
  return new Response('[]', { status: 200 })
}
const S = { url: 'http://supa.test', svc: {} }

const PRICE = {
  price_pro250: { id: 'price_pro250', metadata: { kind: 'plan', plan: 'pro', tier: '250', cycle: 'monthly' } },
  price_basic100: { id: 'price_basic100', metadata: { kind: 'plan', plan: 'starter', tier: '100', cycle: 'monthly' } },
  price_manual: { id: 'price_manual', metadata: {} }, // Price ที่สร้างเองใน Dashboard
}
const sub = (id, created, o = {}) => ({
  id, created, customer: 'cus_1', status: 'active', collection_method: 'charge_automatically',
  metadata: { org_id: 'org_1', kind: 'plan', ...(o.metadata || {}) },
  items: { data: [{ price: PRICE[o.price || 'price_pro250'], quantity: 1, current_period_end: 1795000000 }] },
  ...o.extra,
})
const invoice = (id, subId, price = 'price_pro250') => ({
  id, status: 'paid', amount_paid: 99000,
  parent: { subscription_details: { subscription: subId } },
  lines: { data: [{ amount: 99000, quantity: 1, period: { end: 1795000000 }, pricing: { price_details: { price } } }] },
})

function fakeStripe({ subs = [], sessions = [], payments = [], configs = [] } = {}) {
  const calls = []
  const refunded = new Set()
  return {
    calls,
    subscriptions: {
      list: async (p) => ({ data: subs.filter((x) => x.customer === p.customer).sort((a, b) => b.created - a.created) }),
      retrieve: async (id) => subs.find((x) => x.id === id),
      update: async (id, p) => {
        calls.push(['sub.update', id])
        const x = subs.find((y) => y.id === id)
        if (x.status === 'canceled') throw Object.assign(new Error('canceled'), { code: 'resource_missing' })
        Object.assign(x.metadata, p.metadata || {})
        return x
      },
      cancel: async (id) => { calls.push(['sub.cancel', id]); subs.find((y) => y.id === id).status = 'canceled'; return {} },
    },
    prices: { retrieve: async (id) => PRICE[id] },
    checkout: {
      sessions: {
        list: async (p) => ({ data: sessions.filter((x) => x.customer === p.customer && x.status === p.status) }),
        expire: async (id) => {
          calls.push(['cs.expire', id])
          const x = sessions.find((y) => y.id === id)
          if (x.race) throw Object.assign(new Error('already complete'), { code: 'checkout_session_complete' })
          x.status = 'expired'
          return x
        },
      },
    },
    invoicePayments: { list: async (p) => ({ data: payments.filter((x) => x.invoice === p.invoice) }) },
    refunds: {
      create: async (p, o) => {
        calls.push(['refund', p.payment_intent || p.charge, o?.idempotencyKey, p.reason])
        if (refunded.has(p.payment_intent)) throw Object.assign(new Error('refunded'), { code: 'charge_already_refunded' })
        refunded.add(p.payment_intent)
        return { id: 're_1' }
      },
    },
    billingPortal: {
      configurations: {
        list: () => ({ async *[Symbol.asyncIterator]() { yield* configs } }),
        create: async (p, o) => { calls.push(['portal.create', p, o]); return { id: 'bpc_new', ...p } },
      },
    },
  }
}
const count = (st, name) => st.calls.filter((c) => c[0] === name).length

// ── 1) เปิดหน้าจ่ายใหม่ → ปิดหน้าจ่ายเก่าชนิดเดียวกันเท่านั้น ──
{
  const { expireOpenCheckouts } = await fresh()
  const st = fakeStripe({
    sessions: [
      { id: 'cs_plan_old', customer: 'cus_1', status: 'open', mode: 'subscription', metadata: { kind: 'plan' } },
      { id: 'cs_plan_race', customer: 'cus_1', status: 'open', mode: 'subscription', metadata: { kind: 'plan' }, race: true },
      { id: 'cs_seats', customer: 'cus_1', status: 'open', mode: 'subscription', metadata: { kind: 'seats' } },
      { id: 'cs_other', customer: 'cus_2', status: 'open', mode: 'subscription', metadata: { kind: 'plan' } },
    ],
  })
  await expireOpenCheckouts(st, 'cus_1', 'plan')
  eq('ปิดเฉพาะหน้าจ่ายแพ็กเกจของลูกค้าคนนี้', st.calls.map((c) => c[1]).sort(), ['cs_plan_old', 'cs_plan_race'])
  pass++ // จ่ายเสร็จพอดี (expire error) ไม่ทำให้ทั้งรายการล้ม — มาถึงบรรทัดนี้ได้แปลว่าไม่ throw
}

// ── 2) subscription ซ้ำ (บัตรทั้งคู่) → ตัวที่สร้างก่อนเป็นตัวจริง ตัวหลังถูกยกเลิก + คืนเงิน ──
{
  const { applyInvoice, findLiveSubscription } = await fresh()
  const subs = [sub('sub_A', 1000), sub('sub_B', 1005, { price: 'price_basic100' })]
  const st = fakeStripe({ subs, payments: [{ id: 'inpay_B', invoice: 'in_B', status: 'paid', payment: { type: 'payment_intent', payment_intent: 'pi_B' } }] })
  eq('findLiveSubscription เลือกตัวที่สร้างก่อน', (await findLiveSubscription(st, 'cus_1', 'plan')).id, 'sub_A')

  rpc.length = 0
  const rA = await applyInvoice(st, S, invoice('in_A', 'sub_A'), 'org_1')
  eq('ใบของตัวจริง → ให้สิทธิ์ตามปกติ', [rA.applied, rpc.length, rpc[0]?.p_plan, rpc[0]?.p_tier], [true, 1, 'pro', 250])

  rpc.length = 0
  const rB = await applyInvoice(st, S, invoice('in_B', 'sub_B', 'price_basic100'), 'org_1')
  eq('ใบของตัวซ้ำ → ไม่ให้สิทธิ์', [rB.applied, rB.duplicate, rpc.length], [false, true, 0])
  eq('ตัวซ้ำถูกติดป้าย + ยกเลิก', [subs[1].metadata.hop_duplicate_of, subs[1].status], ['sub_A', 'canceled'])
  eq('คืนเงินเต็มใบ ด้วย idempotency key', st.calls.filter((c) => c[0] === 'refund'), [['refund', 'pi_B', 'hop-dup-refund-inpay_B', 'duplicate']])
  eq('ตัวจริงไม่ถูกแตะ', [subs[0].status, subs[0].metadata.hop_duplicate_of], ['active', undefined])

  // webhook ส่งใบเดิมซ้ำ (หลังยกเลิกแล้ว) → ไม่ยกเลิกซ้ำ ไม่ให้สิทธิ์ · คืนเงินซ้ำ = Stripe บอกคืนแล้ว → ข้าม
  rpc.length = 0
  const before = count(st, 'sub.cancel')
  const rB2 = await applyInvoice(st, S, invoice('in_B', 'sub_B', 'price_basic100'))
  eq('webhook ซ้ำ → ยังเป็นตัวซ้ำ ไม่ให้สิทธิ์', [rB2.duplicate, rpc.length], [true, 0])
  eq('webhook ซ้ำ → ไม่ยกเลิกซ้ำ', count(st, 'sub.cancel'), before)
}

// ── 3) ใบของ subscription เก่าที่ยกเลิกไปแล้ว (ก่อนสมัครตัวใหม่) → ไม่ใช่ตัวซ้ำ ──
{
  const { applyInvoice } = await fresh()
  const subs = [sub('sub_old', 900, { extra: { status: 'canceled' } }), sub('sub_new', 2000)]
  const st = fakeStripe({ subs })
  rpc.length = 0
  const r = await applyInvoice(st, S, invoice('in_old', 'sub_old'))
  eq('ใบเก่าส่งซ้ำ → ทำงานตามเดิม ไม่คืนเงิน', [r.duplicate ?? false, rpc.length, count(st, 'refund'), count(st, 'sub.cancel')], [false, 1, 0, 0])
}

// ── 4) PromptPay (ส่งใบแจ้งหนี้) ไม่ถูกคืนเงินอัตโนมัติ — ลูกค้าสแกนจ่ายเองทีละใบ ──
{
  const { applyInvoice } = await fresh()
  const subs = [sub('sub_A', 1000), sub('sub_PP', 1005, { extra: { collection_method: 'send_invoice', days_until_due: 7 } })]
  const st = fakeStripe({ subs })
  rpc.length = 0
  const r = await applyInvoice(st, S, invoice('in_PP', 'sub_PP'))
  eq('PromptPay → ไม่แตะ', [r.duplicate ?? false, rpc.length, count(st, 'refund'), count(st, 'sub.cancel')], [false, 1, 0, 0])
}

// ── 5) seats กับ plan เป็นคนละชนิด — มีทั้งคู่ไม่ใช่การซ้ำ ──
{
  const { applyInvoice } = await fresh()
  const subs = [sub('sub_plan', 1000), sub('sub_seat', 1005, { metadata: { kind: 'seats' } })]
  subs[1].items.data[0].price = { id: 'price_seat', metadata: { kind: 'seats', cycle: 'monthly' } }
  subs[1].items.data[0].quantity = 3
  const st = fakeStripe({ subs })
  rpc.length = 0
  const inv = invoice('in_seat', 'sub_seat', 'price_seat')
  inv.lines.data[0].quantity = 3
  const r = await applyInvoice(st, S, inv)
  eq('ที่นั่ง + แพ็กเกจ → ให้สิทธิ์ที่นั่งตามปกติ', [r.duplicate ?? false, rpc[0]?.p_kind, rpc[0]?.p_qty], [false, 'seats', 3])
}

// ── 6) Price ไม่มี metadata plan/tier → ห้ามส่งค่าว่างไปตั้งแพ็กเกจ (โยน error ให้ webhook ตอบ 500) ──
{
  const { applyInvoice } = await fresh()
  const st = fakeStripe({ subs: [sub('sub_M', 1000, { price: 'price_manual' })] })
  rpc.length = 0
  let err = null
  try { await applyInvoice(st, S, invoice('in_M', 'sub_M', 'price_manual')) } catch (e) { err = e.message }
  eq('Price ไม่มี metadata → error + ไม่เรียก RPC', [Boolean(err && err.includes('metadata')), rpc.length], [true, 0])
}

// ── 7) Customer Portal: ใช้ configuration ของ HOP ที่ปิดเปลี่ยนแพ็กเกจ ──
{
  const { ensurePortalConfig } = await fresh()
  const st = fakeStripe({ configs: [{ id: 'bpc_default', metadata: {} }] })
  const id = await ensurePortalConfig(st)
  const created = st.calls.find((c) => c[0] === 'portal.create')
  eq('ไม่มีของเดิม → สร้างใหม่', id, 'bpc_new')
  eq('ปิดเปลี่ยนแพ็กเกจ/จำนวนใน Portal', created?.[1].features.subscription_update, { enabled: false })
  eq('ยกเลิกได้เฉพาะปลายรอบ ไม่คิดส่วนต่าง',
    [created?.[1].features.subscription_cancel.mode, created?.[1].features.subscription_cancel.proration_behavior], ['at_period_end', 'none'])
  eq('เปลี่ยนบัตร + ดูใบเสร็จได้',
    [created?.[1].features.payment_method_update.enabled, created?.[1].features.invoice_history.enabled], [true, true])
  eq('สร้างด้วย idempotency key ตามรุ่น', created?.[2]?.idempotencyKey, 'hop-portal-config-v1')
  await ensurePortalConfig(st)
  eq('เรียกซ้ำ → ใช้ค่าที่จำไว้ ไม่สร้างเพิ่ม', count(st, 'portal.create'), 1)

  const m2 = await fresh()
  const st2 = fakeStripe({ configs: [{ id: 'bpc_default', metadata: {} }, { id: 'bpc_hop', metadata: { hop_portal: 'v1' } }] })
  eq('มีของรุ่นเดียวกันอยู่แล้ว → ใช้ตัวเดิม', [await m2.ensurePortalConfig(st2), count(st2, 'portal.create')], ['bpc_hop', 0])
}

if (fails.length) {
  console.error(`❌ ไม่ผ่าน ${fails.length} ข้อ (ผ่าน ${pass})`)
  for (const f of fails) console.error('  - ' + f)
  process.exit(1)
}
console.log(`✅ stripe selftest ผ่านทั้งหมด ${pass} ข้อ`)
