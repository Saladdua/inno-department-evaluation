import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/notifications
// Returns notifications visible to the current user, with per-user is_read derived
// from notification_reads table.
export async function GET(req: Request) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()
  const canManageAll = user.role === 'super_admin' || user.role === 'leadership'

  // Types visible to each role
  const visibleTypes = canManageAll
    ? ['report_submitted', 'period_started', 'period_ended']
    : ['chosen_for_evaluation', 'evaluation_submitted', 'period_started', 'period_ended', 'report_resolved']

  let query = supabase
    .from('notifications')
    .select('id, type, recipient_dept_id, data, created_at')
    .in('type', visibleTypes)
    .order('created_at', { ascending: false })
    .limit(50)

  if (!canManageAll) {
    if (user.departmentId) {
      query = query.or(`recipient_dept_id.eq.${user.departmentId},recipient_dept_id.is.null`)
    } else {
      query = query.is('recipient_dept_id', null)
    }
  }

  const { data: notifs, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const items = notifs ?? []
  if (items.length === 0) return NextResponse.json([])

  // Fetch which of these notifications the current user has already read
  const { data: reads } = await supabase
    .from('notification_reads')
    .select('notification_id')
    .eq('user_id', user.id)
    .in('notification_id', items.map(n => n.id))

  const readSet = new Set((reads ?? []).map(r => r.notification_id))

  return NextResponse.json(items.map(n => ({ ...n, is_read: readSet.has(n.id) })))
}

// PATCH /api/notifications
// Body: { ids: string[] } — mark specific notifications as read for the current user
// Body: { all: true }    — mark all visible notifications as read
export async function PATCH(req: Request) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const supabase = createServiceClient()

  let ids: string[] = []

  if (body.all === true) {
    // Fetch all visible notification IDs for this user
    const canManageAll = user.role === 'super_admin' || user.role === 'leadership'
    let q = supabase.from('notifications').select('id')
    if (!canManageAll && user.departmentId) {
      q = q.or(`recipient_dept_id.eq.${user.departmentId},recipient_dept_id.is.null`)
    } else if (!canManageAll) {
      q = q.is('recipient_dept_id', null)
    }
    const { data } = await q
    ids = (data ?? []).map(n => n.id)
  } else {
    ids = body.ids as string[]
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Missing ids' }, { status: 400 })
    }
  }

  if (ids.length === 0) return NextResponse.json({ ok: true })

  const { error } = await supabase
    .from('notification_reads')
    .upsert(
      ids.map(id => ({ user_id: user.id, notification_id: id })),
      { onConflict: 'user_id,notification_id', ignoreDuplicates: true }
    )

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

  // Notify admin/leadership about this report
  const [{ data: notif }, { data: reporterDept }] = await Promise.all([
    supabase.from('notifications').select('data').eq('id', notification_id).maybeSingle(),
    user.departmentId
      ? supabase.from('departments').select('name').eq('id', user.departmentId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  await supabase.from('notifications').insert({
    type: 'report_submitted',
    recipient_dept_id: null,
    data: {
      ...(notif?.data ?? {}),
      reporter_dept_id: user.departmentId,
      reporter_dept_name: reporterDept?.name ?? '',
      reason,
      report_id: data.id,
    },
  })

  return NextResponse.json({ ok: true })
}
