'use server'
import { cookies } from 'next/headers'

export async function setSelectedPeriod(periodId: string) {
  const store = await cookies()
  store.set('selected_period_id', periodId, {
    path: '/',
    maxAge: 60 * 60 * 24 * 90,
    sameSite: 'lax',
    httpOnly: true,
  })
}
