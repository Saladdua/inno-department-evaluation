import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import DataProcessingClient from './DataProcessingClient'

export default async function DataProcessingPage() {
  const session = await auth()
  if (!session || !['super_admin', 'leadership'].includes(session.user.role)) redirect('/dashboard')

  const supabase = createServiceClient()

  const [{ data: deptsData }, { data: periodData }] = await Promise.all([
    supabase.from('departments').select('id, name, code').order('name'),
    supabase
      .from('evaluation_periods')
      .select('id, quarter, year')
      .order('year', { ascending: false })
      .order('quarter', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const departments = (deptsData ?? []) as { id: string; name: string; code: string }[]
  const currentPeriodId = periodData?.id ?? null
  const periodLabel = periodData ? `Quý ${periodData.quarter} · ${periodData.year}` : null

  return (
    <DataProcessingClient
      departments={departments}
      currentPeriodId={currentPeriodId}
      periodLabel={periodLabel}
    />
  )
}
