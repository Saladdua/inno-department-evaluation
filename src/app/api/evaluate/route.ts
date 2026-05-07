import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/evaluate?periodId=&evaluatorId=
export async function GET(req: Request) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const periodId = searchParams.get('periodId')
  if (!periodId) return NextResponse.json({ error: 'Missing periodId' }, { status: 400 })

  const requestedEvaluatorId = searchParams.get('evaluatorId')
  const canManageAll = user.role === 'super_admin' || user.role === 'leadership'
  const evaluatorId = canManageAll ? requestedEvaluatorId : user.departmentId

  const supabase = createServiceClient()

  let query = supabase
    .from('evaluations')
    .select('id, evaluator_id, target_id, status, total_score, submitted_at')
    .eq('period_id', periodId)

  if (evaluatorId) query = query.eq('evaluator_id', evaluatorId)

  const { data: evaluations, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const evalIds = (evaluations ?? []).map(e => e.id)
  let scores: object[] = []
  if (evalIds.length > 0) {
    const { data } = await supabase
      .from('evaluation_scores')
      .select('evaluation_id, criteria_id, raw_score, note')
      .in('evaluation_id', evalIds)
    scores = data ?? []
  }

  return NextResponse.json({ evaluations: evaluations ?? [], scores })
}

// POST /api/evaluate — save draft or submit
// Body: { period_id, evaluator_id, target_id, scores: [{criteria_id, raw_score, note, weight}], submit: boolean }
export async function POST(req: Request) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { period_id, evaluator_id, target_id, scores, submit } = body as {
    period_id: string
    evaluator_id: string
    target_id: string
    scores: Array<{ criteria_id: string; raw_score: number | null; note: string | null; weight: number }>
    submit: boolean
  }

  if (!period_id || !evaluator_id || !target_id) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const canManageAll = user.role === 'super_admin' || user.role === 'leadership'
  if (!canManageAll && user.departmentId !== evaluator_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createServiceClient()

  // Block writes on closed periods
  const { data: periodCheck } = await supabase
    .from('evaluation_periods')
    .select('status')
    .eq('id', period_id)
    .maybeSingle()
  if (periodCheck?.status === 'closed') {
    return NextResponse.json({ error: 'Kỳ đánh giá đã tổng kết, không thể chỉnh sửa.' }, { status: 403 })
  }

  // Guard: dept users cannot overwrite a submitted evaluation
  if (!canManageAll) {
    const { data: existing } = await supabase
      .from('evaluations')
      .select('status')
      .eq('period_id', period_id)
      .eq('evaluator_id', evaluator_id)
      .eq('target_id', target_id)
      .maybeSingle()

    if (existing?.status === 'submitted') {
      return NextResponse.json({ error: 'Already submitted' }, { status: 409 })
    }
  }

  // Compute total_score: Σ(raw * weight) / Σ(weight)  →  0–100 scale
  let total_score: number | null = null
  if (submit && Array.isArray(scores)) {
    const totalWeight = scores.reduce((sum, s) => sum + (s.weight ?? 1), 0)
    const weightedSum = scores.reduce((sum, s) => sum + (s.raw_score ?? 0) * (s.weight ?? 1), 0)
    total_score = totalWeight > 0 ? weightedSum / totalWeight : 0
  }

  const { data: evaluation, error: evalError } = await supabase
    .from('evaluations')
    .upsert(
      {
        period_id,
        evaluator_id,
        target_id,
        submitted_by: user.id,
        status: submit ? 'submitted' : 'draft',
        total_score: submit ? total_score : null,
        submitted_at: submit ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'period_id,evaluator_id,target_id' }
    )
    .select()
    .single()

  if (evalError) return NextResponse.json({ error: evalError.message }, { status: 500 })

  if (Array.isArray(scores) && scores.length > 0) {
    const scoreRows = scores
      .filter(s => s.criteria_id)
      .map(s => ({
        evaluation_id: evaluation.id,
        criteria_id: s.criteria_id,
        raw_score: s.raw_score ?? null,
        weighted_score: s.raw_score != null ? s.raw_score * (s.weight ?? 1) : null,
        note: s.note ?? null,
        updated_at: new Date().toISOString(),
      }))

    const { error: scoresError } = await supabase
      .from('evaluation_scores')
      .upsert(scoreRows, { onConflict: 'evaluation_id,criteria_id' })

    if (scoresError) return NextResponse.json({ error: scoresError.message }, { status: 500 })
  }

  return NextResponse.json({ evaluation })
}
