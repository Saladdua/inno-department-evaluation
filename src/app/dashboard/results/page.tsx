import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import ResultsClient from './ResultsClient'
import type { DeptResult, CriterionInfo } from './ResultsClient'

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ periodId?: string }>
}) {
  const { periodId } = await searchParams
  const session = await auth()
  if (!session) redirect('/login')

  const role = session.user.role as 'super_admin' | 'leadership' | 'department'
  const myDeptId = session.user.departmentId ?? null
  const canManageAll = role === 'super_admin' || role === 'leadership'

  const supabase = createServiceClient()

  const { data: periodsData } = await supabase
    .from('evaluation_periods')
    .select('id, quarter, year, status')
    .order('year', { ascending: false })
    .order('quarter', { ascending: false })

  const periods = periodsData ?? []
  const period = periodId
    ? (periods.find(p => p.id === periodId) ?? periods[0])
    : periods[0]

  if (!period) {
    return (
      <div style={{ color: 'rgba(255,255,255,0.25)', fontStyle: 'italic', fontSize: 13, padding: '48px 0' }}>
        Chưa có kỳ đánh giá nào được thiết lập.
      </div>
    )
  }

  const [criteriaResult, deptsResult, matrixResult, evalsResult, leaderCountResult] = await Promise.all([
    supabase.from('criteria').select('id, code, name, weight, input_type').eq('period_id', period.id).order('display_order'),
    supabase.from('departments').select('id, name, code').order('name'),
    supabase.from('evaluation_matrix').select('evaluator_id, target_id').eq('period_id', period.id),
    supabase.from('evaluations').select('id, target_id, total_score').eq('period_id', period.id).eq('status', 'submitted'),
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'leadership'),
  ])
  const leaderCount = leaderCountResult.count ?? 0

  const criteria: CriterionInfo[] = (criteriaResult.data ?? []).map(c => ({
    id: c.id, code: c.code, name: c.name, weight: Number(c.weight),
    input_type: c.input_type as 'manual' | 'auto',
  }))
  const depts     = deptsResult.data ?? []
  const matrix    = matrixResult.data ?? []
  const submitted = evalsResult.data ?? []

  // Separate criteria by type for combined score calculation
  const manualCriteria = criteria.filter(c => c.input_type !== 'auto')
  const autoCriteria   = criteria.filter(c => c.input_type === 'auto')
  const manualTotalWeight = manualCriteria.reduce((s, c) => s + c.weight, 0)
  const autoTotalWeight   = autoCriteria.reduce((s, c)   => s + c.weight, 0)
  const totalWeight       = manualTotalWeight + autoTotalWeight

  // Fetch manual evaluation scores
  const evalIds = submitted.map(e => e.id)
  let rawScores: { evaluation_id: string; criteria_id: string; raw_score: number | null; weighted_score: number | null }[] = []
  if (evalIds.length > 0) {
    const { data } = await supabase
      .from('evaluation_scores')
      .select('evaluation_id, criteria_id, raw_score, weighted_score')
      .in('evaluation_id', evalIds)
    rawScores = data ?? []
  }

  // Fetch auto scores for all depts in this period
  const { data: autoScoresData } = await supabase
    .from('auto_scores')
    .select('dept_id, criteria_id, raw_score')
    .eq('period_id', period.id)

  // Group auto scores: deptId → Map<criteriaId, raw_score>
  const autoScoreMap = new Map<string, Map<string, number>>()
  for (const row of autoScoresData ?? []) {
    if (!autoScoreMap.has(row.dept_id)) autoScoreMap.set(row.dept_id, new Map())
    autoScoreMap.get(row.dept_id)!.set(row.criteria_id, Number(row.raw_score))
  }

  const maxScore = 100

  const results: DeptResult[] = depts.map(dept => {
    const totalEvaluators = matrix.filter(m => m.target_id === dept.id).length + leaderCount
    const received        = submitted.filter(e => e.target_id === dept.id)
    const receivedCount   = received.length
    const receivedIds     = new Set(received.map(e => e.id))
    const deptScores      = rawScores.filter(s => receivedIds.has(s.evaluation_id))
    const deptAutoScores  = autoScoreMap.get(dept.id)

    // Manual avg score (weighted avg across evaluators, on 0-100 scale)
    const manualAvg = receivedCount > 0
      ? received.reduce((sum, e) => sum + (e.total_score ?? 0), 0) / receivedCount
      : null

    // Auto weighted sum for this dept
    const autoWeightedSum = autoCriteria.reduce((sum, c) => {
      const raw = deptAutoScores?.get(c.id) ?? null
      return raw !== null ? sum + raw * c.weight : sum
    }, 0)
    const autoWeightCovered = autoCriteria.reduce((sum, c) => {
      return deptAutoScores?.has(c.id) ? sum + c.weight : sum
    }, 0)

    // Combined score: blend manual (weighted by manualTotalWeight) + auto
    let avgScore: number | null = null
    const effectiveTotalWeight = manualTotalWeight + autoWeightCovered
    if (effectiveTotalWeight > 0) {
      const manualContrib = manualAvg !== null ? manualAvg * manualTotalWeight : 0
      const autoContrib   = autoWeightedSum
      if (manualAvg !== null || autoWeightCovered > 0) {
        avgScore = (manualContrib + autoContrib) / effectiveTotalWeight
      }
    }

    // Per-criteria averages: manual from evaluation_scores, auto from auto_scores
    const criteriaAvg = criteria.map(c => {
      if (c.input_type === 'auto') {
        const raw = deptAutoScores?.get(c.id) ?? null
        return {
          criteriaId: c.id,
          avgRaw: raw,
          avgWeighted: raw !== null ? raw * c.weight : null,
        }
      }
      const cScores  = deptScores.filter(s => s.criteria_id === c.id)
      const avgRaw   = cScores.length > 0 ? cScores.reduce((sum, s) => sum + (s.raw_score ?? 0), 0) / cScores.length : null
      const avgWeighted = cScores.length > 0 ? cScores.reduce((sum, s) => sum + (s.weighted_score ?? 0), 0) / cScores.length : null
      return { criteriaId: c.id, avgRaw, avgWeighted }
    })

    return {
      id: dept.id, name: dept.name, code: dept.code,
      rank: 0, avgScore, receivedCount, totalEvaluators, criteriaAvg,
      isMyDept: dept.id === myDeptId,
    }
  })

  results
    .filter(r => r.avgScore != null)
    .sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0))
    .forEach((r, i) => { r.rank = i + 1 })

  results.sort((a, b) => {
    if (a.avgScore != null && b.avgScore != null) return a.rank - b.rank
    if (a.avgScore != null) return -1
    if (b.avgScore != null) return 1
    return a.name.localeCompare(b.name)
  })

  return (
    <ResultsClient
      periodLabel={`Quý ${period.quarter} · ${period.year}`}
      periodStatus={period.status}
      activePeriodId={period.id}
      periods={periods.map(p => ({ id: p.id, quarter: p.quarter, year: p.year, status: p.status }))}
      results={results}
      criteria={criteria}
      maxScore={maxScore}
      totalSubmitted={submitted.length}
      canManageAll={canManageAll}
    />
  )
}
