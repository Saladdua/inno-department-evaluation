import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import DetailClient from './DetailClient'
import type { CriterionInfo, EvaluatorEntry, TargetData } from './DetailClient'

export default async function ResultsDetailPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const role = session.user.role as 'super_admin' | 'leadership' | 'department'
  if (role === 'department') redirect('/dashboard/results')

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

  const [criteriaResult, deptsResult, evalsResult] = await Promise.all([
    supabase.from('criteria').select('id, code, name, weight').eq('period_id', period.id).order('display_order'),
    supabase.from('departments').select('id, name, code').order('name'),
    supabase
      .from('evaluations')
      .select('id, evaluator_id, target_id, total_score')
      .eq('period_id', period.id)
      .eq('status', 'submitted'),
  ])

  const criteria: CriterionInfo[] = (criteriaResult.data ?? []).map(c => ({
    id: c.id, code: c.code, name: c.name, weight: Number(c.weight),
  }))
  const depts     = deptsResult.data ?? []
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

  const maxScore = criteria.reduce((sum, c) => sum + c.weight * 10, 0)

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

  // Build TargetData array — only for depts that have received at least one evaluation
  const targets: TargetData[] = depts
    .filter(d => targetMap.has(d.id))
    .map(d => ({
      targetId:   d.id,
      targetName: d.name,
      targetCode: d.code,
      evaluators: (targetMap.get(d.id) ?? []).sort((a, b) =>
        (a.evaluatorName ?? '').localeCompare(b.evaluatorName ?? '')
      ),
    }))

  return (
    <DetailClient
      periodLabel={`Quý ${period.quarter} · ${period.year}`}
      criteria={criteria}
      targets={targets}
      maxScore={maxScore}
    />
  )
}
