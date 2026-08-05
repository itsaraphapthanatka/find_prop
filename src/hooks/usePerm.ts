// สิทธิ์ของผู้ใช้ปัจจุบัน (บทบาท 8 ระดับ) สำหรับใช้ในหน้า UI
// ⚠️ นี่คือ "ชั้นซ่อนปุ่ม" เท่านั้น — ตัวบังคับจริงคือ policy/view ในฐานข้อมูล (supabase/roles.sql)
import { useEffect, useState } from 'react'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { canDelete, canEdit, rolePerm, type RolePerm } from '../lib/roles'
import type { Property } from '../types'

export interface Perm extends RolePerm {
  role: string | null
  userId: string | null
  /** แก้ทรัพย์ชิ้นนี้ได้ไหม */
  canEdit: (p: Pick<Property, 'created_by'>) => boolean
  /** ลบทรัพย์ชิ้นนี้ได้ไหม */
  canDelete: (p: Pick<Property, 'created_by'>) => boolean
}

export function usePerm(): Perm {
  const { profile } = useAuth()
  // super = owner เสมอ (ทั้งโหมดภาพรวมและสวมสิทธิ์) — ตรงกับ my_role() ในฐานข้อมูล
  const role = profile?.is_super ? 'owner' : profile?.role ?? null
  const perm = rolePerm(role)

  // Manager ลบทรัพย์ที่ "Owner ลงไว้" ไม่ได้ → ต้องรู้ว่าใครเป็น Owner ขององค์กร
  // ดึงเฉพาะกรณีที่จำเป็น (บทบาทอื่นลบของคนอื่นไม่ได้อยู่แล้ว)
  const needOwners = perm.deleteOthers && !perm.deleteOwnerData
  const [ownerIds, setOwnerIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!needOwners || !supabaseConfigured || !profile?.org_id) return
    let cancelled = false
    void supabase
      .from('memberships')
      .select('user_id, role')
      .eq('org_id', profile.org_id)
      .eq('role', 'owner')
      .then(({ data }) => {
        if (cancelled) return
        setOwnerIds(new Set(((data ?? []) as { user_id: string }[]).map((m) => m.user_id)))
      })
    return () => { cancelled = true }
  }, [needOwners, profile?.org_id])

  return {
    ...perm,
    role,
    userId: profile?.id ?? null,
    canEdit: (p) => canEdit(p, role, profile?.id),
    canDelete: (p) => canDelete(p, role, profile?.id, ownerIds),
  }
}
