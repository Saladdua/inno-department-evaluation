import type { Metadata } from 'next'
import { Be_Vietnam_Pro } from 'next/font/google'
import { Providers } from '@/components/providers'
import './globals.css'

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ['vietnamese', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'INNO — Đánh giá Phòng ban',
  description: 'Hệ thống đánh giá nội bộ phòng ban INNO',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`h-full ${beVietnamPro.variable}`} data-theme="light" suppressHydrationWarning>
      <head>
        {/* Anti-flicker: apply saved theme before hydration to prevent flash */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light')}catch(e){}})()` }} />
      </head>
      <body className="min-h-full antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
