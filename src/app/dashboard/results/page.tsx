import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import ResultsClient from './ResultsClient'
import type { DeptResult, CriterionInfo } from './ResultsClient'

export default async function ResultsPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const role = session.user.role as 'super_admin' | 'leadership' | 'department'
  const myDeptId = session.user.departmentId ?? null
  const canManageAll = role === 'super_admin' || role === 'leadership'

  const supabase = createServiceClient()

  const { data: period } = await supabase
    .from('evaluation_periods')
    .select('id, quarter, year')
    .order('year', { ascending: false })
    .order('quarter', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!period) {
    return (
      <div style={{ color: 'rgba(255,255,255,0.25)', fontStyle: 'italic', fontSize: 13, padding: '48px 0' }}>
        Chưa có kỳ đánh giá nào được thiết lập.
      </div>
    )
  }

  const [criteriaResult, deptsResult, matrixResult, evalsResult] = await Promise.all([
    supabase.from('criteria').select('id, code, name, weight').eq('period_id', period.id).order('display_order'),
    supabase.from('departments').select('id, name, code').order('name'),
    supabase.from('evaluation_matrix').select('evaluator_id, target_id').eq('period_id', period.id),
    supabase.from('evaluations').select('id, target_id, total_score').eq('period_id', period.id).eq('status', 'submitted'),
  ])

  const criteria: CriterionInfo[] = (criteriaResult.data ?? []).map(c => ({
    id: c.id,
    code: c.code,
    name: c.name,
    weight: Number(c.weight),
  }))
  const depts     = deptsResult.data ?? []
  const matrix    = matrixResult.data ?? []
  const submitted = evalsResult.data ?? []

  // Fetch per-criterion scores for all submitted evals
  const evalIds = submitted.map(e => e.id)
  let rawScores: { evaluation_id: string; criteria_id: string; raw_score: number | null; weighted_score: number | null }[] = []
  if (evalIds.length > 0) {
    const { data } = await supabase
      .from('evaluation_scores')
      .select('evaluation_id, criteria_id, raw_score, weighted_score')
      .in('evaluation_id', evalIds)
    rawScores = data ?? []
  }

  // Max possible score for the period
  const maxScore = criteria.reduce((sum, c) => sum + c.weight * 10, 0)

  // ── Per-dept aggregation ───────────────────────────────────
  const results: DeptResult[] = depts.map(dept => {
    const totalEvaluators = matrix.filter(m => m.target_id === dept.id).length
    const received        = submitted.filter(e => e.target_id === dept.id)
    const receivedCount   = received.length

    const avgScore = receivedCount > 0
      ? received.reduce((sum, e) => sum + (e.total_score ?? 0), 0) / receivedCount
      : null

    // Per-criterion averages
    const receivedIds = new Set(received.map(e => e.id))
    const deptScores  = rawScores.filter(s => receivedIds.has(s.evaluation_id))

    const criteriaAvg = criteria.map(c => {
      const cScores = deptScores.filter(s => s.criteria_id === c.id)
      const avgRaw  = cScores.length > 0
        ? cScores.reduce((sum, s) => sum + (s.raw_score ?? 0), 0) / cScores.length
        : null
      const avgWeighted = cScores.length > 0
        ? cScores.reduce((sum, s) => sum + (s.weighted_score ?? 0), 0) / cScores.length
        : null
      return { criteriaId: c.id, avgRaw, avgWeighted }
    })

    return {
      id: dept.id,
      name: dept.name,
      code: dept.code,
      rank: 0,        // filled in below
      avgScore,
      receivedCount,
      totalEvaluators,
      criteriaAvg,
      isMyDept: dept.id === myDeptId,
    }
  })

  // Assign ranks (only depts with scores)
  results
    .filter(r => r.avgScore != null)
    .sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0))
    .forEach((r, i) => { r.rank = i + 1 })

  // Sort final array: ranked first (by rank), then unranked alphabetically
  results.sort((a, b) => {
    if (a.avgScore != null && b.avgScore != null) return a.rank - b.rank
    if (a.avgScore != null) return -1
    if (b.avgScore != null) return 1
    return a.name.localeCompare(b.name)
  })

  return (
    <ResultsClient
      periodLabel={`Quý ${period.quarter} · ${period.year}`}
      results={results}
      criteria={criteria}
      maxScore={maxScore}
      totalSubmitted={submitted.length}
      canManageAll={canManageAll}
    />
  )
}
