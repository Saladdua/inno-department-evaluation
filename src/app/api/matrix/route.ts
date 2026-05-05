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

// POST body: { period_id, dept_a_id, dept_b_id, action: 'add'|'remove'|'clear' }
// add    → upserts BOTH (a→b) and (b→a), selected_by = current user
// remove → deletes both pairs where selected_by = current user
// clear  → admin/leadership only — wipes entire period matrix
export async function POST(req: Request) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { period_id, dept_a_id, dept_b_id, action } = body

  if (!period_id || !action) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const canManageAll = user.role === 'super_admin' || user.role === 'leadership'

  // Departments can only modify pairs where they are one of the parties
  if (!canManageAll && action !== 'clear') {
    if (user.departmentId !== dept_a_id && user.departmentId !== dept_b_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const supabase = createServiceClient()

  if (action === 'add') {
    const { error } = await supabase
      .from('evaluation_matrix')
      .upsert([
        { period_id, evaluator_id: dept_a_id, target_id: dept_b_id, selected_by: user.id },
        { period_id, evaluator_id: dept_b_id, target_id: dept_a_id, selected_by: user.id },
      ], { onConflict: 'period_id,evaluator_id,target_id', ignoreDuplicates: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  } else if (action === 'remove') {
    // Delete only the entries that this user created (both directions)
    const { error } = await supabase
      .from('evaluation_matrix')
      .delete()
      .eq('period_id', period_id)
      .eq('selected_by', user.id)
      .or(`and(evaluator_id.eq.${dept_a_id},target_id.eq.${dept_b_id}),and(evaluator_id.eq.${dept_b_id},target_id.eq.${dept_a_id})`)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  } else if (action === 'clear') {
    if (!canManageAll) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Delete evaluations (cascade deletes evaluation_scores) before clearing matrix
    const { error: evalsError } = await supabase
      .from('evaluations')
      .delete()
      .eq('period_id', period_id)
    if (evalsError) return NextResponse.json({ error: evalsError.message }, { status: 500 })

    const { error } = await supabase
      .from('evaluation_matrix')
      .delete()
      .eq('period_id', period_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  } else {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  // Return updated entries
  const { data, error: fetchError } = await supabase
    .from('evaluation_matrix')
    .select('evaluator_id, target_id, selected_by')
    .eq('period_id', period_id)

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  return NextResponse.json({ entries: data ?? [] })
}
