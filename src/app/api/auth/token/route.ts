import { NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import { createServiceClient } from '@/lib/supabase/server'

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET ?? '')

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body?.email || !body?.password) {
    return NextResponse.json({ error: 'email and password required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: user, error } = await supabase
    .from('users')
    .select('id, name, email, role, department_id, password_hash, departments(name)')
    .eq('email', body.email as string)
    .maybeSingle()

  if (error || !user || user.password_hash !== (body.password as string)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const deptRaw = user.departments
  const dept = Array.isArray(deptRaw)
    ? (deptRaw[0] as { name: string } | undefined)
    : (deptRaw as { name: string } | null)

  const token = await new SignJWT({
    name: user.name,
    email: user.email,
    role: user.role,
    departmentId: user.department_id ?? null,
    departmentName: dept?.name ?? null,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET)

  return NextResponse.json({ token, token_type: 'Bearer', expires_in: 604800 })
}
