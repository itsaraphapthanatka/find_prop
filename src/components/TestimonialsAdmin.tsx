import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchTestimonials, isPublishable, type Testimonial, type TestimonialSetting } from '../lib/testimonials'

// การ์ดในหน้า Super Admin: จัดการ "รีวิวลูกค้า" ที่โชว์บนหน้า landing (app_settings 'testimonials')
// กติกา: แสดงบนเว็บได้ต่อเมื่อติ๊ก "ลูกค้าอนุญาตให้เผยแพร่แล้ว" — ห้ามแต่งรีวิวขึ้นเอง

const newItem = (): Testimonial => ({
  id: `t${Date.now().toString(36)}`, name: '', role: '', quote: '', rating: 5, consent: false, published: false,
})

export default function TestimonialsAdmin() {
  const [set, setSet] = useState<TestimonialSetting | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => { void fetchTestimonials().then(setSet) }, [])

  if (!set) return <section className="form-card"><h3>รีวิวลูกค้า (หน้า landing)</h3><div className="loading">กำลังโหลด…</div></section>

  const update = (i: number, patch: Partial<Testimonial>) => {
    setMsg(null)
    setSet({
      ...set,
      items: set.items.map((t, j) => {
        if (j !== i) return t
        const next = { ...t, ...patch }
        if (!next.consent) next.published = false // ไม่ได้รับอนุญาต = แสดงไม่ได้
        return next
      }),
    })
  }
  const move = (i: number, d: -1 | 1) => {
    const items = [...set.items]
    const j = i + d
    if (j < 0 || j >= items.length) return
    ;[items[i], items[j]] = [items[j], items[i]]
    setSet({ ...set, items })
  }
  const remove = (i: number) => {
    if (!window.confirm(`ลบรีวิวของ "${set.items[i].name || 'ไม่มีชื่อ'}"?`)) return
    setSet({ ...set, items: set.items.filter((_, j) => j !== i) })
  }

  async function save() {
    if (!set) return
    setSaving(true)
    setMsg(null)
    const { error } = await supabase.from('app_settings').upsert({
      key: 'testimonials',
      value: { showStats: set.showStats, items: set.items.map((t) => ({ ...t, name: t.name.trim(), role: t.role.trim(), quote: t.quote.trim() })) },
      updated_at: new Date().toISOString(),
    })
    setSaving(false)
    setMsg(error ? `บันทึกไม่สำเร็จ: ${error.message}` : 'บันทึกแล้ว ✓ หน้า landing อัปเดตทันที')
  }

  const shown = set.items.filter(isPublishable).length

  return (
    <section className="form-card">
      <h3>รีวิวลูกค้า (หน้า landing)</h3>
      <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: '0 0 12px' }}>
        ใส่เฉพาะ<b>คำพูดจริงของลูกค้าที่อนุญาตให้เผยแพร่แล้ว</b> — หน้าเว็บแสดงเฉพาะรายการที่ติ๊กทั้ง "อนุญาตแล้ว" และ "แสดงบนเว็บ"
        · ยังไม่มีรีวิวที่แสดงได้ = ส่วนรีวิวจะไม่ขึ้น (แถบตัวเลขยังขึ้นได้ถ้าเปิดไว้)
      </p>
      <label className="check-row" style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginBottom: 12 }}>
        <input type="checkbox" checked={set.showStats} onChange={(e) => { setMsg(null); setSet({ ...set, showStats: e.target.checked }) }} />
        แสดงตัวเลขการใช้งานจริง (ทรัพย์ในระบบ · ทีม · ผู้ใช้ — ไม่นับบัญชีทดสอบ ตามหน้า /stats)
      </label>

      {set.items.length === 0 && <div className="empty-state" style={{ padding: 16 }}>ยังไม่มีรีวิว — กด "+ เพิ่มรีวิว" เมื่อได้คำรีวิวจากลูกค้าแล้ว</div>}

      <div className="tm-list">
        {set.items.map((t, i) => (
          <div key={t.id} className={`tm-item${isPublishable(t) ? ' live' : ''}`}>
            <div className="tm-head">
              <b>#{i + 1}</b>
              <span className={`status-pill${isPublishable(t) ? ' on' : ''}`}>{isPublishable(t) ? 'แสดงบนเว็บ' : 'ไม่แสดง'}</span>
              <span style={{ flex: 1 }} />
              <button type="button" className="btn sm" disabled={i === 0} onClick={() => move(i, -1)} title="เลื่อนขึ้น">↑</button>
              <button type="button" className="btn sm" disabled={i === set.items.length - 1} onClick={() => move(i, 1)} title="เลื่อนลง">↓</button>
              <button type="button" className="btn sm" onClick={() => remove(i)}>ลบ</button>
            </div>
            <div className="form-grid-2">
              <div className="form-field">
                <label>ชื่อลูกค้า <span className="req">*</span></label>
                <input type="text" maxLength={60} value={t.name} placeholder="ตามที่ลูกค้ายินยอม เช่น คุณสมชาย ก."
                  onChange={(e) => update(i, { name: e.target.value })} />
              </div>
              <div className="form-field">
                <label>ตำแหน่ง / บริษัท</label>
                <input type="text" maxLength={80} value={t.role} placeholder="เช่น หัวหน้าทีม · ชื่อบริษัท"
                  onChange={(e) => update(i, { role: e.target.value })} />
              </div>
            </div>
            <div className="form-field">
              <label>ข้อความรีวิว (คำพูดของลูกค้า) <span className="req">*</span></label>
              <textarea maxLength={400} value={t.quote} onChange={(e) => update(i, { quote: e.target.value })} />
            </div>
            <div className="tm-flags">
              <label>
                ดาว{' '}
                <select className="plan-select" value={t.rating ?? ''} onChange={(e) => update(i, { rating: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">ไม่แสดงดาว</option>
                  {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{'★'.repeat(n)}</option>)}
                </select>
              </label>
              <label><input type="checkbox" checked={t.consent} onChange={(e) => update(i, { consent: e.target.checked })} /> ลูกค้าอนุญาตให้เผยแพร่แล้ว</label>
              <label title={t.consent ? '' : 'ต้องได้รับอนุญาตก่อน'} style={{ opacity: t.consent ? 1 : 0.5 }}>
                <input type="checkbox" checked={t.published} disabled={!t.consent} onChange={(e) => update(i, { published: e.target.checked })} /> แสดงบนเว็บ
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="form-actions-row" style={{ marginTop: 12 }}>
        <button type="button" className="btn" onClick={() => { setMsg(null); setSet({ ...set, items: [...set.items, newItem()] }) }}>+ เพิ่มรีวิว</button>
        <button type="button" className="btn primary" disabled={saving} onClick={() => void save()}>
          {saving ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
        <span className="stop-sub">แสดงบนเว็บ {shown} รีวิว</span>
        {msg && <span className="stop-sub">{msg}</span>}
      </div>
    </section>
  )
}
