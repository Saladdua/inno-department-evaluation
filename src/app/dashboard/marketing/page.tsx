import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import MarketingClient from './MarketingClient'

export default async function MarketingPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const role = session.user.role
  if (!['super_admin', 'marketing'].includes(role)) redirect('/dashboard/status')

  const supabase = createServiceClient()

  const [{ data: periodsData }, { data: deptsData }] = await Promise.all([
    supabase
      .from('evaluation_periods')
      .select('id, quarter, year, status')
      .order('year', { ascending: false })
      .order('quarter', { ascending: false }),
    supabase.from('departments').select('id, name, code, display_order').order('display_order', { ascending: true }).order('name', { ascending: true }),
  ])

  const period = (periodsData ?? [])[0] ?? null
  const departments = deptsData ?? []

  let mktScores: { dept_id: string; scores: number[]; member_count: number }[] = []
  if (period) {
    const { data } = await supabase
      .from('mkt_scores')
      .select('dept_id, scores, member_count')
      .eq('period_id', period.id)
    mktScores = (data ?? []) as typeof mktScores
  }

  if (!period) {
    return (
      <div style={{ color: 'rgba(255,255,255,0.25)', fontStyle: 'italic', fontSize: 13, padding: '48px 0' }}>
        Chưa có kỳ đánh giá nào được thiết lập.
      </div>
    )
  }

  return (
    <MarketingClient
      periodId={period.id}
      periodLabel={`Quý ${period.quarter} · ${period.year}`}
      departments={departments}
      initialScores={mktScores}
    />
  )
}
