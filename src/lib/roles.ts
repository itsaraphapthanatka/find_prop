// บทบาทและสิทธิ์ 8 ระดับ — ต้องตรงกับฟังก์ชันใน supabase/roles.sql (ฐานข้อมูลเป็นตัวบังคับจริง)
// ที่นี่ใช้สำหรับ "ซ่อน/ปิดปุ่ม" และข้อความอธิบาย ไม่ใช่ด่านความปลอดภัย
import type { Property } from '../types'

export type Role =
  | 'owner' | 'manager' | 'associate' | 'analyst' | 'survey' | 'temporary' | 'social' | 'trainee'

export const ROLES: Role[] = [
  'owner', 'manager', 'associate', 'analyst', 'survey', 'temporary', 'social', 'trainee',
]

/** ชื่อและคำอธิบายที่โชว์ให้ผู้ใช้ (หน้าจัดการทีม/โปรไฟล์) */
export const ROLE_INFO: Record<Role, { name: string; short: string; desc: string }> = {
  owner: {
    name: 'เจ้าขององค์กร (Owner)', short: 'Owner',
    desc: 'ทำได้ทุกอย่าง — เห็นทุกข้อมูล จัดการทีม/แพ็กเกจ และนำข้อมูลออกได้',
  },
  manager: {
    name: 'ผู้จัดการ (Manager)', short: 'Manager',
    desc: 'เห็นและแก้ทรัพย์ได้ทั้งองค์กร ลบของคนอื่นได้ (ยกเว้นทรัพย์ที่ Owner ลง) · นำข้อมูลออกไม่ได้',
  },
  associate: {
    name: 'นายหน้าร่วม (Associate)', short: 'Associate',
    desc: 'เห็นทรัพย์ทั้งองค์กร แต่ไม่เห็นข้อมูลติดต่อเจ้าของทรัพย์ของคนอื่น · แก้/ลบของคนอื่นไม่ได้',
  },
  analyst: {
    name: 'นักวิเคราะห์ (Analyst)', short: 'Analyst',
    desc: 'เห็นทรัพย์ทั้งองค์กร แต่ไม่เห็นข้อมูลติดต่อเจ้าของและพิกัด/ลิงก์แผนที่ของคนอื่น (เห็นชื่อ-เบอร์คนลงข้อมูล)',
  },
  survey: {
    name: 'ทีมสำรวจ (Survey)', short: 'Survey',
    desc: 'เห็นทรัพย์ทั้งองค์กร · เห็นพิกัด/แผนที่เฉพาะเขตที่ถูกกำหนดให้ · ไม่เห็นข้อมูลติดต่อเจ้าของ',
  },
  temporary: {
    name: 'ชั่วคราว (Temporary)', short: 'Temporary',
    desc: 'เห็นทรัพย์เฉพาะเขตที่ถูกกำหนดให้ (พร้อมพิกัด) · ไม่เห็นข้อมูลติดต่อเจ้าของ',
  },
  social: {
    name: 'ดูแลโซเชียล (Social Media Admin)', short: 'Social',
    desc: 'ดูได้อย่างเดียว — เพิ่ม/แก้/ลบไม่ได้ · ไม่เห็นข้อมูลติดต่อเจ้าของและพิกัดของคนอื่น',
  },
  trainee: {
    name: 'ฝึกงาน (Trainee)', short: 'Trainee',
    desc: 'เห็นเฉพาะทรัพย์ที่ตัวเองลง · นำข้อมูลออกไม่ได้',
  },
}

export interface RolePerm {
  /** เห็นทรัพย์ของคนอื่นในองค์กร (temporary = เฉพาะเขตที่กำหนด) */
  seeOthers: boolean
  /** เห็นเฉพาะทรัพย์ในเขตที่ถูกกำหนดให้ */
  areaScoped: boolean
  /** แก้ทรัพย์ของคนอื่นได้ */
  editOthers: boolean
  /** ลบทรัพย์ของคนอื่นได้ */
  deleteOthers: boolean
  /** ลบทรัพย์ที่ Owner เป็นคนลงได้ */
  deleteOwnerData: boolean
  /** เพิ่ม/แก้/ลบอะไรไม่ได้เลย (ดูล้วน) */
  readOnly: boolean
  /** ปิดข้อมูลติดต่อเจ้าของทรัพย์ของคนอื่น */
  maskContact: boolean
  /** ปิดพิกัด/ลิงก์แผนที่ของคนอื่น ('area' = เห็นเฉพาะในเขตที่กำหนด) */
  maskLocation: boolean | 'area'
  /** นำข้อมูลออก Excel/CSV */
  canExport: boolean
  /** จัดการทีม/บทบาท/เขต + แพ็กเกจและการชำระเงิน */
  canManageOrg: boolean
  /** เข้าหน้าประวัติการใช้งานได้ */
  canSeeLogs: boolean
}

const P = (o: Partial<RolePerm>): RolePerm => ({
  seeOthers: true, areaScoped: false, editOthers: false, deleteOthers: false, deleteOwnerData: false,
  readOnly: false, maskContact: false, maskLocation: false, canExport: false,
  canManageOrg: false, canSeeLogs: false, ...o,
})

export const ROLE_PERM: Record<Role, RolePerm> = {
  owner: P({
    editOthers: true, deleteOthers: true, deleteOwnerData: true,
    canExport: true, canManageOrg: true, canSeeLogs: true,
  }),
  // ลบของคนอื่นได้ แต่ห้ามลบทรัพย์ที่ Owner ลงไว้ (ตามสเปก) — แก้ได้ทุกแถว
  manager: P({ editOthers: true, deleteOthers: true, canSeeLogs: true }),
  associate: P({ maskContact: true }),
  analyst: P({ maskContact: true, maskLocation: true }),
  survey: P({ maskContact: true, maskLocation: 'area' }),
  temporary: P({ areaScoped: true, maskContact: true, maskLocation: 'area' }),
  social: P({ readOnly: true, maskContact: true, maskLocation: true }),
  trainee: P({ seeOthers: false }),
}

/** สิทธิ์ของบทบาท (บทบาทแปลก/ยังไม่โหลด = ให้น้อยสุดไว้ก่อน) */
export function rolePerm(role?: string | null): RolePerm {
  return ROLE_PERM[(role ?? '') as Role] ?? ROLE_PERM.trainee
}

export function roleName(role?: string | null): string {
  return ROLE_INFO[(role ?? '') as Role]?.short ?? (role || '—')
}

/** ทรัพย์ชิ้นนี้ฉันลงเองไหม */
export function isMine(p: Pick<Property, 'created_by'>, userId?: string | null): boolean {
  return Boolean(userId && p.created_by === userId)
}

/** แก้ทรัพย์ชิ้นนี้ได้ไหม — ตรงกับ can_edit_property() ในฐานข้อมูล */
export function canEdit(p: Pick<Property, 'created_by'>, role?: string | null, userId?: string | null): boolean {
  const perm = rolePerm(role)
  if (perm.readOnly) return false
  return isMine(p, userId) || perm.editOthers
}

/**
 * ลบทรัพย์ชิ้นนี้ได้ไหม — ตรงกับ can_delete_property() ในฐานข้อมูล
 * ownerIds = ผู้ใช้ที่เป็น Owner ขององค์กร (Manager ลบทรัพย์ของ Owner ไม่ได้)
 */
export function canDelete(
  p: Pick<Property, 'created_by'>,
  role?: string | null,
  userId?: string | null,
  ownerIds?: Set<string>,
): boolean {
  const perm = rolePerm(role)
  if (perm.readOnly) return false
  if (isMine(p, userId)) return true
  if (!perm.deleteOthers) return false
  if (!perm.deleteOwnerData && p.created_by && ownerIds?.has(p.created_by)) return false
  return true
}
