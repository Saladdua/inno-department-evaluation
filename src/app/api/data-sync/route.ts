import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase/server'

// POST /api/data-sync
// Body: { periodId, source: 'bang_luong'|'timesheets', scores: [{deptId, score}] }
// Writes auto scores globally per department — no dependency on existing evaluations.
export async function POST(req: Request) {
  const user = await getAuthUser(req)
  if (!user || user.role !== 'super_admin') {
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

  // Find auto criteria for this source and period
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

  const now = new Date().toISOString()

  // Upsert one row per (dept × auto_criteria) — global, independent of evaluators
  const rows = scores.flatMap(({ deptId, score }) =>
    criteriaData.map(c => ({
      period_id:   periodId,
      dept_id:     deptId,
      criteria_id: c.id,
      source,
      raw_score:   Math.max(0, Math.min(100, score)),
      updated_at:  now,
    }))
  )

  const { error: upsertErr } = await supabase
    .from('auto_scores')
    .upsert(rows, { onConflict: 'period_id,dept_id,criteria_id' })

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  return NextResponse.json({ updated: rows.length })
}
