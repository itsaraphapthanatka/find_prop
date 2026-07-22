// Product tour — ทัวร์แนะนำการใช้งานทีละจุด (สปอตไลต์ + คำอธิบาย)
// เล่นอัตโนมัติครั้งแรกหลังล็อกอิน · เล่นซ้ำได้จากปุ่ม "?" บน topbar
// ขั้นที่ target ไม่มีในหน้า/ซ่อนอยู่ (ตามบทบาท/มือถือ) จะถูกข้ามให้อัตโนมัติ

export interface TourStep {
  target?: string // CSS selector ของจุดที่ไฮไลต์ (ไม่ใส่ = การ์ดกลางจอ)
  title: string
  body: string
}

export const TOUR_STEPS: TourStep[] = [
  {
    title: 'ยินดีต้อนรับสู่ HOP 👋',
    body: 'ระบบจัดการทรัพย์สำหรับทีมนายหน้า มาดูจุดใช้งานหลักกันสั้น ๆ ใช้เวลาไม่ถึงนาที',
  },
  {
    target: '[data-tour="search"]',
    title: 'ค้นหาเร็ว',
    body: 'พิมพ์รหัสทรัพย์ ทำเล หรือประเภท แล้วรายการจะถูกกรองให้ทันที',
  },
  {
    target: '[data-tour="nav-map"]',
    title: 'แผนที่',
    body: 'ดูทรัพย์ทุกชิ้นบนแผนที่ หาตำแหน่งตัวเอง และวางหมุดเพิ่มทรัพย์ตรงจุดที่ต้องการได้',
  },
  {
    target: '[data-tour="nav-form"]',
    title: 'เพิ่มทรัพย์ (ฟอร์ม)',
    body: 'กรอกเอง พูดด้วยเสียง (🎤) หรือวางข้อความแล้วให้ AI ช่วยกรอกฟอร์มให้ก็ได้',
  },
  {
    target: '[data-tour="nav-list"]',
    title: 'รายการทรัพย์',
    body: 'ดู กรอง แก้ไข ลบ เปิดรายละเอียด และเลือกหลายชิ้นมาเปรียบเทียบกันได้',
  },
  {
    target: '[data-tour="nav-dashboard"]',
    title: 'สรุปภาพรวม',
    body: 'ตัวเลขพอร์ตทรัพย์ทั้งหมด พร้อมบทวิเคราะห์จาก AI',
  },
  {
    target: '[data-tour="nav-plans"]',
    title: 'แผนเยี่ยมชม',
    body: 'จัดคิวพาลูกค้าดูทรัพย์ ระบบช่วยจับคู่ทรัพย์ให้ตรงความต้องการลูกค้า',
  },
  {
    target: '[data-tour="nav-team"]',
    title: 'ทีม',
    body: 'จัดการสมาชิก บทบาท และตั้งการมองเห็นทรัพย์รายคน (เห็นทั้งทีม/เฉพาะของตัวเอง)',
  },
  {
    target: '[data-tour="nav-super"]',
    title: 'Super Admin',
    body: 'ดูทุกองค์กร บริหารแพ็กเกจ/วันหมดอายุ สวมสิทธิ์เข้าองค์กร และเปิดโหมดรีวิว',
  },
  {
    target: '[data-tour="assistant"]',
    title: 'ผู้ช่วย AI',
    body: 'ถามข้อมูลทรัพย์ สั่งจัดแผนเยี่ยม หรือให้ช่วยหาทรัพย์ที่ตรงโจทย์ — คุยได้เลย',
  },
  {
    title: 'พร้อมแล้ว! 🚀',
    body: 'ลองเพิ่มทรัพย์แรกของคุณได้เลย · อยากดูทัวร์นี้อีกครั้ง กดปุ่ม “?” ที่มุมขวาบนเมื่อไรก็ได้',
  },
]

const SEEN_KEY = 'hop_tour_seen_v1'

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
    /* ไม่มี localStorage ก็ไม่เป็นไร — แค่จะเด้งทัวร์อีกครั้งรอบหน้า */
  }
}

/** เริ่มทัวร์ (ใช้จากปุ่ม "?" หรือที่อื่น) — TourOverlay รอฟัง event นี้ */
export function startTour(): void {
  window.dispatchEvent(new Event('hop-start-tour'))
}
