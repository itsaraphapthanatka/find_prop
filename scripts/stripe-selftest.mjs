// ทดสอบตรรกะ Stripe ฝั่งเซิร์ฟเวอร์ (api/_lib/stripe.js) ด้วย Stripe จำลอง — ไม่ยิง Stripe/Supabase จริง · รัน: npm run test:stripe
// ครอบ: กันจ่ายซ้ำ (ปิดหน้าจ่ายเก่า + ยกเลิก/คืนเงินตัวซ้ำ) · Price ไม่มี metadata ห้ามให้สิทธิ์ (ข้าม ไม่ 500) · Portal ปิดเปลี่ยนแพ็กเกจ
//       · Product คงที่ต่อแพ็กเกจ × ระดับ · ขยายสิทธิ์ตามรอบลองตัดซ้ำ (Smart Retries) · ที่นั่งยกเลิกตามแพ็กเกจ
//       · Free/ทดลอง/หมดอายุ/ตั้งยกเลิก ซื้อที่นั่งไม่ได้
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

// ── Supabase จำลอง: จด RPC ที่ถูกเรียก · PATCH องค์กรเทียบเงื่อนไข `คอลัมน์=lt.วันที่` กับแถวจำลอง (ขยายอย่างเดียว ไม่หด) ──
const rpc = []
const patches = []
let orgRow = {}
globalThis.fetch = async (url, init) => {
  if (String(url).includes('/rpc/apply_stripe_invoice')) {
    rpc.push(JSON.parse(init.body))
    return new Response(JSON.stringify([{ applied: true, expires: '2026-11-20' }]), { status: 200 })
  }
  if (String(url).includes('/rest/v1/organizations') && init?.method === 'PATCH') {
    const body = JSON.parse(init.body)
    patches.push({ url: String(url), body })
    const q = new URL(url).searchParams
    const ok = [...q.entries()].every(([k, v]) => !v.startsWith('lt.') || (orgRow[k] != null && orgRow[k] < v.slice(3)))
    if (ok) Object.assign(orgRow, body)
    return new Response(JSON.stringify(ok ? [{ id: 'org_1' }] : []), { status: 200 })
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
        calls.push(['sub.update', id, p])
        const x = subs.find((y) => y.id === id)
        if (x.status === 'canceled') throw Object.assign(new Error('canceled'), { code: 'resource_missing' })
        for (const [k, v] of Object.entries(p.metadata || {})) { if (v === '') delete x.metadata[k]; else x.metadata[k] = v }
        if ('cancel_at_period_end' in p) x.cancel_at_period_end = p.cancel_at_period_end
        if ('cancel_at' in p) x.cancel_at = p.cancel_at || null
        return x
      },
      cancel: async (id) => {
        calls.push(['sub.cancel', id])
        const x = subs.find((y) => y.id === id)
        x.status = 'canceled'
        return x
      },
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

// ── 6) Price ไม่มี metadata plan/tier → ห้ามส่งค่าว่างไปตั้งแพ็กเกจ · ข้าม (webhook ตอบ 200 ไม่ให้ Stripe ส่งซ้ำ 3 วัน) ──
{
  const { applyInvoice } = await fresh()
  const st = fakeStripe({ subs: [sub('sub_M', 1000, { price: 'price_manual' })] })
  rpc.length = 0
  let err = null
  let r = null
  try { r = await applyInvoice(st, S, invoice('in_M', 'sub_M', 'price_manual')) } catch (e) { err = e.message }
  eq('Price ไม่มี metadata → ไม่ throw + ไม่เรียก RPC + บอกเหตุผล', [err, rpc.length, r?.applied, r?.note], [null, 0, false, 'not-hop-price'])

  // มี plan แต่ระดับแปลก/ไม่มี → ไม่ใช่ราคาของระบบเช่นกัน
  PRICE.price_badtier = { id: 'price_badtier', metadata: { kind: 'plan', plan: 'pro', tier: '999', cycle: 'monthly' } }
  const st2 = fakeStripe({ subs: [sub('sub_T', 1000, { price: 'price_badtier' })] })
  const r2 = await applyInvoice(st2, S, invoice('in_T', 'sub_T', 'price_badtier'))
  eq('ระดับ 999 → ข้าม ไม่เรียก RPC', [r2.note, rpc.length], ['not-hop-price', 0])
}

// ── 6b) Enterprise ตั้งราคาเองใน Dashboard ระหว่างที่ Pro ตัวเก่ายังไม่หมดรอบ → ต้องไม่ถูกนับเป็น "ตัวซ้ำ" แล้วโดนยกเลิก + คืนเงิน ──
{
  const { applyInvoice } = await fresh()
  const subs = [sub('sub_pro', 1000), sub('sub_ent', 2000, { price: 'price_manual' })]
  const st = fakeStripe({ subs, payments: [{ id: 'inpay_E', invoice: 'in_E', status: 'paid', payment: { type: 'payment_intent', payment_intent: 'pi_E' } }] })
  rpc.length = 0
  const r = await applyInvoice(st, S, invoice('in_E', 'sub_ent', 'price_manual'))
  eq('Enterprise ไม่ถูกยกเลิก/คืนเงิน', [r.duplicate ?? false, subs[1].status, count(st, 'sub.cancel'), count(st, 'refund')], [false, 'active', 0, 0])
  eq('Enterprise ไม่แตะแพ็กเกจในระบบ (super ตั้งเอง)', [r.note, rpc.length], ['not-hop-price', 0])
}

// ── 6c) Product คงที่ 1 ตัวต่อแพ็กเกจ × ระดับ (รายเดือน/รายปีอยู่ใต้ Product เดียวกัน) ──
{
  const { ensurePrice, samePrice } = await fresh()
  const err = (code) => Object.assign(new Error(code), { code })
  /** Stripe จำลองเฉพาะ Price/Product */
  const catalog = (prices = [], products = {}) => {
    const calls = []
    let seq = 0
    return {
      calls,
      prices: {
        list: async ({ lookup_keys: [k] }) => ({ data: prices.filter((p) => p.active && p.lookup_key === k).slice(0, 1) }),
        create: async (p) => {
          calls.push(['price.create', p.product, p.lookup_key])
          if (p.transfer_lookup_key) for (const x of prices) if (x.lookup_key === p.lookup_key) x.lookup_key = null
          const x = { id: `price_n${++seq}`, active: true, ...p }
          delete x.transfer_lookup_key
          prices.push(x)
          return x
        },
      },
      products: {
        retrieve: async (id) => { if (!products[id]) throw err('resource_missing'); return products[id] },
        create: async (p) => {
          calls.push(['product.create', p.id, p.name])
          if (products[p.id]) throw err('resource_already_exists')
          products[p.id] = { active: true, ...p }
          return products[p.id]
        },
        update: async (id, p) => { calls.push(['product.update', id]); Object.assign(products[id], p); return products[id] },
      },
    }
  }
  const c = (st, name) => st.calls.filter((x) => x[0] === name).length

  const st = catalog()
  const m = await ensurePrice(st, { kind: 'plan', plan: 'pro', tier: 250, cycle: 'monthly', amount: 1390 })
  eq('สร้าง Product id คงที่ ชื่อไม่มีรอบบิล', st.calls.filter((x) => x[0] === 'product.create'), [['product.create', 'hop_pro_250', 'HOP Pro ≤250 ทรัพย์']])
  eq('Price อยู่ใต้ Product คงที่ + lookup ตามรอบ', [m.product, m.lookup_key, m.unit_amount], ['hop_pro_250', 'hop_pro_250_monthly', 139000])
  eq('Price metadata ยังมีรอบบิล (describeInvoice ใช้)', m.metadata, { kind: 'plan', plan: 'pro', tier: '250', cycle: 'monthly' })
  const again = await ensurePrice(st, { kind: 'plan', plan: 'pro', tier: 250, cycle: 'monthly', amount: 1390 })
  eq('เรียกซ้ำราคาเดิม → Price เดิม ไม่สร้างใหม่', [again.id, c(st, 'price.create')], [m.id, 1])
  const y = await ensurePrice(st, { kind: 'plan', plan: 'pro', tier: 250, cycle: 'yearly', amount: 14178 })
  eq('รายปีอยู่ Product เดียวกับรายเดือน', [y.product, y.recurring.interval, c(st, 'product.create')], ['hop_pro_250', 'year', 1])
  const seat = await ensurePrice(st, { kind: 'seats', cycle: 'monthly', amount: 290 })
  eq('ที่นั่งเพิ่ม → Product hop_seat', seat.product, 'hop_seat')
  const up = await ensurePrice(st, { kind: 'plan', plan: 'pro', tier: 250, cycle: 'monthly', amount: 1490 })
  eq('super แก้ราคา → Price ใหม่ใต้ Product เดิม + ย้าย lookup', [up.product, up.lookup_key, m.lookup_key], ['hop_pro_250', 'hop_pro_250_monthly', null])

  // Price เก่าบน Live (Product แยกรอบบิล เช่น "HOP Basic ≤100 ทรัพย์ (รายเดือน)") → ย้ายมา Product คงที่ ยอดเท่าเดิม
  const legacy = {
    id: 'price_legacy', active: true, product: 'prod_old_monthly', lookup_key: 'hop_starter_100_monthly',
    unit_amount: 59000, currency: 'thb', recurring: { interval: 'month' },
    metadata: { kind: 'plan', plan: 'starter', tier: '100', cycle: 'monthly' },
  }
  const st2 = catalog([legacy])
  const p = await ensurePrice(st2, { kind: 'plan', plan: 'starter', tier: 100, cycle: 'monthly', amount: 590 })
  eq('Price เก่า → สร้างใหม่ใต้ hop_starter_100 + ย้าย lookup', [p.product, p.lookup_key, legacy.lookup_key], ['hop_starter_100', 'hop_starter_100_monthly', null])
  eq('ลูกค้าบน Price เก่า = แพ็กเกจเดียวกัน (กดซ้ำไม่ถือว่าเปลี่ยน)', samePrice(legacy, p), true)
  eq('ระดับต่าง ≠ แพ็กเกจเดียวกัน', samePrice(legacy, { ...p, id: 'x', metadata: { ...p.metadata, tier: '250' } }), false)
  eq('ยอดต่าง ≠ แพ็กเกจเดียวกัน', samePrice(legacy, { ...p, id: 'x', unit_amount: 69000 }), false)
  eq('รอบบิลต่าง ≠ แพ็กเกจเดียวกัน', samePrice(legacy, { ...p, id: 'x', recurring: { interval: 'year' } }), false)

  const st3 = catalog([], { hop_seat: { id: 'hop_seat', active: false } })
  await ensurePrice(st3, { kind: 'seats', cycle: 'yearly', amount: 2958 })
  eq('Product ถูก archive → เปิดใช้คืน ไม่สร้างซ้ำ', [c(st3, 'product.update'), c(st3, 'product.create')], [1, 0])
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

// ── 8) ตัดบัตรรอบใหม่ไม่ผ่าน → ขยายสิทธิ์ถึงวันที่ Stripe นัดลองตัดซ้ำ + 1 วัน (ขยายอย่างเดียว ไม่หด) ──
{
  const { extendForRetry } = await fresh()
  const day = (iso) => Math.floor(Date.parse(`${iso}T05:00:00Z`) / 1000) // 12:00 เวลาไทย
  const failed = (o = {}) => ({
    id: 'in_R', status: 'open', billing_reason: 'subscription_cycle', collection_method: 'charge_automatically',
    attempt_count: 2, next_payment_attempt: day('2026-11-10'),
    parent: { subscription_details: { subscription: o.sub || 'sub_P' } }, ...o.extra,
  })
  const subs = [sub('sub_P', 1000), sub('sub_S', 1001, { metadata: { kind: 'seats' } })]
  const st = fakeStripe({ subs })

  orgRow = { sub_expires_at: '2026-11-04', extra_seats_expires_at: '2026-11-04' }
  patches.length = 0
  const r1 = await extendForRetry(st, S, failed())
  eq('ลองตัดครั้งถัดไป 10 พ.ย. → สิทธิ์ถึง 11 พ.ย.', [r1.extended, r1.until, orgRow.sub_expires_at], [true, '2026-11-11', '2026-11-11'])
  eq('อัปเดตแบบมีเงื่อนไข "วันเดิมน้อยกว่า" (ไม่หด)', patches[0]?.url.includes('sub_expires_at=lt.2026-11-11'), true)

  // event มาสลับลำดับ: ครั้งก่อนหน้า (นัด 7 พ.ย.) มาถึงทีหลัง → ต้องไม่หดกลับ
  const r2 = await extendForRetry(st, S, failed({ extra: { next_payment_attempt: day('2026-11-07') } }))
  eq('event เก่ามาทีหลัง → ไม่หดวันหมดอายุ', [r2.extended, orgRow.sub_expires_at], [false, '2026-11-11'])

  patches.length = 0
  const r3 = await extendForRetry(st, S, failed({ extra: { next_payment_attempt: null } }))
  eq('Stripe เลิกลองแล้ว → ไม่ขยาย ไม่แตะ DB', [r3.extended, r3.note, patches.length], [false, 'no-more-retries', 0])

  const r4 = await extendForRetry(st, S, failed({ extra: { billing_reason: 'subscription_update' } }))
  eq('ใบส่วนต่างตอนอัปเกรดไม่ผ่าน (ไม่ใช่รอบต่ออายุ) → ไม่ขยาย', [r4.extended, patches.length], [false, 0])

  const r5 = await extendForRetry(st, S, failed({ extra: { collection_method: 'send_invoice' } }))
  eq('PromptPay → ไม่ขยาย (มี days_until_due อยู่แล้ว)', [r5.extended, patches.length], [false, 0])

  const r6 = await extendForRetry(st, S, failed({ sub: 'sub_S', extra: { next_payment_attempt: day('2026-11-08') } }))
  eq('ค่าที่นั่งไม่ผ่าน → ขยายวันหมดอายุที่นั่ง ไม่แตะแพ็กเกจ',
    [r6.kind, orgRow.extra_seats_expires_at, orgRow.sub_expires_at], ['seats', '2026-11-09', '2026-11-11'])

  orgRow = { sub_expires_at: '2026-01-01' }
  const r7 = await extendForRetry(st, S, failed({ extra: { next_payment_attempt: Math.floor(Date.now() / 1000) + 400 * 86400 } }))
  const capDays = Math.round((Date.parse(r7.until) - Date.now()) / 86400e3)
  eq('ค่านัดผิดปกติ (400 วัน) → ตัดที่ไม่เกิน ~63 วัน', capDays >= 62 && capDays <= 64, true)

  const r8 = await extendForRetry(st, S, failed({ extra: { status: 'paid' } }))
  eq('ใบที่จ่ายแล้ว → ไม่ทำอะไร', r8.extended, false)

  patches.length = 0
  const r9 = await extendForRetry(st, S, failed({ extra: { attempt_count: 0 } }))
  eq('ใบรอบใหม่ที่ยังไม่เคยตัดไม่ผ่าน (invoice.updated ตอนออกใบ) → ไม่ทำอะไร', [r9.extended, patches.length], [false, 0])
}

// ── 9) ที่นั่งเพิ่มยกเลิกตามแพ็กเกจ / กลับมาเมื่อแพ็กเกจต่ออายุ ──
{
  const { cascadeSeats } = await fresh()
  const P_END = 1800000000 // วันจบแพ็กเกจ
  const plan = (o = {}) => sub('sub_P', 1000, { extra: { items: { data: [{ price: PRICE.price_pro250, quantity: 1, current_period_end: P_END }] }, ...o } })
  const seats = (end, o = {}, meta = {}) => sub('sub_S', 2000, {
    metadata: { kind: 'seats', ...meta },
    extra: { items: { data: [{ price: { id: 'price_seat', metadata: { kind: 'seats' } }, quantity: 3, current_period_end: end }] }, ...o },
  })
  const run = async (subs) => { const st = fakeStripe({ subs }); const r = await cascadeSeats(st, subs); return { st, r, subs } }
  const S_SHORT = P_END - 20 * 86400 // ที่นั่งหมดรอบก่อนแพ็กเกจ (รายเดือน)
  const S_LONG = P_END + 90 * 86400 // ที่นั่งหมดรอบหลังแพ็กเกจ (รายปี)

  let t = await run([plan(), seats(S_SHORT)])
  eq('แพ็กเกจปกติ → ไม่แตะที่นั่ง', [t.r, count(t.st, 'sub.update')], [null, 0])

  t = await run([plan({ cancel_at_period_end: true, cancel_at: P_END }), seats(S_SHORT)])
  eq('แพ็กเกจตั้งยกเลิก + ที่นั่งหมดรอบก่อน → ที่นั่งจบวันเดียวกับแพ็กเกจ',
    [t.subs[1].cancel_at, t.subs[1].cancel_at_period_end ?? false, t.subs[1].metadata.hop_cancel_with_plan], [P_END, false, '1'])

  t = await run([plan({ cancel_at: P_END }), seats(S_LONG)])
  eq('แพ็กเกจตั้งยกเลิก (cancel_at แบบ flexible) + ที่นั่งหมดรอบหลัง → ที่นั่งแค่ไม่ต่ออายุ',
    [t.subs[1].cancel_at_period_end, t.subs[1].cancel_at ?? null, t.subs[1].metadata.hop_cancel_with_plan], [true, null, '1'])

  t = await run([plan({ cancel_at_period_end: true }), seats(S_SHORT, { cancel_at_period_end: true })])
  eq('ที่นั่งตั้งยกเลิกไว้แล้ว → ไม่แตะซ้ำ', count(t.st, 'sub.update'), 0)

  t = await run([plan(), seats(S_SHORT, { cancel_at: P_END }, { hop_cancel_with_plan: '1' })])
  eq('แพ็กเกจกลับมาต่ออายุ → ที่นั่งที่ระบบตั้งยกเลิกกลับมาด้วย + ล้างป้าย',
    [t.subs[1].cancel_at, t.subs[1].metadata.hop_cancel_with_plan ?? null], [null, null])

  t = await run([plan(), seats(S_SHORT, { cancel_at_period_end: true })])
  eq('แพ็กเกจปกติ + ลูกค้ายกเลิกที่นั่งเอง (ไม่มีป้าย) → ไม่ดึงกลับ', [count(t.st, 'sub.update'), t.subs[1].cancel_at_period_end], [0, true])

  t = await run([plan({ status: 'canceled', ended_at: 3000 }), seats(S_SHORT)])
  eq('แพ็กเกจจบไปแล้ว (หลังซื้อที่นั่ง) → ที่นั่งไม่ต่ออายุ', [t.subs[1].cancel_at_period_end, t.subs[1].status], [true, 'active'])

  t = await run([plan({ status: 'canceled', ended_at: 3000 }), seats(S_SHORT, { status: 'past_due' })])
  eq('แพ็กเกจจบ + ค่าที่นั่งค้างจ่าย → ยกเลิกที่นั่งทันที เลิกลองตัด', [t.subs[1].status, count(t.st, 'sub.cancel')], ['canceled', 1])

  t = await run([seats(S_SHORT)])
  eq('ไม่มี subscription แพ็กเกจเลย (จ่าย PunPay ยุคก่อน) → ไม่แตะ', [t.r, count(t.st, 'sub.update')], [null, 0])

  t = await run([plan({ status: 'canceled', ended_at: 1500 }), seats(S_SHORT)])
  eq('แพ็กเกจเก่าที่จบก่อนซื้อที่นั่ง → ไม่แตะ', count(t.st, 'sub.update'), 0)

  t = await run([sub('sub_PP', 1000, { metadata: { hop_discarded: '1' }, extra: { status: 'canceled', ended_at: 3000 } }), seats(S_SHORT)])
  eq('PromptPay ที่ทิ้งเพราะไม่เคยจ่าย → ไม่นับเป็นแพ็กเกจจบ', count(t.st, 'sub.update'), 0)

  t = await run([plan(), sub('sub_DUP', 1500, { metadata: { hop_duplicate_of: 'sub_P' }, extra: { status: 'canceled', ended_at: 3000 } }), seats(S_SHORT)])
  eq('ตัวซ้ำที่ถูกยกเลิก + แพ็กเกจจริงยังอยู่ → ไม่แตะที่นั่ง', count(t.st, 'sub.update'), 0)
}

// ── 10) เปิดหน้าอัปเกรด (sync) → ยกเลิกที่นั่งตามแพ็กเกจ + รายงานสถานะล่าสุดให้หน้าเว็บ ──
{
  const { syncFromStripe } = await fresh()
  const subs = [
    sub('sub_P', 1000, { extra: { cancel_at_period_end: true, cancel_at: 1800000000 } }),
    sub('sub_S', 2000, { metadata: { kind: 'seats' }, extra: { items: { data: [{ price: { id: 'price_seat', metadata: { kind: 'seats' } }, quantity: 2, current_period_end: 1790000000 }] } } }),
  ]
  const st = fakeStripe({ subs })
  orgRow = {}
  const r = await syncFromStripe(st, { org: { stripe_customer_id: 'cus_1' }, orgId: 'org_1', s: S })
  eq('sync → ที่นั่งแสดงว่ากำลังยกเลิก', [r.plan?.cancel, r.seats?.cancel], [true, true])
}

// ── 11) กติกาซื้อที่นั่ง (api/_lib/plan.js) — ต้องตรงกับ seatBlock ใน src/lib/plan.ts ──
{
  const { seatPurchaseBlock } = await import(pathToFileURL(resolve('api/_lib/plan.js')).href)
  const future = new Date(Date.now() + 30 * 86400e3).toISOString().slice(0, 10)
  const past = new Date(Date.now() - 2 * 86400e3).toISOString().slice(0, 10)
  const ok = (org) => seatPurchaseBlock(org) === null
  eq('Free → ซื้อไม่ได้', ok({ plan: 'free', sub_status: 'active' }), false)
  eq('ช่วงทดลอง (plan ยังเป็น free) → ซื้อไม่ได้', ok({ plan: 'free', sub_status: 'active', trial_plan: 'pro', trial_expires_at: future }), false)
  eq('ไม่มีแพ็กเกจ → ซื้อไม่ได้', ok({ plan: null }), false)
  eq('Pro หมดอายุ → ซื้อไม่ได้', ok({ plan: 'pro', sub_status: 'active', sub_expires_at: past }), false)
  eq('Pro ถูกระงับ → ซื้อไม่ได้', ok({ plan: 'pro', sub_status: 'suspended', sub_expires_at: future }), false)
  eq('Pro ตั้งยกเลิกไว้ → ซื้อไม่ได้', ok({ plan: 'pro', sub_status: 'active', sub_expires_at: future, sub_cancel_at_period_end: true }), false)
  eq('Basic ใช้งานอยู่ → ซื้อได้', ok({ plan: 'starter', sub_status: 'active', sub_expires_at: future }), true)
  eq('Enterprise ใช้งานอยู่ → ซื้อได้', ok({ plan: 'enterprise', sub_status: 'active', sub_expires_at: null }), true)
}

if (fails.length) {
  console.error(`❌ ไม่ผ่าน ${fails.length} ข้อ (ผ่าน ${pass})`)
  for (const f of fails) console.error('  - ' + f)
  process.exit(1)
}
console.log(`✅ stripe selftest ผ่านทั้งหมด ${pass} ข้อ`)
