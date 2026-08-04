// ปลายทางหลัง "สลับองค์กร"
// สลับ org แล้วต้องโหลดหน้าใหม่ (full reload) เพื่อให้ทุกหน้าดึงข้อมูลขององค์กรใหม่ครบ กันข้อมูลค้างของเก่า
// — เดิมเด้งไป '/' ทุกครั้ง ทำให้คนที่กำลังดูสรุปภาพรวม/แผนที่ ต้องกดกลับเข้าไปเอง
//   ตอนนี้อยู่หน้าไหนก็กลับหน้านั้น ยกเว้นหน้าที่ผูกกับข้อมูลชิ้นเดียวขององค์กรเดิม

/** หน้าที่ผูกกับ record ชิ้นเดียว — ข้ามองค์กรแล้วหาไม่เจอ (จะขึ้น error) จึงกลับไปหน้ารายการ */
const RECORD_ROUTES = ['/edit/']

/**
 * URL ที่ควรโหลดหลังสลับองค์กร
 * @param pathname path ปัจจุบัน (จาก useLocation)
 * @param search query string ปัจจุบัน (คงตัวกรองของหน้ารายการ/แผนที่ไว้)
 */
export function urlAfterOrgSwitch(pathname: string, search = ''): string {
  if (!pathname || !pathname.startsWith('/')) return '/'
  if (RECORD_ROUTES.some((r) => pathname.startsWith(r))) return '/'
  return pathname + search
}
