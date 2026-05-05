import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import EvaluateClient from './EvaluateClient'
import type { Criterion, Department, MatrixEntry, EvaluationRow, ScoreRow } from './EvaluateClient'

export default async function EvaluatePage() {
  const session = await auth()
  if (!session) redirect('/login')

  const role = session.user.role as 'super_admin' | 'leadership' | 'department'
  const myDeptId = session.user.departmentId ?? null

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
    supabase
      .from('criteria')
      .select('id, code, name, weight, input_type, display_order')
      .eq('period_id', period.id)
      .order('display_order'),

    supabase
      .from('departments')
      .select('id, name, code')
      .order('name'),

    (role === 'department' && myDeptId
      ? supabase
          .from('evaluation_matrix')
          .select('evaluator_id, target_id')
          .eq('period_id', period.id)
          .eq('evaluator_id', myDeptId)
      : supabase
          .from('evaluation_matrix')
          .select('evaluator_id, target_id')
          .eq('period_id', period.id)
    ),

    (role === 'department' && myDeptId
      ? supabase
          .from('evaluations')
          .select('id, evaluator_id, target_id, status, total_score')
          .eq('period_id', period.id)
          .eq('evaluator_id', myDeptId)
      : supabase
          .from('evaluations')
          .select('id, evaluator_id, target_id, status, total_score')
          .eq('period_id', period.id)
    ),
  ])

  const evaluations = evalsResult.data ?? []
  const evalIds = evaluations.map(e => e.id)

  let scores: ScoreRow[] = []
  if (evalIds.length > 0) {
    const { data } = await supabase
      .from('evaluation_scores')
      .select('evaluation_id, criteria_id, raw_score, note')
      .in('evaluation_id', evalIds)
    scores = (data ?? []) as ScoreRow[]
  }

  return (
    <EvaluateClient
      periodId={period.id}
      periodLabel={`Quý ${period.quarter} · ${period.year}`}
      criteria={(criteriaResult.data ?? []) as Criterion[]}
      depts={(deptsResult.data ?? []) as Department[]}
      matrix={(matrixResult.data ?? []) as MatrixEntry[]}
      initialEvaluations={evaluations as EvaluationRow[]}
      initialScores={scores}
      role={role}
      myDeptId={myDeptId}
    />
  )
}
