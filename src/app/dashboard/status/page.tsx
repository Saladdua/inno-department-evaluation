import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'
import StatusClient from './StatusClient'
import type { DeptStat, OverallStats, LeaderStat, LeaderCriterion, LeaderDeptResult, DeptCriterionScore } from './StatusClient'

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

  // Extract the current leader's own stat
  const myLeaderStat: LeaderStat | null = role === 'leadership'
    ? (leaders.find(l => l.id === session.user.id) ?? null)
    : null

  // Compute leader aggregate results (per-dept per-criterion averages)
  let leaderResults: LeaderDeptResult[] = []
  let leaderCriteriaData: LeaderCriterion[] = []

  if (role === 'leadership' && myRegion && period) {
    const regionDepts = depts.filter(d => (d.region ?? 'Miền Bắc') === myRegion)
    const regionDeptIds = regionDepts.map(d => d.id)

    const [criteriaRes, submittedEvalsRes] = await Promise.all([
      supabase
        .from('criteria')
        .select('id, code, name, input_type')
        .eq('period_id', period.id)
        .eq('region', myRegion)
        .order('display_order'),
      regionDeptIds.length > 0
        ? supabase
            .from('evaluations')
            .select('id, target_id')
            .eq('period_id', period.id)
            .eq('status', 'submitted')
            .in('target_id', regionDeptIds)
        : Promise.resolve({ data: [] as { id: string; target_id: string }[] }),
    ])

    leaderCriteriaData = (criteriaRes.data ?? []).map(c => ({
      id: c.id,
      code: c.code ?? null,
      name: c.name,
      input_type: c.input_type as 'manual' | 'auto',
    }))

    const submittedEvals = (submittedEvalsRes.data ?? []) as { id: string; target_id: string }[]
    const evalIds = submittedEvals.map(e => e.id)

    let evalScores: { evaluation_id: string; criteria_id: string; raw_score: number | null }[] = []
    if (evalIds.length > 0) {
      const { data } = await supabase
        .from('evaluation_scores')
        .select('evaluation_id, criteria_id, raw_score')
        .in('evaluation_id', evalIds)
      evalScores = data ?? []
    }

    let autoScoresRegion: { dept_id: string; criteria_id: string; raw_score: number | null }[] = []
    if (regionDeptIds.length > 0) {
      const { data } = await supabase
        .from('auto_scores')
        .select('dept_id, criteria_id, raw_score')
        .eq('period_id', period.id)
        .in('dept_id', regionDeptIds)
      autoScoresRegion = data ?? []
    }

    for (const dept of regionDepts) {
      const deptEvalIds = new Set(submittedEvals.filter(e => e.target_id === dept.id).map(e => e.id))
      const deptScores = evalScores.filter(s => deptEvalIds.has(s.evaluation_id))

      const criteriaScores = leaderCriteriaData.map(c => {
        if (c.input_type === 'auto') {
          const autoEntry = autoScoresRegion.find(s => s.dept_id === dept.id && s.criteria_id === c.id)
          return { criteriaId: c.id, avgScore: autoEntry?.raw_score ?? null }
        }
        const rawArr = deptScores
          .filter(s => s.criteria_id === c.id && s.raw_score != null)
          .map(s => s.raw_score as number)
        const avg = rawArr.length > 0 ? rawArr.reduce((a, b) => a + b, 0) / rawArr.length : null
        return { criteriaId: c.id, avgScore: avg != null ? Math.round(avg * 10) / 10 : null }
      })

      const validAvgs = criteriaScores.map(s => s.avgScore).filter((s): s is number => s != null)
      const avgTotal = validAvgs.length > 0
        ? Math.round((validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length) * 10) / 10
        : null

      leaderResults.push({ deptId: dept.id, deptName: dept.name, deptCode: dept.code ?? null, criteriaScores, avgTotal })
    }

    leaderResults.sort((a, b) => {
      if (a.avgTotal == null && b.avgTotal == null) return 0
      if (a.avgTotal == null) return 1
      if (b.avgTotal == null) return -1
      return b.avgTotal - a.avgTotal
    })
  }

  // Fetch dept avg score and per-criteria scores for department users
  let deptAvgScore: number | null = null
  let deptMaxScore = 0
  let deptCriteriaScores: DeptCriterionScore[] = []
  if (role === 'department' && myDeptId && period) {
    const myDeptRegion = depts.find(d => d.id === myDeptId)?.region ?? 'Miền Bắc'
    const [criteriaRes, targetEvalsRes] = await Promise.all([
      supabase.from('criteria').select('id, code, name, weight, input_type').eq('period_id', period.id).eq('region', myDeptRegion).order('display_order'),
      supabase
        .from('evaluations')
        .select('id, total_score')
        .eq('period_id', period.id)
        .eq('target_id', myDeptId)
        .eq('status', 'submitted'),
    ])
    const crits = criteriaRes.data ?? []
    deptMaxScore = crits.reduce((s, c) => s + Number(c.weight) * 10, 0)
    const submittedEvals = targetEvalsRes.data ?? []
    const rawTotals = submittedEvals.map(e => e.total_score).filter((s): s is number => s != null)
    deptAvgScore = rawTotals.length > 0 ? rawTotals.reduce((a, b) => a + b, 0) / rawTotals.length : null

    const evalIds = submittedEvals.map(e => e.id)
    let evalScores: { evaluation_id: string; criteria_id: string; raw_score: number | null }[] = []
    if (evalIds.length > 0) {
      const { data } = await supabase.from('evaluation_scores').select('evaluation_id, criteria_id, raw_score').in('evaluation_id', evalIds)
      evalScores = data ?? []
    }

    let autoScoresDept: { criteria_id: string; raw_score: number | null }[] = []
    if (crits.some(c => c.input_type === 'auto')) {
      const { data } = await supabase.from('auto_scores').select('criteria_id, raw_score').eq('period_id', period.id).eq('dept_id', myDeptId)
      autoScoresDept = data ?? []
    }

    deptCriteriaScores = crits.map(c => {
      if (c.input_type === 'auto') {
        const entry = autoScoresDept.find(s => s.criteria_id === c.id)
        return { id: c.id, code: c.code ?? null, name: c.name, avgScore: entry?.raw_score ?? null, input_type: 'auto' as const }
      }
      const scoreArr = evalScores.filter(s => s.criteria_id === c.id && s.raw_score != null).map(s => s.raw_score as number)
      const avg = scoreArr.length > 0 ? Math.round((scoreArr.reduce((a, b) => a + b, 0) / scoreArr.length) * 10) / 10 : null
      return { id: c.id, code: c.code ?? null, name: c.name, avgScore: avg, input_type: 'manual' as const }
    })
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
      myLeaderStat={myLeaderStat}
      leaderResults={leaderResults}
      leaderCriteria={leaderCriteriaData}
      deptCriteriaScores={deptCriteriaScores}
    />
  )
}
