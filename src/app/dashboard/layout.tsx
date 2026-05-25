'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { signOut, useSession } from 'next-auth/react'
import { useEffect, useRef } from 'react'
import {
  SlidersHorizontal,
  LayoutGrid,
  ClipboardPen,
  Activity,
  BarChart2,
  FileBarChart,
  Users,
  Building2,
  DatabaseZap,
  LogOut,
  ChevronRight,
  Sun,
  Moon,
  Flag,
} from 'lucide-react'
import { useTheme } from '@/components/providers'
import NotificationBell from '@/components/NotificationBell'

const NAV = [
  { href: '/dashboard/criteria',       label: 'Tiêu chí và hệ số',  icon: SlidersHorizontal, roles: ['super_admin','leadership','department'] },
  { href: '/dashboard/matrix',         label: 'Ma trận đánh giá',   icon: LayoutGrid,         roles: ['super_admin','leadership','department'] },
  { href: '/dashboard/evaluate',       label: 'Đánh giá',           icon: ClipboardPen,       roles: ['super_admin','leadership','department'] },
  { href: '/dashboard/status',         label: 'Tình trạng',         icon: Activity,           roles: ['super_admin','leadership','department'] },
  { href: '/dashboard/results',        label: 'Dashboard',          icon: BarChart2,          roles: ['super_admin','leadership','department'] },
  { href: '/dashboard/results/detail', label: 'Kết quả chi tiết',   icon: FileBarChart,       roles: ['super_admin','leadership'] },
  { href: '/dashboard/departments',    label: 'Phòng ban',          icon: Building2,          roles: ['super_admin'] },
  { href: '/dashboard/users',          label: 'Tài khoản',          icon: Users,              roles: ['super_admin'] },
  { href: '/dashboard/reports',        label: 'Báo cáo',            icon: Flag,               roles: ['super_admin'] },
  { href: '/dashboard/data-processing',label: 'Xử lí Dữ liệu',     icon: DatabaseZap,        roles: ['super_admin'] },
] as const

type Role = 'super_admin' | 'leadership' | 'department'

const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Quản trị viên',
  leadership:  'Ban lãnh đạo',
  department:  'Phòng ban',
}

const LOGO_URL = process.env.NEXT_PUBLIC_COMPANY_LOGO_URL ?? ''

// ── Kinetic dot grid — follows mouse, no interaction required ────────────────
function useKineticGrid(ref: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    let W = window.innerWidth
    let H = window.innerHeight
    let mx = W / 2
    let my = H / 2
    canvas.width = W
    canvas.height = H

    const GAP     = 32    // grid spacing
    const RADIUS  = 120   // mouse influence radius
    const PUSH    = 24    // max displacement
    const LERP    = 0.10  // spring smoothness

    type Dot = { ox: number; oy: number; x: number; y: number }
    let grid: Dot[] = []

    function build() {
      grid = []
      const cols = Math.ceil(W / GAP) + 2
      const rows = Math.ceil(H / GAP) + 2
      for (let r = 0; r <= rows; r++)
        for (let c = 0; c <= cols; c++)
          grid.push({ ox: c * GAP, oy: r * GAP, x: c * GAP, y: r * GAP })
    }
    build()

    let raf: number
    function tick() {
      ctx.clearRect(0, 0, W, H)

      for (const d of grid) {
        const dx   = d.ox - mx
        const dy   = d.oy - my
        const dist = Math.sqrt(dx * dx + dy * dy)

        let tx = d.ox
        let ty = d.oy
        if (dist < RADIUS && dist > 0) {
          const str = (1 - dist / RADIUS) * PUSH
          tx = d.ox + (dx / dist) * str
          ty = d.oy + (dy / dist) * str
        }

        d.x += (tx - d.x) * LERP
        d.y += (ty - d.y) * LERP

        const cdx   = d.x - mx
        const cdy   = d.y - my
        const cdist = Math.sqrt(cdx * cdx + cdy * cdy)
        const prox  = Math.max(0, 1 - cdist / RADIUS)

        const alpha = 0.07 + prox * 0.38
        const r     = 1.1  + prox * 1.6

        ctx.beginPath()
        ctx.arc(d.x, d.y, r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(179,0,0,${alpha.toFixed(3)})`
        ctx.fill()
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const onMove   = (e: MouseEvent) => { mx = e.clientX; my = e.clientY }
    const onResize = () => {
      W = window.innerWidth; H = window.innerHeight
      canvas.width = W; canvas.height = H
      build()
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('resize', onResize)
    }
  }, [ref])
}

// ── Floating red particles ───────────────────────────────────────────────────
function useParticles(ref: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    let W = window.innerWidth
    let H = window.innerHeight
    canvas.width = W
    canvas.height = H

    type P = { x: number; y: number; r: number; vx: number; vy: number; alpha: number; glowR: number }
    const ps: P[] = Array.from({ length: 42 }, () => ({
      x:     Math.random() * W,
      y:     Math.random() * H,
      r:     Math.random() * 1.4 + 0.4,
      vx:    (Math.random() - 0.5) * 0.25,
      vy:    -(Math.random() * 0.42 + 0.12),
      alpha: Math.random() * 0.28 + 0.12,
      glowR: 0,
    }))
    // mix in a few larger ones
    for (let i = 0; i < 5; i++) {
      ps[i].r     = Math.random() * 2.2 + 1.4
      ps[i].alpha = Math.random() * 0.22 + 0.28
    }

    let raf: number
    function tick() {
      ctx.clearRect(0, 0, W, H)
      for (const p of ps) {
        p.glowR = p.r * 4

        // glow halo
        const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.glowR)
        grd.addColorStop(0,   `rgba(220,30,30,${(p.alpha * 0.35).toFixed(3)})`)
        grd.addColorStop(0.5, `rgba(179,0,0,${(p.alpha * 0.10).toFixed(3)})`)
        grd.addColorStop(1,   'rgba(179,0,0,0)')
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.glowR, 0, Math.PI * 2)
        ctx.fillStyle = grd
        ctx.fill()

        // solid core
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,80,80,${p.alpha.toFixed(3)})`
        ctx.fill()

        p.x += p.vx
        p.y += p.vy
        if (p.y < -p.glowR) { p.y = H + p.glowR; p.x = Math.random() * W }
        if (p.x < -p.glowR) p.x = W + p.glowR
        if (p.x > W + p.glowR) p.x = -p.glowR
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const onResize = () => {
      W = window.innerWidth; H = window.innerHeight
      canvas.width = W; canvas.height = H
    }
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [ref])
}

// ── Layout ───────────────────────────────────────────────────────────────────
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const { theme, toggle } = useTheme()

  const gridRef     = useRef<HTMLCanvasElement>(null)
  const particleRef = useRef<HTMLCanvasElement>(null)

  useKineticGrid(gridRef)
  useParticles(particleRef)

  const role       = session?.user?.role as Role | undefined
  const visibleNav = NAV.filter((item) => !role || (item.roles as readonly string[]).includes(role))
  const currentNav = [...NAV].reverse().find((n) => pathname.startsWith(n.href))
  const initial    = session?.user?.name?.charAt(0).toUpperCase() ?? '?'

  return (
    <div className="dash-root">
      {/* ── Canvas layers (behind everything) ── */}
      <canvas ref={gridRef}     className="cv-grid"     aria-hidden="true" />
      <canvas ref={particleRef} className="cv-particles" aria-hidden="true" />

      {/* ── Sidebar ── */}
      <nav className="sidebar" aria-label="Điều hướng chính">
        <div className="sidebar-brand">
          {LOGO_URL ? (
            <img src={LOGO_URL} alt="Logo" className="sidebar-logo" />
          ) : (
            <>
              <div className="brand-icon">
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <rect width="22" height="22" rx="6" fill="#B30000"/>
                  <path d="M6 11h10M11 6v10" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="brand-text">
                <span className="brand-name">INNO</span>
                <span className="brand-sub">Evaluate</span>
              </div>
            </>
          )}
        </div>

        <div className="sidebar-divider" />

        <ul className="nav-list" role="list">
          {visibleNav.map((item, i) => {
            const Icon    = item.icon
            const isActive = pathname.startsWith(item.href) &&
              (item.href !== '/dashboard/results' || pathname === '/dashboard/results')
            return (
              <li key={item.href} style={{ animationDelay: `${i * 40}ms` }} className="nav-item-wrap">
                <Link
                  href={item.href}
                  className={`nav-item ${isActive ? 'nav-item--active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="nav-accent" aria-hidden="true" />
                  <span className="nav-icon"><Icon size={16} strokeWidth={1.75} /></span>
                  <span className="nav-label">{item.label}</span>
                  {isActive && <ChevronRight size={12} className="nav-chevron" />}
                </Link>
              </li>
            )
          })}
        </ul>

        <div className="sidebar-spacer" />
        <div className="sidebar-divider" />

        {/* ── User ── */}
        {session?.user && (
          <div className="sidebar-user">
            <div className="user-avatar" aria-hidden="true">
              {initial}
            </div>
            <div className="user-info">
              <span className="user-name">{session.user.name}</span>
              <span className="user-role">{role ? ROLE_LABELS[role] : ''}</span>
            </div>
            <button
              className="logout-btn"
              onClick={() => signOut({ callbackUrl: '/login' })}
              aria-label="Đăng xuất"
              title="Đăng xuất"
            >
              <LogOut size={14} strokeWidth={1.75} />
            </button>
          </div>
        )}
      </nav>

      {/* ── Main ── */}
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-title">
            {currentNav && (
              <>
                <currentNav.icon size={18} strokeWidth={1.75} className="topbar-icon" />
                <h1 className="topbar-heading">{currentNav.label}</h1>
              </>
            )}
          </div>
          <div className="topbar-right">
            <NotificationBell deptId={session?.user?.departmentId ?? null} role={role} />
            <button
              className="theme-toggle"
              onClick={toggle}
              aria-label={theme === 'light' ? 'Chuyển sang tối' : 'Chuyển sang sáng'}
              title={theme === 'light' ? 'Chuyển sang tối' : 'Chuyển sang sáng'}
            >
              {theme === 'light'
                ? <Moon size={14} strokeWidth={1.75} />
                : <Sun  size={14} strokeWidth={1.75} />}
            </button>
          </div>
        </header>

        <main className="page-content">{children}</main>
      </div>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        /* ── Canvas overlays ── */
        .cv-grid, .cv-particles {
          position: fixed; inset: 0;
          width: 100vw; height: 100vh;
          pointer-events: none;
          z-index: 0;
        }
        .cv-grid      { opacity: 1; }
        .cv-particles { opacity: 1; }

        /* ── Root ── */
        .dash-root {
          display: flex;
          height: 100dvh;
          background: #080808;
          overflow: hidden;
          font-family: var(--font-sans), sans-serif;
          position: relative;
        }

        /* ══════════════════════════════════
           SIDEBAR
        ══════════════════════════════════ */
        .sidebar {
          width: 228px; flex-shrink: 0;
          display: flex; flex-direction: column;
          background: #0e0e0e;
          border-right: 1px solid rgba(255,255,255,0.06);
          height: 100dvh; overflow: hidden;
          position: relative; z-index: 10;
        }
        .sidebar-brand {
          display: flex; align-items: center; gap: 10px;
          padding: 20px 16px 18px; flex-shrink: 0;
        }
        .brand-icon { flex-shrink: 0; filter: drop-shadow(0 0 8px rgba(179,0,0,0.5)); }
        .brand-text { display: flex; flex-direction: column; line-height: 1; }
        .brand-name { font-size: 13px; font-weight: 700; letter-spacing: 0.2em; color: #fff; text-transform: uppercase; }
        .brand-sub  { font-size: 10px; letter-spacing: 0.12em; color: rgba(179,0,0,0.8); text-transform: uppercase; margin-top: 3px; font-style: italic; }
        .sidebar-divider { height: 1px; background: rgba(255,255,255,0.05); margin: 0 12px; flex-shrink: 0; }

        /* Nav */
        .nav-list { list-style: none; padding: 8px 0; flex-shrink: 0; }
        .nav-item-wrap { animation: navSlideIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both; }
        @keyframes navSlideIn {
          from { opacity: 0; transform: translateX(-10px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .nav-item {
          position: relative; display: flex; align-items: center; gap: 9px;
          padding: 9px 16px 9px 14px; margin: 1px 8px; border-radius: 8px;
          text-decoration: none; color: rgba(255,255,255,0.45); font-size: 12.5px;
          letter-spacing: 0.01em; transition: color 0.15s, background 0.15s; cursor: pointer;
        }
        .nav-item:hover { color: rgba(255,255,255,0.8); background: rgba(255,255,255,0.04); }
        .nav-item:focus-visible { outline: 2px solid rgba(179,0,0,0.5); outline-offset: 2px; }
        .nav-item--active { color: #fff; background: rgba(179,0,0,0.10); }
        .nav-item--active:hover { background: rgba(179,0,0,0.14); }
        .nav-accent {
          position: absolute; left: -8px; top: 50%; transform: translateY(-50%);
          width: 3px; height: 0; border-radius: 0 2px 2px 0; background: #B30000;
          transition: height 0.2s cubic-bezier(0.34,1.56,0.64,1);
          box-shadow: 0 0 8px rgba(179,0,0,0.6);
        }
        .nav-item--active .nav-accent { height: 20px; }
        .nav-icon { display: flex; align-items: center; flex-shrink: 0; color: inherit; transition: color 0.15s; }
        .nav-item--active .nav-icon { color: #B30000; }
        .nav-label { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12.5px; }
        .nav-chevron { opacity: 0.4; flex-shrink: 0; color: #B30000; }
        .sidebar-spacer { flex: 1; }

        /* ── Avatar ── */
        .sidebar-user {
          display: flex; align-items: center; gap: 10px;
          padding: 14px 12px; flex-shrink: 0;
        }
        .user-avatar {
          width: 32px; height: 32px;
          border-radius: 8px;
          background: #1c0000;
          border: 1.5px solid rgba(179,0,0,0.5);
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.88);
          flex-shrink: 0; letter-spacing: 0;
          transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
        }
        .sidebar-user:hover .user-avatar {
          border-color: #B30000;
          background: #260000;
          box-shadow: 0 0 10px rgba(179,0,0,0.25);
        }

        .user-info { flex: 1; display: flex; flex-direction: column; min-width: 0; }
        .user-name {
          font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.85);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: 0.01em;
        }
        .user-role { font-size: 10px; color: rgba(179,0,0,0.8); letter-spacing: 0.06em; font-style: italic; margin-top: 1px; }
        .logout-btn {
          width: 28px; height: 28px; border-radius: 7px;
          border: 1px solid rgba(255,255,255,0.08); background: transparent;
          color: rgba(255,255,255,0.3); display: flex; align-items: center;
          justify-content: center; cursor: pointer; flex-shrink: 0;
          transition: color 0.15s, border-color 0.15s, background 0.15s;
        }
        .logout-btn:hover { color: #ff4444; border-color: rgba(255,50,50,0.3); background: rgba(255,50,50,0.06); }
        .logout-btn:focus-visible { outline: 2px solid rgba(179,0,0,0.5); outline-offset: 2px; }

        /* ══════════════════════════════════
           MAIN AREA
        ══════════════════════════════════ */
        .main-area {
          flex: 1; display: flex; flex-direction: column;
          overflow: hidden; min-width: 0;
          position: relative; z-index: 10;
        }
        .topbar {
          height: 62px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 28px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          background: rgba(255,255,255,0.015);
          backdrop-filter: blur(8px);
        }
        .topbar-title { display: flex; align-items: center; gap: 10px; }
        .topbar-icon { color: #B30000; flex-shrink: 0; }
        .topbar-heading { font-size: 17px; font-weight: 600; color: rgba(255,255,255,0.88); letter-spacing: 0.01em; }
        .topbar-right { display: flex; align-items: center; gap: 12px; }
        .theme-toggle {
          width: 30px; height: 30px; border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.08); background: transparent;
          color: rgba(255,255,255,0.4); display: flex; align-items: center;
          justify-content: center; cursor: pointer; flex-shrink: 0;
          transition: color 0.15s, border-color 0.15s, background 0.15s;
        }
        .theme-toggle:hover { color: rgba(255,255,255,0.8); border-color: rgba(255,255,255,0.18); background: rgba(255,255,255,0.06); }
        .sidebar-logo { height: 38px; max-width: 188px; object-fit: contain; }
        .page-content {
          flex: 1; overflow-y: auto; padding: 28px;
          scrollbar-width: thin; scrollbar-color: rgba(179,0,0,0.2) transparent;
        }
        .page-content::-webkit-scrollbar { width: 4px; }
        .page-content::-webkit-scrollbar-track { background: transparent; }
        .page-content::-webkit-scrollbar-thumb { background: rgba(179,0,0,0.2); border-radius: 4px; }

        /* ── Light mode ── */
        [data-theme="light"] .dash-root    { background: #f0f0f2; }
        [data-theme="light"] .sidebar      { background: #fff; border-right-color: rgba(0,0,0,0.07); }
        [data-theme="light"] .sidebar-divider { background: rgba(0,0,0,0.07); }
        [data-theme="light"] .brand-name   { color: #1a1a1a; }
        [data-theme="light"] .nav-item     { color: rgba(0,0,0,0.45); }
        [data-theme="light"] .nav-item:hover { color: rgba(0,0,0,0.75); background: rgba(0,0,0,0.05); }
        [data-theme="light"] .nav-item--active { color: #1a1a1a; background: rgba(179,0,0,0.09); }
        [data-theme="light"] .nav-item--active:hover { background: rgba(179,0,0,0.13); }
        [data-theme="light"] .user-avatar  { background: #fff0f0; border-color: rgba(179,0,0,0.4); color: #7a0000; }
        [data-theme="light"] .sidebar-user:hover .user-avatar { background: #ffe5e5; border-color: #B30000; box-shadow: 0 0 10px rgba(179,0,0,0.12); }
        [data-theme="light"] .user-name    { color: rgba(0,0,0,0.8); }
        [data-theme="light"] .logout-btn   { border-color: rgba(0,0,0,0.1); color: rgba(0,0,0,0.35); }
        [data-theme="light"] .logout-btn:hover { color: #b30000; border-color: rgba(179,0,0,0.2); background: rgba(179,0,0,0.05); }
        [data-theme="light"] .topbar       { background: rgba(255,255,255,0.9); border-bottom-color: rgba(0,0,0,0.07); }
        [data-theme="light"] .topbar-heading { color: rgba(0,0,0,0.8); }
        [data-theme="light"] .theme-toggle { border-color: rgba(0,0,0,0.1); color: rgba(0,0,0,0.4); }
        [data-theme="light"] .theme-toggle:hover { color: rgba(0,0,0,0.7); border-color: rgba(0,0,0,0.18); background: rgba(0,0,0,0.05); }
        [data-theme="light"] .cv-grid      { opacity: 0.35; }
        [data-theme="light"] .cv-particles { opacity: 0.4; }
      `}</style>
    </div>
  )
}
