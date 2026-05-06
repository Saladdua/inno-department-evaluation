import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase/server'

function adminOnly(user: Awaited<ReturnType<typeof getAuthUser>>) {
  return !user || !['super_admin', 'leadership'].includes(user.role)
}

export async function GET(req: Request) {
  const user = await getAuthUser(req)
  if (adminOnly(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, role, department_id, departments(id, name, code)')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const user = await getAuthUser(req)
  if (adminOnly(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, email, password, role, department_id } = body

  if (!name || !email || !password || !role) {
    return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('users')
    .insert({ name, email, password_hash: password, role, department_id: department_id || null })
    .select('id, name, email, role, department_id, departments(id, name, code)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PUT(req: Request) {
  const user = await getAuthUser(req)
  if (adminOnly(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { id, name, email, password, role, department_id } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const updates: Record<string, unknown> = { name, email, role, department_id: department_id || null }
  if (password) updates.password_hash = password

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', id)
    .select('id, name, email, role, department_id, departments(id, name, code)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: Request) {
  const user = await getAuthUser(req)
  if (adminOnly(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  if (user!.id === id) {
    return NextResponse.json({ error: 'Không thể xóa tài khoản đang đăng nhập' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase.from('users').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
