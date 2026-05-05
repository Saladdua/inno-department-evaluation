import { auth } from '@/auth'
import { jwtVerify } from 'jose'
import type { UserRole } from '@/auth'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: UserRole
  departmentId: string | null
  departmentName: string | null
}

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET ?? '')

export async function getAuthUser(req: Request): Promise<AuthUser | null> {
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const { payload } = await jwtVerify(authHeader.slice(7), SECRET)
      return {
        id: payload.sub!,
        name: payload['name'] as string,
        email: payload['email'] as string,
        role: payload['role'] as UserRole,
        departmentId: (payload['departmentId'] as string | null) ?? null,
        departmentName: (payload['departmentName'] as string | null) ?? null,
      }
    } catch {
      return null
    }
  }

  const session = await auth()
  return session ? (session.user as AuthUser) : null
}
