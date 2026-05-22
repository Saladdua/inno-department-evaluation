import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import DetailClient from './DetailClient'
import type { CriterionInfo, EvaluatorEntry, TargetData } from './DetailClient'

export default async function ResultsDetailPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; quarter?: string }>
}) {
  const { year: yearParam, quarter: quarterParam } = await searchParams
  const session = await auth()
  if (!session) redirect('/login')

  const role = session.user.role as 'super_admin' | 'leadership' | 'department'
  const myDeptId = session.user.departmentId ?? null
  const myUserId = session.user.id

  const supabase = createServiceClient()

  const { data: periodsData } = await supabase
    .from('evaluation_periods')
    .select('id, quarter, year, status')
    .order('year', { ascending: false })
    .order('quarter', { ascending: false })
  const periods = periodsData ?? []

  if (periods.length === 0) {
    return (
      <div style={{ color: 'rgba(255,255,255,0.25)', fontStyle: 'italic', fontSize: 13, padding: '48px 0' }}>
        Chưa có kỳ đánh giá nào được thiết lập.
      </div>
    )
  }

  const years = [...new Set(periods.map(p => p.year as number))].sort((a, b) => b - a)

  let activeYear: number
  let activeQuarter: number

  if (yearParam && quarterParam) {
    activeYear = Number(yearParam)
    activeQuarter = Number(quarterParam)
  } else {
    const latest = periods[0]
    activeYear = latest.year
    activeQuarter = latest.quarter
  }

  const period = periods.find(p => p.year === activeYear && p.quarter === activeQuarter) ?? periods[0]
  activeYear = period.year
  activeQuarter = period.quarter

  if (!period) {
    return (
      <div style={{ color: 'rgba(255,255,255,0.25)', fontStyle: 'italic', fontSize: 13, padding: '48px 0' }}>
        Không tìm thấy kỳ đánh giá.
      </div>
    )
  }

  // Determine region for filtering (leadership: from users table; department: from their dept)
  let myRegion: string | null = null
  if (role === 'leadership') {
    const { data: ldr } = await supabase.from('users').select('region').eq('id', myUserId).maybeSingle()
    myRegion = ldr?.region ?? 'Miền Bắc'
  }

  const [criteriaResult, deptsResult, evalsResult] = await Promise.all([
    supabase.from('criteria').select('id, code, name, weight, region').eq('period_id', period.id).order('display_order'),
    supabase.from('departments').select('id, name, code, region').order('name'),
    supabase
      .from('evaluations')
      .select('id, evaluator_id, target_id, total_score')
      .eq('period_id', period.id)
      .eq('status', 'submitted'),
  ])

  const criteria: CriterionInfo[] = (criteriaResult.data ?? []).map(c => ({
    id: c.id, code: c.code, name: c.name, weight: Number(c.weight), region: c.region ?? null,
  }))
  const depts = deptsResult.data ?? []

  // Derive department user's region from their dept record
  if (role === 'department' && myDeptId) {
    myRegion = depts.find(d => d.id === myDeptId)?.region ?? 'Miền Bắc'
  }
  const submitted = evalsResult.data ?? []

  // Fetch all scores for submitted evaluations
  const evalIds = submitted.map(e => e.id)
  let rawScores: { evaluation_id: string; criteria_id: string; raw_score: number | null; weighted_score: number | null }[] = []
  if (evalIds.length > 0) {
    const { data } = await supabase
      .from('evaluation_scores')
      .select('evaluation_id, criteria_id, raw_score, weighted_score')
      .in('evaluation_id', evalIds)
    rawScores = data ?? []
  }

  // Group submitted evaluations by target, then by evaluator
  const targetMap = new Map<string, EvaluatorEntry[]>()
  for (const ev of submitted) {
    if (!targetMap.has(ev.target_id)) targetMap.set(ev.target_id, [])
    const evScores = rawScores.filter(s => s.evaluation_id === ev.id)
    const evaluatorDept = depts.find(d => d.id === ev.evaluator_id)

    targetMap.get(ev.target_id)!.push({
      evaluatorId:   ev.evaluator_id,
      evaluatorCode: evaluatorDept?.code ?? null,
      evaluatorName: evaluatorDept?.name ?? ev.evaluator_id,
      totalScore:    ev.total_score,
      scores: evScores.map(s => ({
        criteriaId:    s.criteria_id,
        rawScore:      s.raw_score,
        weightedScore: s.weighted_score,
      })),
    })
  }

  // Departments only see their own result; admins/leadership see all
  const targetFilter = role === 'department' && myDeptId
    ? (d: { id: string }) => d.id === myDeptId && targetMap.has(d.id)
    : (d: { id: string }) => targetMap.has(d.id)

  const targets: TargetData[] = depts
    .filter(targetFilter)
    .map(d => ({
      targetId:   d.id,
      targetName: d.name,
      targetCode: d.code,
      region:     d.region ?? 'Miền Bắc',
      evaluators: (targetMap.get(d.id) ?? []).sort((a, b) =>
        (a.evaluatorName ?? '').localeCompare(b.evaluatorName ?? '')
      ),
    }))

  return (
    <DetailClient
      periodLabel={`Quý ${period.quarter} · ${period.year}`}
      criteria={criteria}
      targets={targets}
      role={role}
      myRegion={myRegion}
      periods={periods.map(p => ({ id: p.id, quarter: p.quarter, year: p.year, status: p.status }))}
      activeYear={activeYear}
      activeQuarter={activeQuarter}
      years={years}
    />
  )
}
