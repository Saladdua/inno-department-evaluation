import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import type { UserRole } from '@/auth'

const PUBLIC_PATHS = ['/login']

// Which roles can access each route prefix
const ROLE_GATES: { prefix: string; roles: UserRole[] }[] = [
  { prefix: '/dashboard/results/detail', roles: ['leadership', 'super_admin'] },
  { prefix: '/dashboard/criteria',       roles: ['leadership', 'super_admin', 'department'] },
  { prefix: '/dashboard',                roles: ['leadership', 'super_admin', 'department'] },
]

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))

  if (isPublic) return NextResponse.next()

  // API routes handle their own auth (session or bearer token)
  if (pathname.startsWith('/api/')) return NextResponse.next()

  const session = req.auth
  if (!session) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  const role = session.user.role as UserRole
  for (const gate of ROLE_GATES) {
    if (pathname.startsWith(gate.prefix) && !gate.roles.includes(role)) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
}
