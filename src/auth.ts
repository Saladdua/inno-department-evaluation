import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
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
    role?: UserRole
    departmentId?: string | null
    departmentName?: string | null
  }
  interface JWT {
    role: UserRole
    departmentId: string | null
    departmentName: string | null
  }
}

const isDev = process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN === 'true'

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    // Dev-only: log in as any DB user by email, no password needed
    ...(isDev ? [Credentials({
      id: 'dev-credentials',
      name: 'Dev Login',
      credentials: {
        email: { label: 'Email', type: 'email' },
      },
      async authorize(credentials): Promise<User | null> {
        if (!credentials?.email) return null
        const supabase = createServiceClient()
        const { data: user } = await supabase
          .from('users')
          .select('id, name, email, role, department_id, departments(name)')
          .eq('email', credentials.email as string)
          .maybeSingle()
        if (!user) return null
        const deptRaw = user.departments
        const dept = Array.isArray(deptRaw)
          ? (deptRaw[0] as { name: string } | undefined)
          : (deptRaw as { name: string } | null)
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role as UserRole,
          departmentId: user.department_id ?? null,
          departmentName: dept?.name ?? null,
        }
      },
    })] : []),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // Dev credentials: already validated in authorize()
      if (account?.provider === 'dev-credentials') return true
      // Google: whitelist check
      if (account?.provider !== 'google') return false
      if (!user.email) return false
      const supabase = createServiceClient()
      const { data } = await supabase
        .from('users')
        .select('id')
        .eq('email', user.email)
        .maybeSingle()
      return !!data
    },

    async jwt({ token, account, user }) {
      if (account?.provider === 'google' && user?.email) {
        // Fetch DB user data on first Google sign-in
        const supabase = createServiceClient()
        const { data } = await supabase
          .from('users')
          .select('id, role, department_id, departments(name)')
          .eq('email', user.email)
          .maybeSingle()
        if (data) {
          token.sub = data.id
          token['role'] = data.role
          token['departmentId'] = data.department_id ?? null
          const deptRaw = data.departments
          const dept = Array.isArray(deptRaw)
            ? (deptRaw[0] as { name: string } | undefined)
            : (deptRaw as { name: string } | null)
          token['departmentName'] = dept?.name ?? null
        }
      } else if (account?.provider === 'dev-credentials' && user) {
        // Dev credentials: user object already has everything
        token.sub = user.id
        token['role'] = user.role!
        token['departmentId'] = user.departmentId ?? null
        token['departmentName'] = user.departmentName ?? null
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
