import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase/server'
import { completionErrorMessage, getEvaluationCompletion } from '@/lib/evaluation-completion'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const supabase = createServiceClient()

  if (searchParams.get('all') === 'true') {
    const { data, error } = await supabase
      .from('evaluation_periods')
      .select('*')
      .order('year', { ascending: false })
      .order('quarter', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  const { data, error } = await supabase
    .from('evaluation_periods')
    .select('*')
    .order('year', { ascending: false })
    .order('quarter', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const user = await getAuthUser(req)
  if (!user || !['super_admin', 'leadership'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('evaluation_periods')
    .insert({
      quarter:    body.quarter,
      year:       body.year,
      start_date: body.start_date,
      end_date:   body.end_date,
      status:     body.status ?? 'draft',
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Copy criteria from a previous period if requested
  if (body.copy_criteria_from) {
    let copyQuery = supabase
      .from('criteria')
      .select('code, name, notes, weight, input_type, auto_source, display_order, region')
      .eq('period_id', body.copy_criteria_from)
      .order('display_order')
    if (body.copy_criteria_from_region) {
      copyQuery = copyQuery.eq('region', body.copy_criteria_from_region) as typeof copyQuery
    }
    const { data: sourceCriteria } = await copyQuery

    if (sourceCriteria && sourceCriteria.length > 0) {
      await supabase.from('criteria').insert(
        sourceCriteria.map(c => ({ ...c, period_id: data.id }))
      )
    }
  }

  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: Request) {
  const user = await getAuthUser(req)
  if (!user || user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = createServiceClient()

  const { data: evals } = await supabase.from('evaluations').select('id').eq('period_id', id)
  const evalIds = (evals ?? []).map(e => e.id)
  if (evalIds.length > 0) {
    await supabase.from('evaluation_scores').delete().in('evaluation_id', evalIds)
  }
  await supabase.from('evaluations').delete().eq('period_id', id)
  await supabase.from('evaluation_matrix').delete().eq('period_id', id)
  await supabase.from('criteria').delete().eq('period_id', id)
  await supabase.from('matrix_commits').delete().eq('period_id', id)

  const { error } = await supabase.from('evaluation_periods').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PUT(req: Request) {
  const user = await getAuthUser(req)
  if (!user || !['super_admin', 'leadership'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = createServiceClient()

  // Read previous status to detect transitions
  const { data: previous } = await supabase
    .from('evaluation_periods')
    .select('status, quarter, year')
    .eq('id', id)
    .maybeSingle()

  // Guard: all matrix assignments and all regional leadership evaluations must be submitted.
  if (fields.status === 'closed' && previous?.status !== 'closed') {
    try {
      const completion = await getEvaluationCompletion(supabase, id)
      if (completion.incomplete.length > 0) {
        const pairs = completion.incomplete
          .slice(0, 50)
          .map(task => `${task.evaluatorName} -> ${task.targetName}`)
        return NextResponse.json(
          {
            error: completionErrorMessage(completion.incomplete.length),
            incomplete: pairs,
            totalRequired: completion.totalRequired,
            submittedRequired: completion.submittedRequired,
          },
          { status: 422 }
        )
      }
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Không kiểm tra được tiến độ đánh giá.' },
        { status: 500 }
      )
    }
  }

  // Guard: block closing if any evaluation pair is not yet submitted
  if (fields.status === 'closed' && previous?.status !== 'closed') {
    const [{ data: matrix }, { data: evaluations }, { data: departments }] = await Promise.all([
      supabase.from('evaluation_matrix').select('evaluator_id, target_id').eq('period_id', id),
      supabase.from('evaluations').select('evaluator_id, target_id, status').eq('period_id', id),
      supabase.from('departments').select('id, name'),
    ])

    const deptMap = new Map((departments ?? []).map(d => [d.id as string, d.name as string]))
    const evalsArr = evaluations ?? []

    const incomplete = (matrix ?? []).filter(m => {
      const match = evalsArr.find(
        e => e.evaluator_id === m.evaluator_id && e.target_id === m.target_id
      )
      return !match || match.status !== 'submitted'
    })

    if (incomplete.length > 0) {
      const pairs = incomplete.map(m =>
        `${deptMap.get(m.evaluator_id) ?? m.evaluator_id} → ${deptMap.get(m.target_id) ?? m.target_id}`
      )
      return NextResponse.json(
        { error: `Chưa thể kết thúc — còn ${incomplete.length} cặp đánh giá chưa hoàn thành.`, incomplete: pairs },
        { status: 422 }
      )
    }
  }

  const { data, error } = await supabase
    .from('evaluation_periods')
    .update(fields)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fire broadcast notifications on status transitions
  const prevStatus = previous?.status
  const newStatus  = fields.status
  const periodLabel = `Quý ${data.quarter} · ${data.year}`

  if (prevStatus !== 'active' && newStatus === 'active') {
    await supabase.from('notifications').insert({
      type: 'period_started',
      recipient_dept_id: null,
      data: { period_id: id, period_label: periodLabel },
    })
  } else if (prevStatus !== 'closed' && newStatus === 'closed') {
    await supabase.from('notifications').insert({
      type: 'period_ended',
      recipient_dept_id: null,
      data: { period_id: id, period_label: periodLabel },
    })
  }

  return NextResponse.json(data)
}
