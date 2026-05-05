import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchUsersFromSheet } from '@/lib/google-sheets'

export async function POST() {
  const session = await auth()
  if (!session || session.user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createServiceClient()
  const sheetUsers = await fetchUsersFromSheet()

  // Upsert departments first
  const deptNames = [...new Set(sheetUsers.map((u) => u.departmentName).filter(Boolean))]
  if (deptNames.length) {
    await supabase
      .from('departments')
      .upsert(deptNames.map((name) => ({ name })), { onConflict: 'name', ignoreDuplicates: true })
  }

  const { data: departments } = await supabase.from('departments').select('id, name')
  const deptMap = new Map((departments ?? []).map((d) => [d.name, d.id]))

  // Upsert users
  const usersToUpsert = sheetUsers.map((u) => ({
    sheet_row_id: u.sheetRowId,
    name: u.name,
    email: u.email,
    password_hash: u.password,
    role: u.role,
    department_id: u.departmentName ? (deptMap.get(u.departmentName) ?? null) : null,
  }))

  const { error } = await supabase
    .from('users')
    .upsert(usersToUpsert, { onConflict: 'email' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ synced: usersToUpsert.length })
}
