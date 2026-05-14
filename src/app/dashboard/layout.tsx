'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { signOut, useSession } from 'next-auth/react'
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
  { href: '/dashboard/criteria', label: 'Tiêu chí và hệ số',  icon: SlidersHorizontal, roles: ['super_admin','leadership','department'] },
  { href: '/dashboard/matrix',   label: 'Ma trận đánh giá',   icon: LayoutGrid,         roles: ['super_admin','leadership','department'] },
  { href: '/dashboard/evaluate', label: 'Đánh giá',           icon: ClipboardPen,       roles: ['super_admin','leadership','department'] },
  { href: '/dashboard/status',   label: 'Tình trạng',         icon: Activity,           roles: ['super_admin','leadership','department'] },
  { href: '/dashboard/results',  label: 'Dashboard',          icon: BarChart2,          roles: ['super_admin','leadership','department'] },
  { href: '/dashboard/results/detail', label: 'Kết quả chi tiết', icon: FileBarChart,   roles: ['super_admin','leadership'] },
  { href: '/dashboard/departments',    label: 'Phòng ban',          icon: Building2,      roles: ['super_admin'] },
  { href: '/dashboard/users',          label: 'Tài khoản',          icon: Users,          roles: ['super_admin'] },
  { href: '/dashboard/reports',        label: 'Báo cáo',            icon: Flag,           roles: ['super_admin'] },
  { href: '/dashboard/data-processing', label: 'Xử lí Dữ liệu',   icon: DatabaseZap,    roles: ['super_admin'] },
] as const

type Role = 'super_admin' | 'leadership' | 'department'

const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Quản trị viên',
  leadership:  'Ban lãnh đạo',
  department:  'Phòng ban',
}

const LOGO_URL = process.env.NEXT_PUBLIC_COMPANY_LOGO_URL ?? ''

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const { theme, toggle } = useTheme()

  const role = session?.user?.role as Role | undefined
  const visibleNav = NAV.filter((item) => !role || (item.roles as readonly string[]).includes(role))

  const currentNav = [...NAV].reverse().find((n) => pathname.startsWith(n.href))

  return (
    <div className="dash-root">
      {/* ── Sidebar ── */}
      <nav className="sidebar" aria-label="Điều hướng chính">
        {/* Brand */}
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

        {/* Nav items */}
        <ul className="nav-list" role="list">
          {visibleNav.map((item, i) => {
            const Icon = item.icon
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
                  <span className="nav-icon">
                    <Icon size={16} strokeWidth={1.75} />
                  </span>
                  <span className="nav-label">{item.label}</span>
                  {isActive && <ChevronRight size={12} className="nav-chevron" />}
                </Link>
              </li>
            )
          })}
        </ul>

        {/* Spacer */}
        <div className="sidebar-spacer" />

        <div className="sidebar-divider" />

        {/* User */}
        {session?.user && (
          <div className="sidebar-user">
            <div className="user-avatar" aria-hidden="true">
              {session.user.name?.charAt(0).toUpperCase() ?? '?'}
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

      {/* ── Main area ── */}
      <div className="main-area">
        {/* Top bar */}
        <header className="topbar">
          <div className="topbar-title">
            {currentNav && (
              <>
                <currentNav.icon size={15} strokeWidth={1.75} className="topbar-icon" />
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

        {/* Page content */}
        <main className="page-content">
          {children}
        </main>
      </div>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .dash-root {
          display: flex;
          height: 100dvh;
          background: #080808;
          overflow: hidden;
          font-family: var(--font-sans), sans-serif;
        }

        /* ══════════════════════════════════
           SIDEBAR
        ══════════════════════════════════ */
        .sidebar {
          width: 228px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          background: #0e0e0e;
          border-right: 1px solid rgba(255,255,255,0.06);
          height: 100dvh;
          overflow: hidden;
        }

        /* Brand */
        .sidebar-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 20px 16px 18px;
          flex-shrink: 0;
        }
        .brand-icon {
          flex-shrink: 0;
          filter: drop-shadow(0 0 8px rgba(179,0,0,0.5));
        }
        .brand-text {
          display: flex;
          flex-direction: column;
          line-height: 1;
        }
        .brand-name {
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.2em;
          color: #fff;
          text-transform: uppercase;
        }
        .brand-sub {
          font-size: 10px;
          letter-spacing: 0.12em;
          color: rgba(179,0,0,0.8);
          text-transform: uppercase;
          margin-top: 3px;
          font-style: italic;
        }

        .sidebar-divider {
          height: 1px;
          background: rgba(255,255,255,0.05);
          margin: 0 12px;
          flex-shrink: 0;
        }

        /* Nav list */
        .nav-list {
          list-style: none;
          padding: 8px 0;
          flex-shrink: 0;
        }
        .nav-item-wrap {
          animation: navSlideIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        @keyframes navSlideIn {
          from { opacity: 0; transform: translateX(-10px); }
          to   { opacity: 1; transform: translateX(0); }
        }

        .nav-item {
          position: relative;
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 9px 16px 9px 14px;
          margin: 1px 8px;
          border-radius: 8px;
          text-decoration: none;
          color: rgba(255,255,255,0.45);
          font-size: 12.5px;
          letter-spacing: 0.01em;
          transition: color 0.15s, background 0.15s;
          cursor: pointer;
        }
        .nav-item:hover {
          color: rgba(255,255,255,0.8);
          background: rgba(255,255,255,0.04);
        }
        .nav-item:focus-visible {
          outline: 2px solid rgba(179,0,0,0.5);
          outline-offset: 2px;
        }
        .nav-item--active {
          color: #fff;
          background: rgba(179,0,0,0.10);
        }
        .nav-item--active:hover {
          background: rgba(179,0,0,0.14);
        }

        .nav-accent {
          position: absolute;
          left: -8px;
          top: 50%;
          transform: translateY(-50%);
          width: 3px;
          height: 0;
          border-radius: 0 2px 2px 0;
          background: #B30000;
          transition: height 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
          box-shadow: 0 0 8px rgba(179,0,0,0.6);
        }
        .nav-item--active .nav-accent {
          height: 20px;
        }

        .nav-icon {
          display: flex;
          align-items: center;
          flex-shrink: 0;
          color: inherit;
          transition: color 0.15s;
        }
        .nav-item--active .nav-icon { color: #B30000; }

        .nav-label {
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 12.5px;
        }

        .nav-chevron {
          opacity: 0.4;
          flex-shrink: 0;
          color: #B30000;
        }

        .sidebar-spacer { flex: 1; }

        /* User */
        .sidebar-user {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 12px;
          flex-shrink: 0;
        }
        .user-avatar {
          width: 30px; height: 30px;
          border-radius: 8px;
          background: linear-gradient(135deg, #B30000, #7a0000);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 700;
          color: #fff;
          flex-shrink: 0;
          box-shadow: 0 2px 8px rgba(179,0,0,0.3);
          letter-spacing: 0;
        }
        .user-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .user-name {
          font-size: 12px;
          font-weight: 600;
          color: rgba(255,255,255,0.85);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          letter-spacing: 0.01em;
        }
        .user-role {
          font-size: 10px;
          color: rgba(179,0,0,0.8);
          letter-spacing: 0.06em;
          font-style: italic;
          margin-top: 1px;
        }
        .logout-btn {
          width: 28px; height: 28px;
          border-radius: 7px;
          border: 1px solid rgba(255,255,255,0.08);
          background: transparent;
          color: rgba(255,255,255,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
          transition: color 0.15s, border-color 0.15s, background 0.15s;
        }
        .logout-btn:hover {
          color: #ff4444;
          border-color: rgba(255,50,50,0.3);
          background: rgba(255,50,50,0.06);
        }
        .logout-btn:focus-visible {
          outline: 2px solid rgba(179,0,0,0.5);
          outline-offset: 2px;
        }

        /* ══════════════════════════════════
           MAIN AREA
        ══════════════════════════════════ */
        .main-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          min-width: 0;
        }

        /* Top bar */
        .topbar {
          height: 52px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 28px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          background: rgba(255,255,255,0.015);
          backdrop-filter: blur(8px);
        }
        .topbar-title {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .topbar-icon { color: #B30000; flex-shrink: 0; }
        .topbar-heading {
          font-size: 13.5px;
          font-weight: 400;
          color: rgba(255,255,255,0.75);
          letter-spacing: 0.01em;
          font-style: italic;
        }
        .topbar-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .period-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 20px;
          border: 1px solid rgba(179,0,0,0.2);
          background: rgba(179,0,0,0.06);
          font-size: 11px;
          color: rgba(255,255,255,0.5);
          letter-spacing: 0.05em;
          font-style: italic;
        }
        .theme-toggle {
          width: 30px; height: 30px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.08);
          background: transparent;
          color: rgba(255,255,255,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
          transition: color 0.15s, border-color 0.15s, background 0.15s;
        }
        .theme-toggle:hover {
          color: rgba(255,255,255,0.8);
          border-color: rgba(255,255,255,0.18);
          background: rgba(255,255,255,0.06);
        }
        .sidebar-logo {
          height: 38px;
          max-width: 188px;
          object-fit: contain;
        }
        .period-dot {
          width: 5px; height: 5px;
          border-radius: 50%;
          background: #B30000;
          box-shadow: 0 0 6px rgba(179,0,0,0.8);
          animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(0.85); }
        }

        /* Page content */
        .page-content {
          flex: 1;
          overflow-y: auto;
          padding: 28px;
          scrollbar-width: thin;
          scrollbar-color: rgba(179,0,0,0.2) transparent;
        }
        .page-content::-webkit-scrollbar { width: 4px; }
        .page-content::-webkit-scrollbar-track { background: transparent; }
        .page-content::-webkit-scrollbar-thumb {
          background: rgba(179,0,0,0.2);
          border-radius: 4px;
        }

        /* ── Light mode ───────────────────────────────── */
        [data-theme="light"] .dash-root { background: #f0f0f2; }
        [data-theme="light"] .sidebar { background: #fff; border-right-color: rgba(0,0,0,0.07); }
        [data-theme="light"] .sidebar-divider { background: rgba(0,0,0,0.07); }
        [data-theme="light"] .brand-name { color: #1a1a1a; }
        [data-theme="light"] .nav-item { color: rgba(0,0,0,0.45); }
        [data-theme="light"] .nav-item:hover { color: rgba(0,0,0,0.75); background: rgba(0,0,0,0.05); }
        [data-theme="light"] .nav-item--active { color: #1a1a1a; background: rgba(179,0,0,0.09); }
        [data-theme="light"] .nav-item--active:hover { background: rgba(179,0,0,0.13); }
        [data-theme="light"] .user-name { color: rgba(0,0,0,0.8); }
        [data-theme="light"] .logout-btn { border-color: rgba(0,0,0,0.1); color: rgba(0,0,0,0.35); background: transparent; }
        [data-theme="light"] .logout-btn:hover { color: #b30000; border-color: rgba(179,0,0,0.2); background: rgba(179,0,0,0.05); }
        [data-theme="light"] .topbar { background: rgba(255,255,255,0.9); border-bottom-color: rgba(0,0,0,0.07); }
        [data-theme="light"] .topbar-heading { color: rgba(0,0,0,0.6); }
        [data-theme="light"] .period-badge { border-color: rgba(179,0,0,0.2); background: rgba(179,0,0,0.05); color: rgba(0,0,0,0.45); }
        [data-theme="light"] .theme-toggle { border-color: rgba(0,0,0,0.1); color: rgba(0,0,0,0.4); background: transparent; }
        [data-theme="light"] .theme-toggle:hover { color: rgba(0,0,0,0.7); border-color: rgba(0,0,0,0.18); background: rgba(0,0,0,0.05); }
      `}</style>
    </div>
  )
}
