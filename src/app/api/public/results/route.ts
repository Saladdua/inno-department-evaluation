import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const DEFAULT_REGION = 'Miền Bắc'

type Criterion = { id: string; weight: number; input_type: string; region?: string | null }
type Evaluation = { id: string; target_id: string; total_score?: number | null }
type Score = { evaluation_id: string; criteria_id: string; raw_score: number | null }

function criteriaForRegion(criteria: Criterion[], region: string) {
  const regional = criteria.filter(c => (c.region ?? DEFAULT_REGION) === region)
  return regional.length > 0 ? regional : criteria.filter(c => !c.region)
}

function computeScore(
  criteria: Criterion[],
  received: Evaluation[],
  scores: Score[],
  autoScores: Map<string, number> | undefined
) {
  const scoreMap = new Map(scores.map(s => [`${s.evaluation_id}:${s.criteria_id}`, s]))
  let weightedSum = 0
  let hasAnyScore = false

  for (const c of criteria) {
    if (c.input_type === 'auto') {
      const raw = autoScores?.get(c.id) ?? null
      if (raw !== null) {
        hasAnyScore = true
        weightedSum += raw * Number(c.weight)
      }
      continue
    }

    const values = received
      .map(e => scoreMap.get(`${e.id}:${c.id}`)?.raw_score)
      .filter((raw): raw is number => raw != null)
      .map(Number)
    if (values.length === 0) continue

    const avgRaw = values.reduce((sum, raw) => sum + raw, 0) / values.length
    hasAnyScore = true
    weightedSum += avgRaw * Number(c.weight)
  }

  const totalWeight = criteria.reduce((sum, c) => sum + Number(c.weight), 0)
  return totalWeight > 0 && hasAnyScore ? weightedSum / totalWeight : null
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const supabase = createServiceClient()

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

  const [deptsResult, criteriaResult, evalsResult, autoScoresResult, overridesResult] = await Promise.all([
    supabase.from('departments').select('id, name, code, region').order('name'),
    supabase.from('criteria').select('id, weight, input_type, region').eq('period_id', periodId),
    supabase.from('evaluations').select('id, target_id, total_score').eq('period_id', periodId).eq('status', 'submitted'),
    supabase.from('auto_scores').select('dept_id, criteria_id, raw_score').eq('period_id', periodId),
    supabase.from('score_overrides').select('dept_id, score').eq('period_id', periodId),
  ])

  const depts = deptsResult.data ?? []
  const criteria: Criterion[] = (criteriaResult.data ?? []).map(c => ({ ...c, weight: Number(c.weight) }))
  const submitted: Evaluation[] = evalsResult.data ?? []
  const autoScores = autoScoresResult.data ?? []
  const overrides = overridesResult.data ?? []

  const evalIds = submitted.map(e => e.id)
  let rawScores: Score[] = []
  if (evalIds.length > 0) {
    const { data } = await supabase
      .from('evaluation_scores')
      .select('evaluation_id, criteria_id, raw_score')
      .in('evaluation_id', evalIds)
    rawScores = data ?? []
  }

  const autoScoreMap = new Map<string, Map<string, number>>()
  for (const row of autoScores) {
    if (!autoScoreMap.has(row.dept_id)) autoScoreMap.set(row.dept_id, new Map())
    autoScoreMap.get(row.dept_id)!.set(row.criteria_id, Number(row.raw_score))
  }

  const overrideMap = new Map(overrides.map(o => [o.dept_id, Number(o.score)]))

  const results = depts.map(dept => {
    if (overrideMap.has(dept.id)) {
      return { id: dept.id, name: dept.name, code: dept.code, region: dept.region ?? DEFAULT_REGION, rank: 0, avgScore: overrideMap.get(dept.id)! }
    }

    const region = dept.region ?? DEFAULT_REGION
    const deptCriteria = criteriaForRegion(criteria, region)
    const received = submitted.filter(e => e.target_id === dept.id)
    const avgScore = computeScore(deptCriteria, received, rawScores, autoScoreMap.get(dept.id))

    return { id: dept.id, name: dept.name, code: dept.code, region, rank: 0, avgScore }
  })

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
