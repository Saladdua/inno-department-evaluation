import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase/server'

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

  const [
    { data: period },
    { data: criteria },
    { data: departments },
    { data: matrix },
    { data: evaluations },
    { data: autoScores },
    leaderCountResult,
  ] = await Promise.all([
    supabase.from('evaluation_periods').select('*').eq('id', periodId).maybeSingle(),
    supabase.from('criteria').select('*').eq('period_id', periodId).order('display_order'),
    supabase.from('departments').select('*').order('name'),
    supabase.from('evaluation_matrix').select('*').eq('period_id', periodId),
    supabase.from('evaluations').select('*').eq('period_id', periodId),
    supabase.from('auto_scores').select('*').eq('period_id', periodId),
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'leadership'),
  ])

  if (!period) return NextResponse.json({ error: 'Period not found' }, { status: 404 })

  const criteriaArr  = criteria    ?? []
  const deptsArr     = departments ?? []
  const matrixArr    = matrix      ?? []
  const evalsArr     = evaluations ?? []
  const autoScoresArr = autoScores ?? []
  const leaderCount  = leaderCountResult.count ?? 0

  // Fetch evaluation scores for submitted evaluations
  const submittedEvals = evalsArr.filter((e: { status: string }) => e.status === 'submitted')
  const evalIds = submittedEvals.map((e: { id: string }) => e.id)
  let evalScores: Record<string, unknown>[] = []
  if (evalIds.length > 0) {
    const { data } = await supabase.from('evaluation_scores').select('*').in('evaluation_id', evalIds)
    evalScores = data ?? []
  }

  // Compute results (mirrors logic in results/page.tsx)
  const manualCriteria = criteriaArr.filter((c: { input_type: string }) => c.input_type !== 'auto')
  const autoCriteria   = criteriaArr.filter((c: { input_type: string }) => c.input_type === 'auto')
  const manualTotalWeight = manualCriteria.reduce((s: number, c: { weight: unknown }) => s + Number(c.weight), 0)

  const autoScoreMap = new Map<string, Map<string, number>>()
  for (const row of autoScoresArr as { dept_id: string; criteria_id: string; raw_score: unknown }[]) {
    if (!autoScoreMap.has(row.dept_id)) autoScoreMap.set(row.dept_id, new Map())
    autoScoreMap.get(row.dept_id)!.set(row.criteria_id, Number(row.raw_score))
  }

  const results = deptsArr.map((dept: { id: string; name: string; code: string | null }) => {
    const totalEvaluators = matrixArr.filter((m: { target_id: string }) => m.target_id === dept.id).length + leaderCount
    const received        = submittedEvals.filter((e: { target_id: string }) => e.target_id === dept.id)
    const receivedCount   = received.length
    const receivedIds     = new Set(received.map((e: { id: string }) => e.id))
    const deptScores      = evalScores.filter(s => receivedIds.has(s.evaluation_id as string))
    const deptAutoScores  = autoScoreMap.get(dept.id)

    const manualAvg = receivedCount > 0
      ? received.reduce((sum: number, e: { total_score: number | null }) => sum + (e.total_score ?? 0), 0) / receivedCount
      : null

    const autoWeightedSum = autoCriteria.reduce((sum: number, c: { id: string; weight: unknown }) => {
      const raw = deptAutoScores?.get(c.id) ?? null
      return raw !== null ? sum + raw * Number(c.weight) : sum
    }, 0)
    const autoWeightCovered = autoCriteria.reduce((sum: number, c: { id: string; weight: unknown }) => {
      return deptAutoScores?.has(c.id) ? sum + Number(c.weight) : sum
    }, 0)

    let avgScore: number | null = null
    const effectiveTotalWeight = manualTotalWeight + autoWeightCovered
    if (effectiveTotalWeight > 0 && (manualAvg !== null || autoWeightCovered > 0)) {
      const manualContrib = manualAvg !== null ? manualAvg * manualTotalWeight : 0
      avgScore = (manualContrib + autoWeightedSum) / effectiveTotalWeight
    }

    const criteriaAvg = criteriaArr.map((c: { id: string; input_type: string; weight: unknown }) => {
      if (c.input_type === 'auto') {
        const raw = deptAutoScores?.get(c.id) ?? null
        return { criteriaId: c.id, avgRaw: raw, avgWeighted: raw !== null ? raw * Number(c.weight) : null }
      }
      const cScores = (deptScores as { criteria_id: string; raw_score: number | null; weighted_score: number | null }[])
        .filter(s => s.criteria_id === c.id)
      const avgRaw      = cScores.length > 0 ? cScores.reduce((sum, s) => sum + (s.raw_score ?? 0), 0) / cScores.length : null
      const avgWeighted = cScores.length > 0 ? cScores.reduce((sum, s) => sum + (s.weighted_score ?? 0), 0) / cScores.length : null
      return { criteriaId: c.id, avgRaw, avgWeighted }
    })

    return { id: dept.id, name: dept.name, code: dept.code, rank: 0, avgScore, receivedCount, totalEvaluators, criteriaAvg, isMyDept: false }
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
// Deletes all evaluation activity for the period.
// Keeps: evaluation_periods, criteria, users, departments.
export async function POST(req: Request) {
  const user = await getAuthUser(req)
  if (!user || !['super_admin', 'leadership'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { periodId } = body as { periodId: string }
  if (!periodId) return NextResponse.json({ error: 'Missing periodId' }, { status: 400 })

  const supabase = createServiceClient()

  // Collect evaluation IDs so we can delete their scores
  const { data: evals } = await supabase.from('evaluations').select('id').eq('period_id', periodId)
  const evalIds = (evals ?? []).map((e: { id: string }) => e.id)

  // Delete in FK-safe order:
  // 1. notification_reads (references notifications)
  await supabase.from('notification_reads').delete().not('id', 'is', null)
  // 2. evaluation_reports (references notifications)
  await supabase.from('evaluation_reports').delete().not('id', 'is', null)
  // 3. notifications
  await supabase.from('notifications').delete().not('id', 'is', null)
  // 4. evaluation_scores (references evaluations)
  if (evalIds.length > 0) {
    await supabase.from('evaluation_scores').delete().in('evaluation_id', evalIds)
  }
  // 5. evaluations
  await supabase.from('evaluations').delete().eq('period_id', periodId)
  // 6. auto_scores
  await supabase.from('auto_scores').delete().eq('period_id', periodId)
  // 7. evaluation_matrix
  await supabase.from('evaluation_matrix').delete().eq('period_id', periodId)
  // 8. criteria (references evaluation_periods)
  await supabase.from('criteria').delete().eq('period_id', periodId)
  // 9. evaluation_periods record itself
  await supabase.from('evaluation_periods').delete().eq('id', periodId)

  return NextResponse.json({ ok: true })
}
