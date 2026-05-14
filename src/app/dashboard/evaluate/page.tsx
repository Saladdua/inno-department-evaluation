import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { getSelectedPeriod } from '@/lib/selected-period'
import EvaluateClient from './EvaluateClient'
import type { Criterion, Department, MatrixEntry, EvaluationRow, ScoreRow } from './EvaluateClient'

export default async function EvaluatePage() {
  const session = await auth()
  if (!session) redirect('/login')

  const role = session.user.role as 'super_admin' | 'leadership' | 'department'
  const myDeptId = session.user.departmentId ?? null
  const isLeader = role === 'leadership'
  const leaderId = session.user.id

  const supabase = createServiceClient()

  const period = await getSelectedPeriod()

  if (!period) {
    return (
      <div style={{ color: 'rgba(255,255,255,0.25)', fontStyle: 'italic', fontSize: 13, padding: '48px 0' }}>
        Chưa có kỳ đánh giá nào được thiết lập.
      </div>
    )
  }

  if (period.status === 'closed') {
    return (
      <div style={{ color: 'rgba(255,255,255,0.25)', fontStyle: 'italic', fontSize: 13, padding: '48px 0' }}>
        Kỳ đánh giá Quý {period.quarter} · {period.year} đã kết thúc. Xem kết quả tại trang Kết quả.
      </div>
    )
  }

  const [criteriaResult, deptsResult] = await Promise.all([
    supabase
      .from('criteria')
      .select('id, code, name, weight, input_type, auto_source, display_order')
      .eq('period_id', period.id)
      .order('display_order'),

    supabase
      .from('departments')
      .select('id, name, code')
      .order('name'),
  ])

  const depts = (deptsResult.data ?? []) as Department[]

  // Matrix: leaders evaluate all departments as themselves
  let matrix: MatrixEntry[] = []
  if (isLeader) {
    matrix = depts.map(d => ({ evaluator_id: leaderId, target_id: d.id }))
  } else if (role === 'department' && myDeptId) {
    const { data } = await supabase
      .from('evaluation_matrix')
      .select('evaluator_id, target_id')
      .eq('period_id', period.id)
      .eq('evaluator_id', myDeptId)
    matrix = (data ?? []) as MatrixEntry[]
  } else {
    // super_admin: all matrix entries
    const { data } = await supabase
      .from('evaluation_matrix')
      .select('evaluator_id, target_id')
      .eq('period_id', period.id)
    matrix = (data ?? []) as MatrixEntry[]
  }

  // Evaluations: leaders fetch by their user ID
  let evaluations: EvaluationRow[] = []
  if (isLeader) {
    const { data } = await supabase
      .from('evaluations')
      .select('id, evaluator_id, target_id, status, total_score')
      .eq('period_id', period.id)
      .eq('evaluator_id', leaderId)
    evaluations = (data ?? []) as EvaluationRow[]
  } else if (role === 'department' && myDeptId) {
    const { data } = await supabase
      .from('evaluations')
      .select('id, evaluator_id, target_id, status, total_score')
      .eq('period_id', period.id)
      .eq('evaluator_id', myDeptId)
    evaluations = (data ?? []) as EvaluationRow[]
  } else {
    const { data } = await supabase
      .from('evaluations')
      .select('id, evaluator_id, target_id, status, total_score')
      .eq('period_id', period.id)
    evaluations = (data ?? []) as EvaluationRow[]
  }

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
      depts={depts}
      matrix={matrix}
      initialEvaluations={evaluations}
      initialScores={scores}
      role={role}
      myDeptId={myDeptId}
      isLeader={isLeader}
    />
  )
}
