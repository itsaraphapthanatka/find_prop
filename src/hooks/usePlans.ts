import { useCallback, useEffect, useState } from 'react'
import { supabase, supabaseConfigured } from '../lib/supabase'
import type { VisitPlan } from '../types'

export function usePlans() {
  const [plans, setPlans] = useState<VisitPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!supabaseConfigured) {
      setLoading(false)
      return
    }
    const { data, error } = await supabase
      .from('visit_plans')
      .select('*')
      .order('updated_at', { ascending: false })
    if (error) {
      // ตารางยังไม่ถูกสร้าง → ชี้ทางให้รัน plans.sql แทน error ดิบ
      setError(
        error.message.includes('visit_plans')
          ? 'ยังไม่ได้สร้างตารางแผนเยี่ยมชม — รัน supabase/plans.sql ใน SQL Editor ก่อน'
          : error.message,
      )
    } else {
      setError(null)
      setPlans((data ?? []) as VisitPlan[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { plans, loading, error, reload }
}
