import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'

export async function getSelectedPeriod() {
  const store = await cookies()
  const id = store.get('selected_period_id')?.value ?? null

  const supabase = createServiceClient()
  const { data: periods } = await supabase
    .from('evaluation_periods')
    .select('id, quarter, year, status')
    .order('year', { ascending: false })
    .order('quarter', { ascending: false })

  const list = periods ?? []
  if (!list.length) return null

  return id ? (list.find(p => p.id === id) ?? list[0]) : list[0]
}
