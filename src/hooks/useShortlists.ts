import { useCallback, useEffect, useState } from 'react'
import { supabase, supabaseConfigured } from '../lib/supabase'
import type { Shortlist } from '../types'

/** ชอร์ตลิสต์เสนอลูกค้าที่บันทึกไว้ (ล่าสุดขึ้นก่อน) */
export function useShortlists() {
  const [lists, setLists] = useState<Shortlist[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!supabaseConfigured) {
      setLoading(false)
      return
    }
    const { data, error } = await supabase
      .from('shortlists')
      .select('*')
      .order('updated_at', { ascending: false })
    if (error) {
      // ตารางยังไม่ถูกสร้าง → ชี้ทางให้รัน SQL แทน error ดิบ
      setError(
        error.message.includes('shortlists')
          ? 'ยังไม่ได้เปิดระบบบันทึกชอร์ตลิสต์ — รัน supabase/shortlists.sql ใน SQL Editor ก่อน'
          : error.message,
      )
    } else {
      setError(null)
      setLists((data ?? []) as Shortlist[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { lists, loading, error, reload }
}
