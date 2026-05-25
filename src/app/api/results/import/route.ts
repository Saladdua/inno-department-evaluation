import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase/server'

// POST /api/results/import
// Body: { period_id, region, overrides: [{dept_id, score}] }
// Requires super_admin or leadership role.
// Deletes existing overrides for this period+region, then inserts the new set.
// Passing an empty overrides array clears all overrides for that region.
export async function POST(req: Request) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const canManageAll = user.role === 'super_admin' || user.role === 'leadership'
  if (!canManageAll) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { period_id, region, overrides } = body as {
    period_id: string
    region: string
    overrides: { dept_id: string; score: number }[]
  }

  if (!period_id || !region) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Scope the delete to only depts in this region
  const { data: regionDepts } = await supabase
    .from('departments')
    .select('id')
    .eq('region', region)
  const regionDeptIds = (regionDepts ?? []).map((d: { id: string }) => d.id)

  if (regionDeptIds.length > 0) {
    const { error: delErr } = await supabase
      .from('score_overrides')
      .delete()
      .eq('period_id', period_id)
      .in('dept_id', regionDeptIds)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  if (overrides.length > 0) {
    const { error: insErr } = await supabase
      .from('score_overrides')
      .insert(overrides.map(o => ({
        period_id,
        dept_id: o.dept_id,
        score: o.score,
        imported_by: user.id,
      })))
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, count: overrides.length })
}
