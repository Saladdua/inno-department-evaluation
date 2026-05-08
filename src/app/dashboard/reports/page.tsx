import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import ReportsClient, { type Report } from './ReportsClient'

export default async function ReportsPage() {
  const session = await auth()
  const role = session?.user?.role as string | undefined

  if (!role || !['super_admin', 'leadership'].includes(role)) {
    redirect('/dashboard')
  }

  const supabase = createServiceClient()

  const { data } = await supabase
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

  return <ReportsClient initialReports={(data ?? []) as Report[]} />
}
