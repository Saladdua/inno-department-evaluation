import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { createServiceClient } from '@/lib/supabase/server'
import type { User } from 'next-auth'

export type UserRole = 'super_admin' | 'leadership' | 'department'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      name: string
      email: string
      role: UserRole
      departmentId: string | null
      departmentName: string | null
    }
  }
  interface User {
    role: UserRole
    departmentId: string | null
    departmentName: string | null
  }
  interface JWT {
    role: UserRole
    departmentId: string | null
    departmentName: string | null
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials): Promise<User | null> {
        if (!credentials?.email || !credentials?.password) return null

        const supabase = createServiceClient()

        const { data: user, error } = await supabase
          .from('users')
          .select('id, name, email, role, department_id, password_hash, departments(name)')
          .eq('email', credentials.email as string)
          .maybeSingle()

        if (error) {
          console.error('[auth] DB error:', error.message)
          return null
        }
        if (!user) {
          console.error('[auth] No user found for email:', credentials.email)
          return null
        }

        if (user.password_hash !== (credentials.password as string)) {
          console.error('[auth] Wrong password for:', credentials.email)
          return null
        }

        const deptRaw = user.departments
        const dept = Array.isArray(deptRaw) ? (deptRaw[0] as { name: string } | undefined) : (deptRaw as { name: string } | null)

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role as UserRole,
          departmentId: user.department_id ?? null,
          departmentName: dept?.name ?? null,
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token['role'] = user.role
        token['departmentId'] = user.departmentId
        token['departmentName'] = user.departmentName
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.sub!
      session.user.role = token['role'] as UserRole
      session.user.departmentId = (token['departmentId'] as string | null) ?? null
      session.user.departmentName = (token['departmentName'] as string | null) ?? null
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  session: { strategy: 'jwt' },
})
