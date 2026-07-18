import { useCallback, useEffect, useState } from 'react'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { logActivity } from '../lib/activityLog'
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
    // join ชื่อองค์กรมาด้วย — ใช้แสดงป้าย/ตัวกรองตอนล็อกอินเป็น super (คนในองค์กรได้ชื่อ org ตัวเองซึ่งไม่ถูกแสดง)
    let { data, error } = await supabase
      .from('properties')
      .select('*, organizations(name)')
      .order('code', { ascending: true })
    if (error) {
      // ฐานข้อมูลบางชุดอาจ join organizations ไม่ได้ (เช่นยังไม่รัน org.sql) — ถอยมาอ่านแบบไม่มีชื่อองค์กร
      ;({ data, error } = await supabase.from('properties').select('*').order('code', { ascending: true }))
    }
    if (error) setError(error.message)
    else {
      const rows = (data ?? []) as (Property & { organizations?: { name: string } | null })[]
      setItems(rows.map(({ organizations, ...p }) => ({ ...p, org_name: organizations?.name ?? null })))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { items, loading, error, reload }
}

export async function deleteProperty(id: string, code?: string | null): Promise<string | null> {
  const { error } = await supabase.from('properties').delete().eq('id', id)
  if (!error) logActivity('property.delete', code ?? null)
  return error ? error.message : null
}
