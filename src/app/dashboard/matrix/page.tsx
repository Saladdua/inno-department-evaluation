import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { getSelectedPeriod } from '@/lib/selected-period'
import MatrixClient, { type Department, type MatrixEntry, type CommitEntry, type PeriodOption } from './MatrixClient'

export default async function MatrixPage() {
  const session = await auth()
  const role = (session?.user?.role ?? 'department') as 'super_admin' | 'leadership' | 'department'
  const myDeptId = session?.user?.departmentId ?? null
  const myUserId = session?.user?.id ?? null

  const supabase = createServiceClient()

  const { data: periodsData } = await supabase
    .from('evaluation_periods')
    .select('id, quarter, year, matrix_locked, status')
    .order('year', { ascending: false })
    .order('quarter', { ascending: false })
  const allPeriods = periodsData ?? []

  const basePeriod = await getSelectedPeriod()
  const period = basePeriod
    ? (allPeriods.find(p => p.id === basePeriod.id) ?? allPeriods[0] ?? null)
    : (allPeriods[0] ?? null)

  const { data: depts } = await supabase
    .from('departments')
    .select('id, name, code, display_order, region')
    .order('display_order', { ascending: true })
    .order('name', { ascending: true })

  // Derive the user's locked region (null = super_admin, sees tabs)
  let myRegion: string | null = null
  if (role === 'leadership' && myUserId) {
    const { data: leaderUser } = await supabase
      .from('users')
      .select('region')
      .eq('id', myUserId)
      .maybeSingle()
    myRegion = leaderUser?.region ?? 'Miền Bắc'
  } else if (role === 'department') {
    const myDept = (depts ?? []).find(d => d.id === myDeptId)
    myRegion = myDept?.region ?? 'Miền Bắc'
  }

  const entries: MatrixEntry[] = []
  if (period) {
    const { data } = await supabase
      .from('evaluation_matrix')
      .select('evaluator_id, target_id, selected_by')
      .eq('period_id', period.id)
    entries.push(...(data ?? []))
  }

  // Fetch which depts have committed their matrix
  const commits: CommitEntry[] = []
  if (period) {
    const { data: commitsData } = await supabase
      .from('matrix_commits')
      .select('dept_id, committed_at')
      .eq('period_id', period.id)
    commits.push(...(commitsData ?? []))
  }

  const periodLabel = period ? `Quý ${period.quarter} · ${period.year}` : 'Chưa có kỳ'

  const periods: PeriodOption[] = allPeriods.map(p => ({ id: p.id, quarter: p.quarter, year: p.year }))

  return (
    <MatrixClient
      initialDepts={(depts ?? []) as Department[]}
      initialEntries={entries}
      periodId={period?.id ?? null}
      periodLabel={periodLabel}
      periods={periods}
      role={role}
      myDeptId={myDeptId}
      myUserId={myUserId}
      matrixLocked={period?.matrix_locked ?? false}
      periodStatus={(period?.status ?? 'draft') as 'draft' | 'open' | 'closed'}
      committedDepts={commits}
      myRegion={myRegion}
    />
  )
}
