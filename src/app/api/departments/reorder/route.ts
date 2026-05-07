import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase/server'

// POST /api/departments/reorder
// Body: [{ id: string, display_order: number }, ...]
export async function POST(req: Request) {
  const user = await getAuthUser(req)
  if (!user || !['super_admin', 'leadership'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  if (!Array.isArray(body) || body.length === 0) {
    return NextResponse.json({ error: 'Expected array of { id, display_order }' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Update each dept's display_order individually (Supabase JS doesn't support bulk UPDATE with different values)
  const updates = body as Array<{ id: string; display_order: number }>
  const errors: string[] = []

  await Promise.all(
    updates.map(async ({ id, display_order }) => {
      const { error } = await supabase
        .from('departments')
        .update({ display_order })
        .eq('id', id)
      if (error) errors.push(error.message)
    })
  )

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join('; ') }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
