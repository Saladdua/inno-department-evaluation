import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/reports — admin/leadership only
export async function GET(req: Request) {
  const user = await getAuthUser(req)
  if (!user || !['super_admin', 'leadership'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('evaluation_reports')
    .select(`
      id,
      reason,
      created_at,
      reporter_dept_id,
      notification_id,
      reporter:departments!reporter_dept_id(id, name, code),
      notification:notifications!notification_id(id, data)
    `)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// DELETE /api/reports
// Body: { id, action: 'dismiss' | 'approve' }
// dismiss → delete report row, notify both parties
// approve → delete report row + remove matrix pair, notify both parties
export async function DELETE(req: Request) {
  const user = await getAuthUser(req)
  if (!user || !['super_admin', 'leadership'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { id, action } = body as { id: string; action: 'dismiss' | 'approve' }

  if (!id || !['dismiss', 'approve'].includes(action)) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Fetch report + linked notification data before deleting
  const { data: report } = await supabase
    .from('evaluation_reports')
    .select('reporter_dept_id, notification:notifications!notification_id(data)')
    .eq('id', id)
    .maybeSingle()

  const notifData = (report?.notification as { data: Record<string, string> } | null)?.data ?? {}
  const evaluator_id: string | undefined = notifData.evaluator_dept_id
  const reporter_id: string | undefined = report?.reporter_dept_id
  const period_id: string | undefined = notifData.period_id

  if (action === 'approve' && evaluator_id && reporter_id && period_id) {
    await supabase
      .from('evaluation_matrix')
      .delete()
      .eq('period_id', period_id)
      .or(
        `and(evaluator_id.eq.${evaluator_id},target_id.eq.${reporter_id}),` +
        `and(evaluator_id.eq.${reporter_id},target_id.eq.${evaluator_id})`
      )
  }

  // Fetch dept names for notification text
  const deptIds = [reporter_id, evaluator_id].filter(Boolean) as string[]
  const { data: depts } = deptIds.length
    ? await supabase.from('departments').select('id, name').in('id', deptIds)
    : { data: [] }

  const deptName = (id: string | undefined) =>
    depts?.find(d => d.id === id)?.name ?? 'Phòng ban'

  const reporterName  = deptName(reporter_id)
  const evaluatorName = deptName(evaluator_id) ?? notifData.evaluator_dept_name ?? 'Phòng ban'

  // Notify reporter
  if (reporter_id) {
    await supabase.from('notifications').insert({
      type: 'report_resolved',
      recipient_dept_id: reporter_id,
      data: { action, role: 'reporter', reporter_dept_name: reporterName, evaluator_dept_name: evaluatorName },
    })
  }

  // Notify evaluator (reportee)
  if (evaluator_id) {
    await supabase.from('notifications').insert({
      type: 'report_resolved',
      recipient_dept_id: evaluator_id,
      data: { action, role: 'evaluator', reporter_dept_name: reporterName, evaluator_dept_name: evaluatorName },
    })
  }

  const { error } = await supabase
    .from('evaluation_reports')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
