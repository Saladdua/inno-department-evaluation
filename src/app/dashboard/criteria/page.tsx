import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase/server'
import CriteriaClient, { type Period, type Criterion } from './CriteriaClient'

export default async function CriteriaPage({
  searchParams,
}: {
  searchParams: Promise<{ periodId?: string }>
}) {
  const { periodId } = await searchParams
  const session = await auth()
  const role = (session?.user?.role ?? 'department') as 'super_admin' | 'leadership' | 'department'

  const supabase = createServiceClient()

  const { data: periodsData } = await supabase
    .from('evaluation_periods')
    .select('*')
    .order('year', { ascending: false })
    .order('quarter', { ascending: false })

  const periods: Period[] = periodsData ?? []

  const period = periodId
    ? (periods.find(p => p.id === periodId) ?? periods[0] ?? null)
    : (periods[0] ?? null)

  const criteria: Criterion[] = []
  if (period) {
    const { data } = await supabase
      .from('criteria')
      .select('*')
      .eq('period_id', period.id)
      .order('display_order')
    criteria.push(...(data ?? []))
  }

  return (
    <CriteriaClient
      periods={periods}
      initialPeriod={period}
      initialCriteria={criteria}
      role={role}
    />
  )
}
