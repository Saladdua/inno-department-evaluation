import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase/server'

// POST /api/data-sync
// Body: { periodId, source: 'bang_luong'|'timesheets', scores: [{deptId, score}] }
export async function POST(req: Request) {
  const user = await getAuthUser(req)
  if (!user || !['super_admin', 'leadership'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { periodId, source, scores } = body as {
    periodId: string
    source: string
    scores: Array<{ deptId: string; score: number }>
  }

  if (!periodId || !source || !Array.isArray(scores) || scores.length === 0) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Find criteria with this auto_source for the period
  const { data: criteriaData, error: criteriaErr } = await supabase
    .from('criteria')
    .select('id, weight')
    .eq('period_id', periodId)
    .eq('auto_source', source)

  if (criteriaErr) return NextResponse.json({ error: criteriaErr.message }, { status: 500 })
  if (!criteriaData || criteriaData.length === 0) {
    return NextResponse.json(
      { error: `Không tìm thấy tiêu chí loại "${source}" trong kỳ này` },
      { status: 404 },
    )
  }

  const deptIds = scores.map(s => s.deptId)
  const scoreMap = new Map(scores.map(s => [s.deptId, s.score]))

  // All evaluations targeting these departments in this period
  const { data: evals, error: evalsErr } = await supabase
    .from('evaluations')
    .select('id, target_id')
    .eq('period_id', periodId)
    .in('target_id', deptIds)

  if (evalsErr) return NextResponse.json({ error: evalsErr.message }, { status: 500 })
  if (!evals || evals.length === 0) {
    return NextResponse.json({ updated: 0, message: 'Chưa có đánh giá nào để cập nhật' })
  }

  const rows: Array<{
    evaluation_id: string
    criteria_id: string
    raw_score: number
    weighted_score: number
    updated_at: string
  }> = []

  for (const ev of evals) {
    const score = scoreMap.get(ev.target_id)
    if (score === undefined) continue
    for (const c of criteriaData) {
      rows.push({
        evaluation_id: ev.id,
        criteria_id: c.id,
        raw_score: score,
        weighted_score: score * Number(c.weight),
        updated_at: new Date().toISOString(),
      })
    }
  }

  if (rows.length === 0) return NextResponse.json({ updated: 0 })

  const { error: upsertErr } = await supabase
    .from('evaluation_scores')
    .upsert(rows, { onConflict: 'evaluation_id,criteria_id' })

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  return NextResponse.json({ updated: rows.length })
}
