// Product tour — ทัวร์แนะนำการใช้งาน "พาเปลี่ยนหน้าจริง" แล้วไฮไลต์ฟีเจอร์ทีละจุด
// เล่นอัตโนมัติครั้งแรกหลังล็อกอิน · เล่นซ้ำได้จากปุ่ม "?" บน topbar
// แต่ละขั้น: ไปหน้า (route) → รอจุดเป้าหมาย (target) โผล่ → ไฮไลต์
// ถ้าจุดเป้าหมายไม่โผล่ใน ~2 วิ (ไม่มีข้อมูล/ไม่มีสิทธิ์) จะข้ามให้อัตโนมัติ

export interface TourStep {
  route?: string // ไปหน้านี้ก่อน (ถ้ายังไม่อยู่)
  target?: string // CSS selector จุดไฮไลต์ (ไม่ใส่ = การ์ดกลางจอ)
  title: string
  body: string
}

export interface TourFlags {
  isSuper: boolean
  canTeam: boolean // แอดมินที่มีองค์กร หรือ super ที่กำลังสวมสิทธิ์
}

/** สร้างลำดับขั้นทัวร์ตามบทบาทผู้ใช้ (ตัดขั้นที่ผู้ใช้เข้าไม่ถึงออก) */
export function buildTourSteps({ isSuper, canTeam }: TourFlags): TourStep[] {
  const steps: TourStep[] = [
    {
      route: '/',
      title: 'ยินดีต้อนรับสู่ HOP 👋',
      body: 'พาชมการใช้งานทีละจุดแบบเร็ว ๆ — จะพาเปลี่ยนหน้าให้เองอัตโนมัติ กด “ข้าม” ออกได้ทุกเมื่อ',
    },
    {
      route: '/',
      target: '[data-tour="search"]',
      title: 'ค้นหาทรัพย์',
      body: 'พิมพ์รหัส ทำเล หรือประเภท รายการจะถูกกรองให้ทันทีทั่วทั้งระบบ',
    },
    // ── แผนที่ ──
    {
      route: '/map',
      target: '.locate-btn',
      title: 'แผนที่ · หาตำแหน่งฉัน',
      body: 'กดเพื่อไปตำแหน่งปัจจุบัน แล้วกด “+ เพิ่มทรัพย์ที่นี่” ในป๊อปอัป · หรือ “วางหมุดเพิ่มทรัพย์” เพื่อปักจุดเองก็ได้',
    },
    {
      route: '/map',
      target: '.map-legend',
      title: 'แผนที่ · กรองตามประเภท',
      body: 'แถบสีด้านล่างบอกจำนวนทรัพย์แต่ละประเภท — แตะเพื่อดูเฉพาะประเภทนั้นบนแผนที่',
    },
    // ── ฟอร์มเพิ่มทรัพย์ ──
    {
      route: '/new',
      target: '.ai-card',
      title: 'เพิ่มทรัพย์ · เสียง/AI',
      body: 'พูดด้วยไมค์ 🎤 หรือวางข้อความจากแชท แล้วให้ AI กรอกลงฟอร์มให้ — ตรวจก่อนบันทึกเสมอ',
    },
    {
      route: '/new',
      target: '.photo-grid',
      title: 'เพิ่มทรัพย์ · รูปภาพ',
      body: 'ใส่รูปได้หลายรูป (สูงสุด 10) รูปแรกคือรูปปก · เหนือขึ้นไปเลือกประเภท (มีสี/ไอคอน) และเช่า/ขายได้',
    },
    {
      route: '/new',
      target: '.form-actions',
      title: 'เพิ่มทรัพย์ · บันทึก',
      body: 'มีการ์ด “ตำแหน่ง” ให้ปักหมุดบนแผนที่ + ปุ่ม “ตำแหน่งฉัน” · กรอกครบแล้วกดบันทึกได้เลย',
    },
    // ── รายการทรัพย์ ──
    {
      route: '/',
      target: '.filter-bar',
      title: 'รายการทรัพย์ · ตัวกรอง',
      body: 'กรองตามเช่า/ขาย ประเภท จังหวัด และช่วงราคา · แต่ละการ์ดมีปุ่มโทร/ส่งข้อความ/แผนที่/แก้ไข/ลบ',
    },
    {
      route: '/',
      target: '[data-tour="list-actions"]',
      title: 'รายการทรัพย์ · นำเข้า/เทียบ',
      body: 'นำเข้าทรัพย์จำนวนมากจาก Excel/CSV · หรือกด “เปรียบเทียบ” เลือกหลายชิ้นมาดูเทียบกัน',
    },
    // ── สรุปภาพรวม ──
    {
      route: '/dashboard',
      target: '.dash-tiles',
      title: 'สรุปภาพรวม',
      body: 'ตัวเลขพอร์ตทั้งหมด (จำนวน ค่าเช่ารวม มูลค่าขาย นัดหมาย) พร้อมบทวิเคราะห์จาก AI ด้านล่าง',
    },
    // ── แผนเยี่ยมชม ──
    {
      route: '/plans',
      target: '[data-tour="plan-new"]',
      title: 'แผนเยี่ยมชม',
      body: 'จัดคิวพาลูกค้าดูทรัพย์ · ใส่ “requirement” ของลูกค้า แล้วให้ AI ช่วยจับคู่ทรัพย์ที่ตรงที่สุด',
    },
    // ── เปรียบเทียบ ──
    {
      route: '/compare',
      target: '.compare-controls',
      title: 'เปรียบเทียบทรัพย์',
      body: 'เลือกทรัพย์ตั้งแต่ 2 ชิ้นขึ้นไป ดูสเปกเทียบกันเป็นตาราง + ให้ AI สรุปข้อดี/ข้อควรพิจารณาและคำแนะนำ',
    },
  ]

  if (canTeam) {
    steps.push({
      route: '/team',
      target: '[data-tour="team-add"]',
      title: 'ทีม',
      body: 'เพิ่มลูกทีม (สร้างบัญชีให้ใช้ได้ทันที) · ตั้งบทบาท เปิด/ปิดใช้งาน และการเห็นทรัพย์รายคน (ทั้งทีม/เฉพาะของตัวเอง)',
    })
  }
  if (isSuper) {
    steps.push({
      route: '/super',
      target: '[data-tour="super-review"]',
      title: 'Super Admin',
      body: 'เปิด-ปิดโหมดรีวิว QA + ดูผลรีวิวรายคน · ด้านล่างจัดการทุกองค์กร แพ็กเกจ/วันหมดอายุ และสวมสิทธิ์เข้าองค์กรได้',
    })
  }

  steps.push(
    {
      route: '/',
      target: '[data-tour="assistant"]',
      title: 'ผู้ช่วย AI',
      body: 'ปุ่มนี้เปิดแชทผู้ช่วย — ถามข้อมูลทรัพย์ ให้ช่วยหาที่ตรงโจทย์ หรือสั่งจัดแผนเยี่ยมได้ทุกเมื่อ',
    },
    {
      route: '/',
      title: 'พร้อมแล้ว! 🚀',
      body: 'เริ่มเพิ่มทรัพย์แรกของคุณได้เลย · อยากดูทัวร์นี้อีกครั้ง กดปุ่ม “?” มุมขวาบนเมื่อไรก็ได้',
    },
  )
  return steps
}

const SEEN_KEY = 'hop_tour_seen_v2'

export function tourSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

export function markTourSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    /* ไม่มี localStorage ก็ไม่เป็นไร */
  }
}

/** เริ่มทัวร์ (จากปุ่ม "?" หรือที่อื่น) — TourOverlay รอฟัง event นี้ */
export function startTour(): void {
  window.dispatchEvent(new Event('hop-start-tour'))
}
