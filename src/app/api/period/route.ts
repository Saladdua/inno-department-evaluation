import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const supabase = createServiceClient()

  if (searchParams.get('all') === 'true') {
    const { data, error } = await supabase
      .from('evaluation_periods')
      .select('*')
      .order('year', { ascending: false })
      .order('quarter', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  const { data, error } = await supabase
    .from('evaluation_periods')
    .select('*')
    .order('year', { ascending: false })
    .order('quarter', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const user = await getAuthUser(req)
  if (!user || !['super_admin', 'leadership'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('evaluation_periods')
    .insert({
      quarter:    body.quarter,
      year:       body.year,
      start_date: body.start_date,
      end_date:   body.end_date,
      status:     body.status ?? 'draft',
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Copy criteria from a previous period if requested
  if (body.copy_criteria_from) {
    const { data: sourceCriteria } = await supabase
      .from('criteria')
      .select('code, name, weight, input_type, auto_source, display_order')
      .eq('period_id', body.copy_criteria_from)
      .order('display_order')

    if (sourceCriteria && sourceCriteria.length > 0) {
      await supabase.from('criteria').insert(
        sourceCriteria.map(c => ({ ...c, period_id: data.id }))
      )
    }
  }

  return NextResponse.json(data, { status: 201 })
}

export async function PUT(req: Request) {
  const user = await getAuthUser(req)
  if (!user || !['super_admin', 'leadership'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = createServiceClient()

  // Read previous status to detect transitions
  const { data: previous } = await supabase
    .from('evaluation_periods')
    .select('status, quarter, year')
    .eq('id', id)
    .maybeSingle()

  const { data, error } = await supabase
    .from('evaluation_periods')
    .update(fields)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fire broadcast notifications on status transitions
  const prevStatus = previous?.status
  const newStatus  = fields.status
  const periodLabel = `Quý ${data.quarter} · ${data.year}`

  if (prevStatus !== 'active' && newStatus === 'active') {
    await supabase.from('notifications').insert({
      type: 'period_started',
      recipient_dept_id: null,
      data: { period_id: id, period_label: periodLabel },
    })
  } else if (prevStatus !== 'closed' && newStatus === 'closed') {
    await supabase.from('notifications').insert({
      type: 'period_ended',
      recipient_dept_id: null,
      data: { period_id: id, period_label: periodLabel },
    })
  }

  return NextResponse.json(data)
}
