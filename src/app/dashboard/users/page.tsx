import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase/server'
import UsersClient, { type AppUser, type Department } from './UsersClient'

export default async function UsersPage() {
  const session = await auth()
  if (!session || !['super_admin', 'leadership'].includes(session.user.role)) redirect('/dashboard')

  const supabase = createServiceClient()

  const [{ data: usersData }, { data: deptsData }] = await Promise.all([
    supabase
      .from('users')
      .select('id, name, email, role, department_id, departments(id, name, code)')
      .order('name'),
    supabase
      .from('departments')
      .select('id, name, code')
      .order('name'),
  ])

  const users = (usersData ?? []) as unknown as AppUser[]
  const departments = (deptsData ?? []) as unknown as Department[]

  return <UsersClient initialUsers={users} departments={departments} />
}
