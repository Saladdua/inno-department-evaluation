import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase/server'
import { completionErrorMessage, getEvaluationCompletion } from '@/lib/evaluation-completion'
import { fetchRowsByIds } from '@/lib/supabase-pagination'

const DEFAULT_REGION = 'Miền Bắc'

// GET /api/close-period?periodId=X
// Returns all period data (raw + computed results) for export.
export async function GET(req: Request) {
  const user = await getAuthUser(req)
  if (!user || !['super_admin', 'leadership'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const periodId = searchParams.get('periodId')
  if (!periodId) return NextResponse.json({ error: 'Missing periodId' }, { status: 400 })

  const supabase = createServiceClient()

  try {
    const completion = await getEvaluationCompletion(supabase, periodId)
    if (completion.incomplete.length > 0) {
      const pairs = completion.incomplete
        .slice(0, 50)
        .map(task => `${task.evaluatorName} -> ${task.targetName}`)
      return NextResponse.json(
        {
          error: completionErrorMessage(completion.incomplete.length),
          incomplete: pairs,
          totalRequired: completion.totalRequired,
          submittedRequired: completion.submittedRequired,
        },
        { status: 422 }
      )
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Không kiểm tra được tiến độ đánh giá.' },
      { status: 500 }
    )
  }

  const [
    { data: period },
    { data: criteria },
    { data: departments },
    { data: matrix },
    { data: evaluations },
    { data: autoScores },
    { data: leaders },
  ] = await Promise.all([
    supabase.from('evaluation_periods').select('*').eq('id', periodId).maybeSingle(),
    supabase.from('criteria').select('*').eq('period_id', periodId).order('display_order'),
    supabase.from('departments').select('*').order('name'),
    supabase.from('evaluation_matrix').select('*').eq('period_id', periodId),
    supabase.from('evaluations').select('*').eq('period_id', periodId),
    supabase.from('auto_scores').select('*').eq('period_id', periodId),
    supabase.from('users').select('id, region').eq('role', 'leadership'),
  ])

  if (!period) return NextResponse.json({ error: 'Period not found' }, { status: 404 })

  const criteriaArr  = criteria    ?? []
  const deptsArr     = departments ?? []
  const matrixArr    = matrix      ?? []
  const evalsArr     = evaluations ?? []
  const autoScoresArr = autoScores ?? []
  const leadersArr   = leaders     ?? []

  // Fetch evaluation scores for submitted evaluations
  const submittedEvals = evalsArr.filter((e: { status: string }) => e.status === 'submitted')
  const evalIds = submittedEvals.map((e: { id: string }) => e.id)
  let evalScores: Record<string, unknown>[] = []
  if (evalIds.length > 0) {
    evalScores = await fetchRowsByIds<Record<string, unknown>>(
      supabase,
      'evaluation_scores',
      '*',
      'evaluation_id',
      evalIds
    )
  }

  const autoScoreMap = new Map<string, Map<string, number>>()
  for (const row of autoScoresArr as { dept_id: string; criteria_id: string; raw_score: unknown }[]) {
    if (!autoScoreMap.has(row.dept_id)) autoScoreMap.set(row.dept_id, new Map())
    autoScoreMap.get(row.dept_id)!.set(row.criteria_id, Number(row.raw_score))
  }

  const results = deptsArr.map((dept: { id: string; name: string; code: string | null; region?: string | null }) => {
    const deptRegion = dept.region ?? DEFAULT_REGION
    const deptCriteria = (criteriaArr as { id: string; input_type: string; weight: unknown; region?: string | null }[])
      .filter(c => (c.region ?? DEFAULT_REGION) === deptRegion)
    const regionCriteria = deptCriteria.length > 0 ? deptCriteria : (criteriaArr as { id: string; input_type: string; weight: unknown; region?: string | null }[]).filter(c => !c.region)
    const totalEvaluators = matrixArr.filter((m: { target_id: string }) => m.target_id === dept.id).length +
      leadersArr.filter((l: { region?: string | null }) => (l.region ?? DEFAULT_REGION) === deptRegion).length
    const received        = submittedEvals.filter((e: { target_id: string }) => e.target_id === dept.id)
    const receivedCount   = received.length
    const deptAutoScores  = autoScoreMap.get(dept.id)
    let weightedSum = 0
    let hasAnyScore = false

    const criteriaAvg = regionCriteria.map((c: { id: string; input_type: string; weight: unknown }) => {
      if (c.input_type === 'auto') {
        const raw = deptAutoScores?.get(c.id) ?? null
        if (raw !== null) {
          hasAnyScore = true
          weightedSum += raw * Number(c.weight)
        }
        return { criteriaId: c.id, avgRaw: raw, avgWeighted: raw !== null ? raw * Number(c.weight) : null }
      }
      const values = received
        .map((e: { id: string }) => (evalScores as { evaluation_id: string; criteria_id: string; raw_score: number | null }[])
          .find(row => row.evaluation_id === e.id && row.criteria_id === c.id)?.raw_score)
        .filter((raw): raw is number => raw != null)
        .map(Number)
      const avgRaw = values.length > 0 ? values.reduce((sum, raw) => sum + raw, 0) / values.length : null
      if (avgRaw !== null) {
        hasAnyScore = true
        weightedSum += avgRaw * Number(c.weight)
      }
      return { criteriaId: c.id, avgRaw, avgWeighted: avgRaw !== null ? avgRaw * Number(c.weight) : null }
    })
    const totalWeight = regionCriteria.reduce((sum: number, c: { weight: unknown }) => sum + Number(c.weight), 0)
    const avgScore = totalWeight > 0 && hasAnyScore ? weightedSum / totalWeight : null

    return { id: dept.id, name: dept.name, code: dept.code, region: deptRegion, rank: 0, avgScore, receivedCount, totalEvaluators, criteriaAvg, isMyDept: false }
  })

  results
    .filter((r: { avgScore: number | null }) => r.avgScore != null)
    .sort((a: { avgScore: number | null }, b: { avgScore: number | null }) => (b.avgScore ?? 0) - (a.avgScore ?? 0))
    .forEach((r: { rank: number }, i: number) => { r.rank = i + 1 })

  results.sort((a: { avgScore: number | null; rank: number; name: string }, b: { avgScore: number | null; rank: number; name: string }) => {
    if (a.avgScore != null && b.avgScore != null) return a.rank - b.rank
    if (a.avgScore != null) return -1
    if (b.avgScore != null) return 1
    return a.name.localeCompare(b.name)
  })

  return NextResponse.json({
    period,
    criteria: criteriaArr,
    departments: deptsArr,
    matrix: matrixArr,
    evaluations: evalsArr,
    evalScores,
    autoScores: autoScoresArr,
    results,
    totalSubmitted: submittedEvals.length,
    maxScore: 100,
  })
}

// POST /api/close-period
// Body: { periodId }
// Marks the period as closed and removes operational data.
// Keeps: evaluation_periods (as closed), evaluations, evaluation_scores,
//        auto_scores, criteria — so Results page can show historical data.
export async function POST(req: Request) {
  const user = await getAuthUser(req)
  if (!user || !['super_admin', 'leadership'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { periodId } = body as { periodId: string }
  if (!periodId) return NextResponse.json({ error: 'Missing periodId' }, { status: 400 })

  const supabase = createServiceClient()

  try {
    const completion = await getEvaluationCompletion(supabase, periodId)
    if (completion.incomplete.length > 0) {
      const pairs = completion.incomplete
        .slice(0, 50)
        .map(task => `${task.evaluatorName} -> ${task.targetName}`)
      return NextResponse.json(
        {
          error: completionErrorMessage(completion.incomplete.length),
          incomplete: pairs,
          totalRequired: completion.totalRequired,
          submittedRequired: completion.submittedRequired,
        },
        { status: 422 }
      )
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Không kiểm tra được tiến độ đánh giá.' },
      { status: 500 }
    )
  }

  // Remove operational/notification data (not needed for results)
  await supabase.from('notification_reads').delete().not('id', 'is', null)
  await supabase.from('evaluation_reports').delete().not('id', 'is', null)
  await supabase.from('notifications').delete().not('id', 'is', null)
  await supabase.from('evaluation_matrix').delete().eq('period_id', periodId)

  // Mark the period as closed — keeps all result data intact
  await supabase
    .from('evaluation_periods')
    .update({ status: 'closed' })
    .eq('id', periodId)

  return NextResponse.json({ ok: true })
}
