import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// DELETE THIS FILE after debugging — never leave debug endpoints in production
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const email = searchParams.get('email')
  if (!email) return NextResponse.json({ error: 'Pass ?email=...' }, { status: 400 })

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, role, department_id, password_hash')
    .eq('email', email)
    .maybeSingle()

  return NextResponse.json({
    found:         !!data,
    error:         error?.message ?? null,
    has_password_hash_column: error ? 'unknown — query failed' : true,
    password_hash_set: data ? (data.password_hash?.length > 0) : false,
    role:          data?.role ?? null,
  })
}
