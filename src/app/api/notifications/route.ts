import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/notifications
// Returns notifications visible to the current user:
//   - dept role: recipient_dept_id = myDeptId OR broadcast (recipient_dept_id IS NULL)
//   - admin/leadership: all notifications (or broadcasts only, depending on query param)
// Query params: ?unreadOnly=true
export async function GET(req: Request) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const unreadOnly = searchParams.get('unreadOnly') === 'true'

  const supabase = createServiceClient()
  const canManageAll = user.role === 'super_admin' || user.role === 'leadership'

  let query = supabase
    .from('notifications')
    .select('id, type, recipient_dept_id, data, is_read, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  if (!canManageAll) {
    // Dept: see own notifications + broadcasts
    if (user.departmentId) {
      query = query.or(`recipient_dept_id.eq.${user.departmentId},recipient_dept_id.is.null`)
    } else {
      query = query.is('recipient_dept_id', null)
    }
  }
  // Admin/leadership: see all

  if (unreadOnly) {
    query = query.eq('is_read', false)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// PATCH /api/notifications
// Body: { ids: string[] } — mark those notifications as read
// Or:   { all: true }    — mark all visible notifications as read
export async function PATCH(req: Request) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const supabase = createServiceClient()
  const canManageAll = user.role === 'super_admin' || user.role === 'leadership'

  if (body.all === true) {
    let query = supabase.from('notifications').update({ is_read: true }).eq('is_read', false)

    if (!canManageAll && user.departmentId) {
      query = supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('is_read', false)
        .or(`recipient_dept_id.eq.${user.departmentId},recipient_dept_id.is.null`)
    }

    const { error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const ids = body.ids as string[]
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'Missing ids' }, { status: 400 })
  }

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .in('id', ids)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// POST /api/notifications
// Body: { notification_id, reason } — submit a report about a notification
export async function POST(req: Request) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { notification_id, reason } = body as { notification_id: string; reason: string }

  if (!notification_id) {
    return NextResponse.json({ error: 'Missing notification_id' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Verify this notification belongs to this user's dept
  if (user.role === 'department' && user.departmentId) {
    const { data: notif } = await supabase
      .from('notifications')
      .select('recipient_dept_id')
      .eq('id', notification_id)
      .maybeSingle()

    if (!notif || notif.recipient_dept_id !== user.departmentId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const { data, error } = await supabase
    .from('evaluation_reports')
    .insert({
      notification_id,
      reporter_dept_id: user.departmentId ?? null,
      reason: reason ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Create a notification for admin/leadership about this report
  const { data: notif } = await supabase
    .from('notifications')
    .select('data')
    .eq('id', notification_id)
    .maybeSingle()

  await supabase.from('notifications').insert({
    type: 'report_submitted',
    recipient_dept_id: null, // broadcast to admin/leadership
    data: {
      ...(notif?.data ?? {}),
      reporter_dept_id: user.departmentId,
      reason,
      report_id: data.id,
    },
  })

  return NextResponse.json({ ok: true })
}
