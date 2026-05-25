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

async function fetchDbUser(email: string): Promise<User | null> {
  const supabase = createServiceClient()
  const { data: user } = await supabase
    .from('users')
    .select('id, name, email, role, department_id, departments(name)')
    .eq('email', email)
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
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    // Email OTP login
    Credentials({
      id: 'otp-credentials',
      name: 'Email OTP',
      credentials: {
        email: { label: 'Email', type: 'email' },
        code:  { label: 'Code',  type: 'text'  },
      },
      async authorize(credentials): Promise<User | null> {
        if (!credentials?.email || !credentials?.code) return null
        const email = (credentials.email as string).toLowerCase().trim()
        const code  = (credentials.code  as string).trim()

        const supabase = createServiceClient()
        const now = new Date().toISOString()

        const { data: otp } = await supabase
          .from('otp_codes')
          .select('id, code')
          .eq('email', email)
          .eq('used', false)
          .gt('expires_at', now)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!otp || otp.code !== code) return null

        // Consume the OTP so it cannot be reused
        await supabase.from('otp_codes').update({ used: true }).eq('id', otp.id)

        return fetchDbUser(email)
      },
    }),

    // Dev-only bypass (no OTP needed)
    ...(isDev ? [Credentials({
      id: 'dev-credentials',
      name: 'Dev Login',
      credentials: { email: { label: 'Email', type: 'email' } },
      async authorize(credentials): Promise<User | null> {
        if (!credentials?.email) return null
        return fetchDbUser((credentials.email as string).toLowerCase().trim())
      },
    })] : []),
  ],

  callbacks: {
    async signIn({ account }) {
      return account?.provider === 'otp-credentials' || account?.provider === 'dev-credentials'
    },

    async jwt({ token, account, user }) {
      if (
        (account?.provider === 'otp-credentials' || account?.provider === 'dev-credentials')
        && user
      ) {
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

  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
})
