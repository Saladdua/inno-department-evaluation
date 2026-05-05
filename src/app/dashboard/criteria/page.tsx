import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase/server'
import CriteriaClient, { type Period, type Criterion } from './CriteriaClient'

export default async function CriteriaPage() {
  const session = await auth()
  const role = (session?.user?.role ?? 'department') as 'super_admin' | 'leadership' | 'department'

  const supabase = createServiceClient()

  const { data: period } = await supabase
    .from('evaluation_periods')
    .select('*')
    .order('year', { ascending: false })
    .order('quarter', { ascending: false })
    .limit(1)
    .maybeSingle()

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
      initialPeriod={(period as Period | null)}
      initialCriteria={criteria}
      role={role}
    />
  )
}
