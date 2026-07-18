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
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .order('code', { ascending: true })
    if (error) setError(error.message)
    else setItems((data ?? []) as Property[])
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
