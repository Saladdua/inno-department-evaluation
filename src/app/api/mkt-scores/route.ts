import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase/server'

function mktAllowed(user: Awaited<ReturnType<typeof getAuthUser>>) {
  return user && ['super_admin', 'marketing'].includes(user.role)
}

// GET /api/mkt-scores?periodId=X
// Returns all mkt_scores for the period, plus departments list.
export async function GET(req: Request) {
  const user = await getAuthUser(req)
  if (!mktAllowed(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const periodId = searchParams.get('periodId')
  if (!periodId) return NextResponse.json({ error: 'Missing periodId' }, { status: 400 })

  const supabase = createServiceClient()
  const [{ data: departments }, { data: scores }] = await Promise.all([
    supabase.from('departments').select('id, name, code').order('name'),
    supabase.from('mkt_scores').select('dept_id, scores, member_count').eq('period_id', periodId),
  ])

  return NextResponse.json({
    departments: departments ?? [],
    scores: scores ?? [],
  })
}

// PUT /api/mkt-scores
// Body: { periodId, deptId, scores: number[], memberCount: number }
// Upserts a single dept's MKT scores.
export async function PUT(req: Request) {
  const user = await getAuthUser(req)
  if (!mktAllowed(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { periodId, deptId, scores, memberCount } = body as {
    periodId: string
    deptId: string
    scores: number[]
    memberCount: number
  }
  if (!periodId || !deptId || !Array.isArray(scores)) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('mkt_scores')
    .upsert(
      {
        period_id: periodId,
        dept_id: deptId,
        scores: scores.map(v => Math.max(0, Math.round(v))),
        member_count: Math.max(1, Math.round(memberCount ?? 1)),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'period_id,dept_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// POST /api/mkt-scores?action=push
// Body: { periodId }
// Computes MKT rankings and pushes scores to auto_scores.
export async function POST(req: Request) {
  const user = await getAuthUser(req)
  if (!mktAllowed(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { periodId } = body as { periodId: string }
  if (!periodId) return NextResponse.json({ error: 'Missing periodId' }, { status: 400 })

  const supabase = createServiceClient()

  // Fetch all mkt_scores for this period
  const { data: mktRows } = await supabase
    .from('mkt_scores')
    .select('dept_id, scores, member_count')
    .eq('period_id', periodId)

  if (!mktRows || mktRows.length === 0) {
    return NextResponse.json({ error: 'Chưa có dữ liệu điểm MKT nào để đẩy.' }, { status: 400 })
  }

  // Compute Q (score per person) for each dept
  const withQ = mktRows
    .map(row => {
      const total = (row.scores as number[]).reduce((s: number, v: number) => s + (v ?? 0), 0)
      const q = row.member_count > 0 ? total / row.member_count : null
      return { dept_id: row.dept_id, q }
    })
    .filter(r => r.q !== null) as { dept_id: string; q: number }[]

  // Sort descending by Q, assign ranks (ties share rank)
  withQ.sort((a, b) => b.q - a.q)
  let rank = 1
  const ranked: { dept_id: string; rank: number; points: number }[] = []
  for (let i = 0; i < withQ.length; i++) {
    if (i > 0 && withQ[i].q < withQ[i - 1].q) rank = i + 1
    const points = Math.max(0, 100 - 4.5 * (rank - 1))
    ranked.push({ dept_id: withQ[i].dept_id, rank, points })
  }

  if (ranked.length === 0) {
    return NextResponse.json({ error: 'Không có phòng nào có dữ liệu hợp lệ.' }, { status: 400 })
  }

  // Find or create criterion with auto_source='marketing'
  const { data: existingCrit } = await supabase
    .from('criteria')
    .select('id')
    .eq('period_id', periodId)
    .eq('auto_source', 'marketing')
    .maybeSingle()

  let criteriaId = existingCrit?.id as string | undefined

  if (!criteriaId) {
    const { data: maxRow } = await supabase
      .from('criteria')
      .select('display_order')
      .eq('period_id', periodId)
      .order('display_order', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: newCrit, error: critErr } = await supabase
      .from('criteria')
      .insert({
        period_id: periodId,
        name: 'Hỗ trợ Marketing INNO',
        code: 'MKT01',
        weight: 1,
        input_type: 'auto',
        auto_source: 'marketing',
        display_order: ((maxRow as { display_order: number } | null)?.display_order ?? 0) + 1,
      })
      .select('id')
      .single()

    if (critErr || !newCrit) {
      return NextResponse.json({ error: 'Không tạo được tiêu chí MKT: ' + (critErr?.message ?? '') }, { status: 500 })
    }
    criteriaId = (newCrit as { id: string }).id
  }

  // Upsert auto_scores
  const toUpsert = ranked.map(r => ({
    period_id: periodId,
    dept_id: r.dept_id,
    criteria_id: criteriaId as string,
    source: 'marketing',
    raw_score: r.points,
    updated_at: new Date().toISOString(),
  }))

  const { error: upsertErr } = await supabase
    .from('auto_scores')
    .upsert(toUpsert, { onConflict: 'period_id,dept_id,criteria_id' })

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, pushed: ranked.length })
}
