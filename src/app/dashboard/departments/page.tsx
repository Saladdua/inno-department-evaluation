import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase/server'
import DepartmentsClient, { type Department } from './DepartmentsClient'

export default async function DepartmentsPage() {
  const session = await auth()
  if (!session || !['super_admin', 'leadership'].includes(session.user.role)) redirect('/dashboard')

  const supabase = createServiceClient()

  const [{ data: deptsData }, { data: userCounts }] = await Promise.all([
    supabase.from('departments').select('id, name, code').order('name'),
    supabase.from('users').select('department_id').not('department_id', 'is', null),
  ])

  const countMap = new Map<string, number>()
  for (const u of userCounts ?? []) {
    if (u.department_id) countMap.set(u.department_id, (countMap.get(u.department_id) ?? 0) + 1)
  }

  const departments: Department[] = (deptsData ?? []).map(d => ({
    ...d,
    userCount: countMap.get(d.id) ?? 0,
  }))

  return <DepartmentsClient initialDepartments={departments} />
}
