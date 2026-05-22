import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'
import StatusClient from './StatusClient'
import type { DeptStat, OverallStats, LeaderStat } from './StatusClient'

export default async function StatusPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const role = session.user.role as 'super_admin' | 'leadership' | 'department'
  const myDeptId = session.user.departmentId ?? null
  const canManageAll = role === 'super_admin' || role === 'leadership'

  const supabase = createServiceClient()

  let myRegion: string | null = null
  if (role === 'leadership') {
    const { data: ldr } = await supabase.from('users').select('region').eq('id', session.user.id).maybeSingle()
    myRegion = ldr?.region ?? 'Miền Bắc'
  }

  const { data: periodsData } = await supabase
    .from('evaluation_periods')
    .select('id, quarter, year, status, end_date')
    .order('year', { ascending: false })
    .order('quarter', { ascending: false })

  const periods = periodsData ?? []

  const cookieStore = await cookies()
  const selectedId = cookieStore.get('selected_period_id')?.value
  const period = selectedId ? (periods.find(p => p.id === selectedId) ?? periods[0]) : periods[0]

  if (!period) {
    return (
      <div style={{ color: 'rgba(255,255,255,0.25)', fontStyle: 'italic', fontSize: 13, padding: '48px 0' }}>
        Chưa có kỳ đánh giá nào được thiết lập.
      </div>
    )
  }

  const [deptsResult, matrixResult, evalsResult, leadersResult] = await Promise.all([
    supabase.from('departments').select('id, name, code, region').order('name'),
    supabase.from('evaluation_matrix').select('evaluator_id, target_id').eq('period_id', period.id),
    supabase.from('evaluations').select('evaluator_id, target_id, status').eq('period_id', period.id),
    supabase.from('users').select('id, name, region').eq('role', 'leadership'),
  ])

  const depts      = deptsResult.data ?? []
  const matrix     = matrixResult.data ?? []
  const evals      = evalsResult.data ?? []
  const rawLeaders = leadersResult.data ?? []

  // Group leaders by region (for incomingTotal computation)
  const leaderIdsByRegion: Record<string, Set<string>> = {}
  for (const l of rawLeaders) {
    const r = l.region ?? 'Miền Bắc'
    if (!leaderIdsByRegion[r]) leaderIdsByRegion[r] = new Set()
    leaderIdsByRegion[r].add(l.id)
  }

  let totalLeaderTasks = 0
  for (const r of ['Miền Bắc', 'Miền Nam'] as const) {
    const regionLeaderIds = leaderIdsByRegion[r] ?? new Set<string>()
    const regionDepts = depts.filter(d => (d.region ?? 'Miền Bắc') === r)
    totalLeaderTasks += regionLeaderIds.size * regionDepts.length
  }

  // Compute per-leader stats
  const leaders: LeaderStat[] = rawLeaders.map(l => {
    const region = l.region ?? 'Miền Bắc'
    const regionDepts = depts.filter(d => (d.region ?? 'Miền Bắc') === region)
    const leaderEvals = evals.filter(e => e.evaluator_id === l.id)
    const submittedEvals = leaderEvals.filter(e => e.status === 'submitted')
    const submittedTargetIds = new Set(submittedEvals.map(e => e.target_id))
    const submittedTargetCodes = regionDepts
      .filter(d => submittedTargetIds.has(d.id))
      .map(d => d.code ?? d.name)
      .sort()
    const pendingTargetCodes = regionDepts
      .filter(d => !submittedTargetIds.has(d.id))
      .map(d => d.code ?? d.name)
      .sort()
    return {
      id: l.id,
      name: l.name,
      region,
      submittedCount: submittedEvals.length,
      draftCount: leaderEvals.filter(e => e.status === 'draft').length,
      totalTasks: regionDepts.length,
      submittedTargetCodes,
      pendingTargetCodes,
    }
  })

  const deptIds   = new Set(depts.map(d => d.id))
  const totalTasks = matrix.length + totalLeaderTasks
  const submittedCount  = evals.filter(e => e.status === 'submitted').length
  const draftCount      = evals.filter(e => e.status === 'draft').length
  const notStartedCount = Math.max(0, totalTasks - submittedCount - draftCount)

  const overall: OverallStats = { totalTasks, submittedCount, draftCount, notStartedCount }

  const stats: DeptStat[] = depts.map(dept => {
    const outgoing = matrix.filter(m => m.evaluator_id === dept.id)
    const dueCount  = outgoing.length
    const evalMap   = new Map(evals.filter(e => e.evaluator_id === dept.id).map(e => [e.target_id, e.status]))
    const doneCount  = [...evalMap.values()].filter(s => s === 'submitted').length
    const draftCnt   = [...evalMap.values()].filter(s => s === 'draft').length

    const submittedTargetCodes = outgoing
      .filter(m => evalMap.get(m.target_id) === 'submitted')
      .map(m => depts.find(d => d.id === m.target_id)?.code ?? depts.find(d => d.id === m.target_id)?.name ?? m.target_id)
      .sort()

    const pendingTargetCodes = outgoing
      .filter(m => !evalMap.has(m.target_id))
      .map(m => depts.find(d => d.id === m.target_id)?.code ?? depts.find(d => d.id === m.target_id)?.name ?? m.target_id)
      .sort()

    const deptRegion = dept.region ?? 'Miền Bắc'
    const incomingTotal = matrix.filter(m => m.target_id === dept.id).length +
      (leaderIdsByRegion[deptRegion]?.size ?? 0)
    const incomingDone  = evals.filter(e => e.target_id === dept.id && e.status === 'submitted').length

    return {
      id: dept.id, name: dept.name, code: dept.code,
      region: dept.region ?? 'Miền Bắc',
      dueCount, doneCount, draftCount: draftCnt,
      submittedTargetCodes, pendingTargetCodes, incomingDone, incomingTotal,
      isMyDept: dept.id === myDeptId,
    }
  })

  const statusOrder = (s: DeptStat) => {
    if (s.dueCount === 0) return 3
    if (s.doneCount === s.dueCount) return 2
    if (s.doneCount > 0 || s.draftCount > 0) return 1
    return 0
  }
  stats.sort((a, b) => statusOrder(a) - statusOrder(b) || a.name.localeCompare(b.name))

  // Fetch dept avg score for department users
  let deptAvgScore: number | null = null
  let deptMaxScore = 0
  if (role === 'department' && myDeptId && period) {
    const [criteriaRes, targetEvalsRes] = await Promise.all([
      supabase.from('criteria').select('weight').eq('period_id', period.id),
      supabase
        .from('evaluations')
        .select('total_score')
        .eq('period_id', period.id)
        .eq('target_id', myDeptId)
        .eq('status', 'submitted'),
    ])
    const crits = criteriaRes.data ?? []
    deptMaxScore = crits.reduce((s, c) => s + Number(c.weight) * 10, 0)
    const rawScores = (targetEvalsRes.data ?? [])
      .map(e => e.total_score)
      .filter((s): s is number => s != null)
    deptAvgScore = rawScores.length > 0
      ? rawScores.reduce((a, b) => a + b, 0) / rawScores.length
      : null
  }

  return (
    <StatusClient
      periodLabel={`Quý ${period.quarter} · ${period.year}`}
      periodStatus={period.status}
      endDate={period.end_date}
      activePeriodId={period.id}
      periods={periods.map(p => ({ id: p.id, quarter: p.quarter, year: p.year, status: p.status }))}
      stats={stats}
      overall={overall}
      canManageAll={canManageAll}
      isSuperAdmin={role === 'super_admin'}
      leaders={leaders}
      deptAvgScore={deptAvgScore}
      deptMaxScore={deptMaxScore}
      myRegion={myRegion}
    />
  )
}
