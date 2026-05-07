import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase/server'
import MatrixClient, { type Department, type MatrixEntry } from './MatrixClient'

export default async function MatrixPage() {
  const session = await auth()
  const role = (session?.user?.role ?? 'department') as 'super_admin' | 'leadership' | 'department'
  const myDeptId = session?.user?.departmentId ?? null
  const myUserId = session?.user?.id ?? null

  const supabase = createServiceClient()

  const { data: period } = await supabase
    .from('evaluation_periods')
    .select('id, quarter, year')
    .order('year', { ascending: false })
    .order('quarter', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: depts } = await supabase
    .from('departments')
    .select('id, name, code, display_order')
    .order('display_order', { ascending: true })
    .order('name', { ascending: true })

  const entries: MatrixEntry[] = []
  if (period) {
    const { data } = await supabase
      .from('evaluation_matrix')
      .select('evaluator_id, target_id, selected_by')
      .eq('period_id', period.id)
    entries.push(...(data ?? []))
  }

  const periodLabel = period ? `Quý ${period.quarter} · ${period.year}` : 'Chưa có kỳ'

  return (
    <MatrixClient
      initialDepts={(depts ?? []) as Department[]}
      initialEntries={entries}
      periodId={period?.id ?? null}
      periodLabel={periodLabel}
      role={role}
      myDeptId={myDeptId}
      myUserId={myUserId}
    />
  )
}
