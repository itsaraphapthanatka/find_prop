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

// ── ตัวสลับองค์กรตอน super admin "สวมสิทธิ์" องค์กรอยู่ ──────────────
// current_org() = coalesce(impersonate_org_id, org_id) — ตอนสวมสิทธิ์ระบบยึดองค์กรที่สวมเสมอ
// ถ้าสลับ membership เฉยๆ ข้อมูลจะไม่เปลี่ยน (เหมือนสลับไม่ได้) → ต้องออกจากสิทธิ์ก่อนสลับ

/** ค่าที่ใช้เป็น value ของตัวเลือก "องค์กรที่กำลังสวมสิทธิ์อยู่" (เลือกแล้วไม่ทำอะไร) */
export const IMPERSONATED_OPTION = '__impersonating__'

export interface OrgOption {
  value: string
  label: string
}

/**
 * รายการในตัวสลับองค์กร
 * ตอนสวมสิทธิ์องค์กรที่ตัวเองไม่ได้เป็นสมาชิก ต้องมีตัวเลือกขององค์กรนั้นด้วย
 * ไม่งั้น select จะโชว์ค่าผิด (เด้งไปตัวเลือกแรก) ทั้งที่กำลังดูข้อมูลอีกองค์กร
 */
export function orgSwitchOptions(
  myOrgs: { org_id: string; name: string }[],
  current?: { id?: string | null; name?: string | null } | null,
  impersonating = false,
): OrgOption[] {
  const opts = myOrgs.map((o) => ({ value: o.org_id, label: o.name }))
  if (impersonating && current?.id && !myOrgs.some((o) => o.org_id === current.id)) {
    return [{ value: IMPERSONATED_OPTION, label: `${current.name ?? 'องค์กรที่สวมสิทธิ์'} (สวมสิทธิ์)` }, ...opts]
  }
  return opts
}

/** ค่าที่ควรโชว์เป็นตัวเลือกที่เลือกอยู่ */
export function orgSwitchValue(
  myOrgs: { org_id: string; name: string }[],
  current?: { id?: string | null } | null,
  impersonating = false,
): string {
  const id = current?.id ?? ''
  if (impersonating && id && !myOrgs.some((o) => o.org_id === id)) return IMPERSONATED_OPTION
  return id
}

/** ต้องเรียก super_impersonate(null) ก่อนสลับไหม (true = กำลังสวมสิทธิ์และเลือกองค์กรจริง) */
export function needsExitImpersonation(impersonating: boolean, target: string): boolean {
  return impersonating && target !== IMPERSONATED_OPTION && target !== ''
}
