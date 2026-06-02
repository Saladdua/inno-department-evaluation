import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const supabase = createServiceClient()

  // Return list of periods
  if (searchParams.get('periods') === 'true') {
    const { data } = await supabase
      .from('evaluation_periods')
      .select('id, quarter, year, status')
      .order('year', { ascending: false })
      .order('quarter', { ascending: false })
    return NextResponse.json(data ?? [])
  }

  const periodId = searchParams.get('periodId')
  if (!periodId) return NextResponse.json({ error: 'Missing periodId' }, { status: 400 })

  const [deptsResult, criteriaResult, matrixResult, evalsResult, autoScoresResult, overridesResult] = await Promise.all([
    supabase.from('departments').select('id, name, code, region').order('name'),
    supabase.from('criteria').select('id, weight, input_type').eq('period_id', periodId),
    supabase.from('evaluation_matrix').select('target_id').eq('period_id', periodId),
    supabase.from('evaluations').select('id, target_id, total_score').eq('period_id', periodId).eq('status', 'submitted'),
    supabase.from('auto_scores').select('dept_id, criteria_id, raw_score').eq('period_id', periodId),
    supabase.from('score_overrides').select('dept_id, score').eq('period_id', periodId),
  ])

  const depts      = deptsResult.data ?? []
  const criteria   = criteriaResult.data ?? []
  const submitted  = evalsResult.data ?? []
  const autoScores = autoScoresResult.data ?? []
  const overrides  = overridesResult.data ?? []

  const manualCriteria    = criteria.filter(c => c.input_type !== 'auto')
  const autoCriteria      = criteria.filter(c => c.input_type === 'auto')
  const manualTotalWeight = manualCriteria.reduce((s, c) => s + Number(c.weight), 0)

  const autoScoreMap = new Map<string, Map<string, number>>()
  for (const row of autoScores) {
    if (!autoScoreMap.has(row.dept_id)) autoScoreMap.set(row.dept_id, new Map())
    autoScoreMap.get(row.dept_id)!.set(row.criteria_id, Number(row.raw_score))
  }

  const overrideMap = new Map(overrides.map(o => [o.dept_id, Number(o.score)]))

  const results = depts.map(dept => {
    if (overrideMap.has(dept.id)) {
      return { id: dept.id, name: dept.name, code: dept.code, region: dept.region ?? 'Miền Bắc', rank: 0, avgScore: overrideMap.get(dept.id)! }
    }

    const received    = submitted.filter(e => e.target_id === dept.id)
    const manualAvg   = received.length > 0
      ? received.reduce((sum, e) => sum + (e.total_score ?? 0), 0) / received.length
      : null

    const deptAutoMap       = autoScoreMap.get(dept.id)
    const autoWeightedSum   = autoCriteria.reduce((s, c) => {
      const raw = deptAutoMap?.get(c.id) ?? null
      return raw !== null ? s + raw * Number(c.weight) : s
    }, 0)
    const autoWeightCovered = autoCriteria.reduce((s, c) =>
      deptAutoMap?.has(c.id) ? s + Number(c.weight) : s, 0)

    let avgScore: number | null = null
    const eff = manualTotalWeight + autoWeightCovered
    if (eff > 0 && (manualAvg !== null || autoWeightCovered > 0)) {
      avgScore = ((manualAvg ?? 0) * manualTotalWeight + autoWeightedSum) / eff
    }

    return { id: dept.id, name: dept.name, code: dept.code, region: dept.region ?? 'Miền Bắc', rank: 0, avgScore }
  })

  // Rank
  let rank = 1
  results
    .filter(r => r.avgScore != null)
    .sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0))
    .forEach(r => { r.rank = rank++ })

  results.sort((a, b) => {
    if (a.avgScore != null && b.avgScore != null) return a.rank - b.rank
    if (a.avgScore != null) return -1
    if (b.avgScore != null) return 1
    return a.name.localeCompare(b.name)
  })

  return NextResponse.json(results)
}
