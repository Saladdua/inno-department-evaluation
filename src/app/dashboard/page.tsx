import { auth } from '@/auth'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const session = await auth()
  if (session?.user?.role === 'marketing') {
    redirect('/dashboard/marketing')
  }
  redirect('/dashboard/criteria')
}
