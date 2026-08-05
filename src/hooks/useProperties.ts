import { useCallback, useEffect, useState } from 'react'
import { supabase, supabaseConfigured } from '../lib/supabase'
import type { Property } from '../types'

export function useProperties() {
  const [items, setItems] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!supabaseConfigured) {
      setLoading(false)
      return
    }
    setLoading(true)
    // อ่านทรัพย์จาก view properties_view เท่านั้น (ไม่ใช่ตาราง properties):
    // view เป็นด่านที่ปิดข้อมูลติดต่อเจ้าของ/พิกัดตามบทบาท และกรองแถวตามสิทธิ์ — ดู supabase/roles.sql
    // ชื่อองค์กรดึงแยกอีก query แล้วจับคู่เองที่นี่ (ทนกว่า embed ของ PostgREST ที่พึ่ง FK/schema cache)
    // ชื่อคนลงทรัพย์ดึงผ่าน RPC (SECURITY DEFINER) เพราะ RLS ปิดไม่ให้ลูกทีมอ่านโปรไฟล์คนอื่น
    const [propsRes, orgsRes, membersRes] = await Promise.all([
      supabase.from('properties_view').select('*').order('code', { ascending: true }),
      supabase.from('organizations').select('id, name'),
      supabase.rpc('org_member_names'),
    ])
    if (propsRes.error) setError(propsRes.error.message)
    else {
      const nameById = new Map(
        ((orgsRes.data ?? []) as { id: string; name: string }[]).map((o) => [o.id, o.name]),
      )
      // ถ้า RPC ยังไม่ถูกติดตั้ง (membersRes.error) ก็แค่ไม่โชว์ชื่อ — ไม่ทำให้รายการพัง
      const memberById = new Map(
        ((membersRes.data ?? []) as { id: string; name: string }[]).map((m) => [m.id, m.name]),
      )
      const rows = (propsRes.data ?? []) as Property[]
      setItems(
        rows.map((p) => ({
          ...p,
          org_name: (p.org_id && nameById.get(p.org_id)) || null,
          // ชื่อคนลงทรัพย์: ใช้จาก RPC ก่อน (ชื่อล่าสุด) · ไม่มีก็ใช้ค่าที่ view ส่งมา
          created_by_name: (p.created_by && memberById.get(p.created_by)) || p.created_by_name || null,
        })),
      )
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { items, loading, error, reload }
}

/** ลบทรัพย์ — ประวัติ (property.delete) ถูกบันทึกโดย trigger ในฐานข้อมูล (supabase/logs-triggers.sql) */
export async function deleteProperty(id: string): Promise<string | null> {
  const { error } = await supabase.from('properties').delete().eq('id', id)
  return error ? error.message : null
}
