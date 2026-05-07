import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const periodId = searchParams.get('periodId')
  if (!periodId) return NextResponse.json({ error: 'Missing periodId' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('evaluation_matrix')
    .select('evaluator_id, target_id, selected_by')
    .eq('period_id', periodId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST body: { period_id, evaluator_id, target_id, action: 'add'|'remove'|'clear' }
// Upper-triangle only: evaluator must have lower display_order than target.
// add    → inserts ONE direction (evaluator→target), fires chosen_for_evaluation notification
// remove → deletes that single direction
// clear  → admin/leadership only — wipes entire period matrix
export async function POST(req: Request) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { period_id, evaluator_id, target_id, action } = body

  if (!period_id || !action) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const canManageAll = user.role === 'super_admin' || user.role === 'leadership'
  const supabase = createServiceClient()

  if (action === 'clear') {
    if (!canManageAll) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    await supabase.from('evaluations').delete().eq('period_id', period_id)
    await supabase.from('evaluation_matrix').delete().eq('period_id', period_id)

    const { data, error } = await supabase
      .from('evaluation_matrix')
      .select('evaluator_id, target_id, selected_by')
      .eq('period_id', period_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ entries: data ?? [] })
  }

  if (!evaluator_id || !target_id) {
    return NextResponse.json({ error: 'Missing evaluator_id or target_id' }, { status: 400 })
  }

  // Dept users can only act on their own evaluator row
  if (!canManageAll && user.departmentId !== evaluator_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Validate upper-triangle: evaluator must have strictly lower display_order than target
  const { data: deptRows } = await supabase
    .from('departments')
    .select('id, display_order, name')
    .in('id', [evaluator_id, target_id])

  const evaluatorDept = deptRows?.find(d => d.id === evaluator_id)
  const targetDept    = deptRows?.find(d => d.id === target_id)

  if (!evaluatorDept || !targetDept) {
    return NextResponse.json({ error: 'Invalid department ids' }, { status: 400 })
  }

  if (evaluatorDept.display_order >= targetDept.display_order) {
    return NextResponse.json(
      { error: 'Chỉ có thể chọn phòng ban có thứ tự cao hơn trong ma trận' },
      { status: 400 }
    )
  }

  if (action === 'add') {
    // Create both directions: A→B (chosen) and B→A (mirror, so B must evaluate A back)
    const { error } = await supabase
      .from('evaluation_matrix')
      .upsert(
        [
          { period_id, evaluator_id,        target_id,    selected_by: user.id },
          { period_id, evaluator_id: target_id, target_id: evaluator_id, selected_by: user.id },
        ],
        { onConflict: 'period_id,evaluator_id,target_id', ignoreDuplicates: true }
      )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Fire chosen_for_evaluation notification to the target dept
    await supabase.from('notifications').insert({
      type: 'chosen_for_evaluation',
      recipient_dept_id: target_id,
      data: {
        evaluator_dept_id:   evaluator_id,
        evaluator_dept_name: evaluatorDept.name,
        period_id,
      },
    })

  } else if (action === 'remove') {
    // Remove both directions
    const { error } = await supabase
      .from('evaluation_matrix')
      .delete()
      .eq('period_id', period_id)
      .or(
        `and(evaluator_id.eq.${evaluator_id},target_id.eq.${target_id}),` +
        `and(evaluator_id.eq.${target_id},target_id.eq.${evaluator_id})`
      )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  } else {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const { data, error: fetchError } = await supabase
    .from('evaluation_matrix')
    .select('evaluator_id, target_id, selected_by')
    .eq('period_id', period_id)

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  return NextResponse.json({ entries: data ?? [] })
}
