import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { getSelectedPeriod } from '@/lib/selected-period'
import DataProcessingClient from './DataProcessingClient'

export default async function DataProcessingPage() {
  const session = await auth()
  if (!session || session.user.role !== 'super_admin') redirect('/dashboard')

  const supabase = createServiceClient()

  const [{ data: deptsData }, periodData] = await Promise.all([
    supabase.from('departments').select('id, name, code').order('name'),
    getSelectedPeriod(),
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
