import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchRowsByIds } from '@/lib/supabase-pagination'
import ResultsClient from './ResultsClient'
import type { DeptResult, CriterionInfo } from './ResultsClient'

type CriterionWithRegion = CriterionInfo & { region?: string | null }
type SubmittedEvaluation = { id: string; target_id: string; total_score?: number | null; period_id?: string }
type ScoreRow = { evaluation_id: string; criteria_id: string; raw_score: number | null; weighted_score?: number | null }

const DEFAULT_REGION = 'Miền Bắc'

function criteriaForRegion(criteria: CriterionWithRegion[], region: string) {
  const regional = criteria.filter(c => (c.region ?? DEFAULT_REGION) === region)
  return regional.length > 0 ? regional : criteria.filter(c => !c.region)
}

function computeCriteriaScore(
  regionCriteria: CriterionWithRegion[],
  received: SubmittedEvaluation[],
  rawScores: ScoreRow[],
  deptAutoScores: Map<string, number> | undefined
) {
  const scoreMap = new Map(rawScores.map(s => [`${s.evaluation_id}:${s.criteria_id}`, s]))
  let weightedSum = 0
  let hasAnyScore = false

  const criteriaAvg = regionCriteria.map(c => {
    if (c.input_type === 'auto') {
      const raw = deptAutoScores?.get(c.id) ?? null
      if (raw !== null) {
        hasAnyScore = true
        weightedSum += raw * c.weight
      }
      return { criteriaId: c.id, avgRaw: raw, avgWeighted: raw !== null ? raw * c.weight : null }
    }

    const values = received
      .map(e => scoreMap.get(`${e.id}:${c.id}`)?.raw_score)
      .filter((raw): raw is number => raw != null)
      .map(Number)
    const avgRaw = values.length > 0
      ? values.reduce((sum, raw) => sum + raw, 0) / values.length
      : null

    if (avgRaw !== null) {
      hasAnyScore = true
      weightedSum += avgRaw * c.weight
    }
    return { criteriaId: c.id, avgRaw, avgWeighted: avgRaw !== null ? avgRaw * c.weight : null }
  })

  const totalWeight = regionCriteria.reduce((sum, c) => sum + c.weight, 0)
  const avgScore = totalWeight > 0 && hasAnyScore ? weightedSum / totalWeight : null
  return { avgScore, criteriaAvg }
}

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ periodId?: string; year?: string; quarter?: string }>
}) {
  const { periodId, year: yearParam, quarter: quarterParam } = await searchParams
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
    .select('id, quarter, year, status')
    .order('year', { ascending: false })
    .order('quarter', { ascending: false })
  const periods = periodsData ?? []

  const years = [...new Set(periods.map(p => p.year as number))].sort((a, b) => b - a)

  if (years.length === 0) {
    return (
      <div style={{ color: 'rgba(255,255,255,0.25)', fontStyle: 'italic', fontSize: 13, padding: '48px 0' }}>
        Chưa có kỳ đánh giá nào được thiết lập.
      </div>
    )
  }

  // Determine active year and quarter from URL params
  let activeYear: number
  let activeQuarter: number | null

  if (yearParam) {
    activeYear = Number(yearParam)
    activeQuarter = quarterParam ? Number(quarterParam) : null
  } else if (periodId) {
    const p = periods.find(p => p.id === periodId)
    activeYear    = p?.year    ?? years[0]
    activeQuarter = p?.quarter ?? null
  } else {
    const latest  = periods[0]
    activeYear    = latest?.year    ?? years[0]
    activeQuarter = latest?.quarter ?? null
  }

  // Shared queries
  const [deptsResult, leadersResult] = await Promise.all([
    supabase.from('departments').select('id, name, code, region').order('name'),
    supabase.from('users').select('id, region').eq('role', 'leadership'),
  ])
  const depts   = deptsResult.data ?? []
  const leaders = leadersResult.data ?? []

  let results: DeptResult[]
  let criteria: CriterionWithRegion[]
  let totalSubmitted: number
  let periodLabel: string
  let periodStatus: string
  let activePeriodId: string | null = null
  let initialOverrides: Record<string, Record<string, number>> = {}
  const maxScore = 100

  if (activeQuarter !== null) {
    // ── Single quarter view ──────────────────────────────────────────
    const period = periods.find(p => p.year === activeYear && p.quarter === activeQuarter)

    if (!period) {
      return (
        <div style={{ color: 'rgba(255,255,255,0.25)', fontStyle: 'italic', fontSize: 13, padding: '48px 0' }}>
          Không tìm thấy kỳ đánh giá.
        </div>
      )
    }

    activePeriodId = period.id

    const [criteriaResult, matrixResult, evalsResult] = await Promise.all([
      supabase.from('criteria').select('id, code, name, weight, input_type, region').eq('period_id', period.id).order('display_order'),
      supabase.from('evaluation_matrix').select('evaluator_id, target_id').eq('period_id', period.id),
      supabase.from('evaluations').select('id, target_id, total_score').eq('period_id', period.id).eq('status', 'submitted'),
    ])

    criteria = (criteriaResult.data ?? []).map(c => ({
      id: c.id, code: c.code, name: c.name, weight: Number(c.weight),
      input_type: c.input_type as 'manual' | 'auto',
      region: c.region ?? null,
    }))
    const matrix    = matrixResult.data ?? []
    const submitted = evalsResult.data ?? []
    totalSubmitted  = submitted.length

    const evalIds = submitted.map(e => e.id)
    let rawScores: { evaluation_id: string; criteria_id: string; raw_score: number | null; weighted_score: number | null }[] = []
    if (evalIds.length > 0) {
      rawScores = await fetchRowsByIds<{ evaluation_id: string; criteria_id: string; raw_score: number | null; weighted_score: number | null }>(
        supabase,
        'evaluation_scores',
        'evaluation_id, criteria_id, raw_score, weighted_score',
        'evaluation_id',
        evalIds
      )
    }

    const { data: autoScoresData } = await supabase
      .from('auto_scores')
      .select('dept_id, criteria_id, raw_score')
      .eq('period_id', period.id)

    const autoScoreMap = new Map<string, Map<string, number>>()
    for (const row of autoScoresData ?? []) {
      if (!autoScoreMap.has(row.dept_id)) autoScoreMap.set(row.dept_id, new Map())
      autoScoreMap.get(row.dept_id)!.set(row.criteria_id, Number(row.raw_score))
    }

    results = depts.map(dept => {
      const deptRegion = dept.region ?? DEFAULT_REGION
      const regionCriteria = criteriaForRegion(criteria, deptRegion)
      const totalEvaluators = matrix.filter(m => m.target_id === dept.id).length +
        leaders.filter(l => (l.region ?? DEFAULT_REGION) === deptRegion).length
      const received        = submitted.filter(e => e.target_id === dept.id)
      const receivedCount   = received.length
      const deptAutoScores  = autoScoreMap.get(dept.id)
      const { avgScore, criteriaAvg } = computeCriteriaScore(regionCriteria, received, rawScores, deptAutoScores)

      return {
        id: dept.id, name: dept.name, code: dept.code,
        region: dept.region ?? 'Miền Bắc',
        rank: 0, avgScore, receivedCount, totalEvaluators, criteriaAvg,
        isMyDept: dept.id === myDeptId,
      }
    })

    // Load persisted score overrides — apply for all roles so department users see imported results
    const { data: overridesData } = await supabase
      .from('score_overrides')
      .select('dept_id, score')
      .eq('period_id', period.id)
    for (const ov of overridesData ?? []) {
      const r = results.find(r => r.id === ov.dept_id)
      if (r) r.avgScore = Number(ov.score)
      if (canManageAll) {
        const dept = depts.find(d => d.id === ov.dept_id)
        const region = dept?.region ?? 'Miền Bắc'
        if (!initialOverrides[region]) initialOverrides[region] = {}
        initialOverrides[region][ov.dept_id] = Number(ov.score)
      }
    }

    periodLabel  = `Quý ${period.quarter} · ${period.year}`
    periodStatus = period.status

  } else {
    // ── Year aggregate view ──────────────────────────────────────────
    const yearPeriods   = periods.filter(p => p.year === activeYear)
    const yearPeriodIds = yearPeriods.map(p => p.id)

    criteria       = []
    periodLabel    = `Năm ${activeYear}`
    periodStatus   = yearPeriods.every(p => p.status === 'closed') ? 'closed'
      : yearPeriods.some(p => p.status === 'active') ? 'active' : 'draft'

    if (yearPeriods.length === 0) {
      results = []
      totalSubmitted = 0
    } else {
      const [yCritRes, yEvalsRes, yAutoRes, yOverridesRes] = await Promise.all([
        supabase.from('criteria').select('id, weight, input_type, period_id, region').in('period_id', yearPeriodIds),
        supabase.from('evaluations').select('id, target_id, total_score, period_id').in('period_id', yearPeriodIds).eq('status', 'submitted'),
        supabase.from('auto_scores').select('dept_id, criteria_id, raw_score, period_id').in('period_id', yearPeriodIds),
        supabase.from('score_overrides').select('dept_id, score, period_id').in('period_id', yearPeriodIds),
      ])

      totalSubmitted = (yEvalsRes.data ?? []).length
      const yEvalIds = (yEvalsRes.data ?? []).map(e => e.id)
      let yScores: ScoreRow[] = []
      if (yEvalIds.length > 0) {
        yScores = await fetchRowsByIds<ScoreRow>(
          supabase,
          'evaluation_scores',
          'evaluation_id, criteria_id, raw_score',
          'evaluation_id',
          yEvalIds
        )
      }

      // Build override map: periodId → deptId → final score
      const yOverrideMap = new Map<string, Map<string, number>>()
      for (const ov of yOverridesRes.data ?? []) {
        if (!yOverrideMap.has(ov.period_id)) yOverrideMap.set(ov.period_id, new Map())
        yOverrideMap.get(ov.period_id)!.set(ov.dept_id, Number(ov.score))
      }

      // Per-period per-dept combined score (uses override if present)
      const periodDeptScore = new Map<string, Map<string, number | null>>()

      for (const yp of yearPeriods) {
        const periodOverrides = yOverrideMap.get(yp.id)
        const pCrit  = (yCritRes.data ?? [])
          .filter(c => c.period_id === yp.id)
          .map(c => ({
            id: c.id,
            code: null,
            name: '',
            weight: Number(c.weight),
            input_type: c.input_type as 'manual' | 'auto',
            region: c.region ?? null,
          }))
        const pEvals = (yEvalsRes.data ?? []).filter(e => e.period_id === yp.id)
        const pAuto  = (yAutoRes.data ?? []).filter(a => a.period_id === yp.id)
        const pScores = yScores.filter(s => pEvals.some(e => e.id === s.evaluation_id))

        const pAutoMap = new Map<string, Map<string, number>>()
        for (const a of pAuto) {
          if (!pAutoMap.has(a.dept_id)) pAutoMap.set(a.dept_id, new Map())
          pAutoMap.get(a.dept_id)!.set(a.criteria_id, Number(a.raw_score))
        }

        const deptMap = new Map<string, number | null>()
        for (const dept of depts) {
          // Use imported override score as the final result if available
          if (periodOverrides?.has(dept.id)) {
            deptMap.set(dept.id, periodOverrides.get(dept.id)!)
            continue
          }

          const received  = pEvals.filter(e => e.target_id === dept.id)
          const deptAutoMap = pAutoMap.get(dept.id)
          const regionCriteria = criteriaForRegion(pCrit, dept.region ?? DEFAULT_REGION)
          const { avgScore } = computeCriteriaScore(regionCriteria, received, pScores, deptAutoMap)
          deptMap.set(dept.id, avgScore)
        }
        periodDeptScore.set(yp.id, deptMap)
      }

      // Average per-dept across periods that have data
      results = depts.map(dept => {
        const scores: number[] = []
        for (const yp of yearPeriods) {
          const s = periodDeptScore.get(yp.id)?.get(dept.id)
          if (s != null) scores.push(s)
        }
        const avgScore      = scores.length > 0
          ? scores.reduce((a, b) => a + b) / scores.length
          : null
        const receivedCount = (yEvalsRes.data ?? []).filter(e => e.target_id === dept.id).length
        return {
          id: dept.id, name: dept.name, code: dept.code,
          region: dept.region ?? 'Miền Bắc',
          rank: 0, avgScore, receivedCount, totalEvaluators: 0, criteriaAvg: [],
          isMyDept: dept.id === myDeptId,
        }
      })
    }
  }

  // Apply ranking
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
      periodLabel={periodLabel}
      periodStatus={periodStatus}
      activeYear={activeYear}
      activeQuarter={activeQuarter}
      years={years}
      periods={periods.map(p => ({ id: p.id, quarter: p.quarter, year: p.year, status: p.status }))}
      results={results}
      criteria={criteria}
      maxScore={maxScore}
      totalSubmitted={totalSubmitted}
      canManageAll={canManageAll}
      isSuperAdmin={role === 'super_admin'}
      myRegion={myRegion}
      periodId={activePeriodId}
      initialOverrides={initialOverrides}
    />
  )
}
