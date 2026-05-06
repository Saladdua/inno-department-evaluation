import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('departments')
    .select('id, name, code')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const user = await getAuthUser(req)
  if (!user || !['super_admin', 'leadership'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { name, code } = body
  if (!name?.trim()) return NextResponse.json({ error: 'Tên phòng ban là bắt buộc' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('departments')
    .insert({ name: name.trim(), code: code?.trim() || null })
    .select('id, name, code')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PUT(req: Request) {
  const user = await getAuthUser(req)
  if (!user || !['super_admin', 'leadership'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { id, name, code } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  if (!name?.trim()) return NextResponse.json({ error: 'Tên phòng ban là bắt buộc' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('departments')
    .update({ name: name.trim(), code: code?.trim() || null })
    .eq('id', id)
    .select('id, name, code')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: Request) {
  const user = await getAuthUser(req)
  if (!user || !['super_admin', 'leadership'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = createServiceClient()

  // Check if any users belong to this department
  const { count } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('department_id', id)

  if (count && count > 0) {
    return NextResponse.json(
      { error: `Không thể xóa: có ${count} tài khoản đang thuộc phòng ban này` },
      { status: 409 }
    )
  }

  const { error } = await supabase.from('departments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
