'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, Pencil, Trash2, X, Eye, EyeOff, Search, RefreshCw } from 'lucide-react'

export interface Department {
  id: string
  name: string
  code: string | null
}

export interface AppUser {
  id: string
  name: string
  email: string
  role: 'super_admin' | 'leadership' | 'department' | 'marketing'
  department_id: string | null
  departments: { id: string; name: string; code: string | null } | null
}

const ROLE_LABEL: Record<AppUser['role'], string> = {
  super_admin: 'Quản trị viên',
  leadership:  'Ban lãnh đạo',
  department:  'Phòng ban',
  marketing:   'Marketing',
}

type ModalMode = 'add' | 'edit'

interface FormState {
  name: string
  email: string
  password: string
  role: AppUser['role']
  department_id: string
}

const EMPTY_FORM: FormState = { name: '', email: '', password: '', role: 'department', department_id: '' }

function UserModal({
  mode,
  user,
  departments,
  onClose,
  onSaved,
}: {
  mode: ModalMode
  user: AppUser | null
  departments: Department[]
  onClose: () => void
  onSaved: (u: AppUser) => void
}) {
  const [form, setForm] = useState<FormState>(() =>
    mode === 'edit' && user
      ? { name: user.name, email: user.email, password: '', role: user.role, department_id: user.department_id ?? '' }
      : EMPTY_FORM
  )
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function set(key: keyof FormState, val: string) {
    setForm(f => ({ ...f, [key]: val }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.name.trim() || !form.email.trim()) {
      setError('Họ tên và email là bắt buộc.')
      return
    }
    if (mode === 'add' && !form.password) {
      setError('Mật khẩu là bắt buộc khi tạo tài khoản.')
      return
    }
    startTransition(async () => {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        role: form.role,
        department_id: form.department_id || null,
      }
      if (form.password) body.password = form.password
      if (mode === 'edit' && user) body.id = user.id

      const res = await fetch('/api/users', {
        method: mode === 'add' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Lỗi không xác định'); return }
      onSaved(json as AppUser)
      onClose()
    })
  }

  const needsDept = form.role !== 'super_admin' && form.role !== 'marketing'

  return (
    <div className="um-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="um-modal" role="dialog" aria-modal="true">
        <div className="um-header">
          <span className="um-title">{mode === 'add' ? 'Thêm tài khoản' : 'Chỉnh sửa tài khoản'}</span>
          <button className="um-close" onClick={onClose} aria-label="Đóng"><X size={15} /></button>
        </div>

        <form className="um-form" onSubmit={handleSubmit} noValidate>
          <div className="um-field">
            <label className="um-label">Họ và tên <span className="um-req">*</span></label>
            <input
              className="um-input"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Nguyễn Văn A"
              autoFocus
            />
          </div>

          <div className="um-field">
            <label className="um-label">Email <span className="um-req">*</span></label>
            <input
              className="um-input"
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              placeholder="email@innojsc.com"
            />
          </div>

          <div className="um-field">
            <label className="um-label">
              Mật khẩu {mode === 'edit' && <span className="um-hint">(để trống = giữ nguyên)</span>}
              {mode === 'add' && <span className="um-req"> *</span>}
            </label>
            <div className="um-pwd-wrap">
              <input
                className="um-input um-input--pwd"
                type={showPwd ? 'text' : 'password'}
                value={form.password}
                onChange={e => set('password', e.target.value)}
                placeholder={mode === 'edit' ? '••••••••' : 'Nhập mật khẩu'}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="um-pwd-toggle"
                onClick={() => setShowPwd(v => !v)}
                tabIndex={-1}
                aria-label={showPwd ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div className="um-row">
            <div className="um-field">
              <label className="um-label">Vai trò <span className="um-req">*</span></label>
              <select className="um-input" value={form.role} onChange={e => set('role', e.target.value as AppUser['role'])}>
                <option value="department">Phòng ban</option>
                <option value="leadership">Ban lãnh đạo</option>
                <option value="marketing">Marketing</option>
                <option value="super_admin">Quản trị viên</option>
              </select>
            </div>

            {needsDept && (
              <div className="um-field">
                <label className="um-label">Phòng ban</label>
                <select
                  className="um-input"
                  value={form.department_id}
                  onChange={e => set('department_id', e.target.value)}
                >
                  <option value="">— Không có —</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}{d.code ? ` (${d.code})` : ''}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {error && <div className="um-error">{error}</div>}

          <div className="um-actions">
            <button type="button" className="um-btn um-btn--ghost" onClick={onClose} disabled={isPending}>
              Hủy
            </button>
            <button type="submit" className="um-btn um-btn--primary" disabled={isPending}>
              {isPending ? 'Đang lưu…' : mode === 'add' ? 'Tạo tài khoản' : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function UsersClient({
  initialUsers,
  departments,
}: {
  initialUsers: AppUser[]
  departments: Department[]
}) {
  const router = useRouter()
  const [users, setUsers] = useState(initialUsers)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<AppUser['role'] | 'all'>('all')
  const [modal, setModal] = useState<{ mode: ModalMode; user: AppUser | null } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter(u => {
      const matchRole = roleFilter === 'all' || u.role === roleFilter
      const matchSearch = !q ||
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.departments?.name ?? '').toLowerCase().includes(q) ||
        (u.departments?.code ?? '').toLowerCase().includes(q)
      return matchRole && matchSearch
    })
  }, [users, search, roleFilter])

  const counts = useMemo(() => ({
    total: users.length,
    super_admin: users.filter(u => u.role === 'super_admin').length,
    leadership:  users.filter(u => u.role === 'leadership').length,
    department:  users.filter(u => u.role === 'department').length,
    marketing:   users.filter(u => u.role === 'marketing').length,
  }), [users])

  function handleSaved(saved: AppUser) {
    setUsers(prev => {
      const idx = prev.findIndex(u => u.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = saved
        return next.sort((a, b) => a.name.localeCompare(b.name))
      }
      return [...prev, saved].sort((a, b) => a.name.localeCompare(b.name))
    })
  }

  function handleDelete(u: AppUser) {
    if (!window.confirm(`Xóa tài khoản "${u.name}" (${u.email})?\n\nHành động này không thể hoàn tác.`)) return
    setDeletingId(u.id)
    startTransition(async () => {
      const res = await fetch(`/api/users?id=${u.id}`, { method: 'DELETE' })
      if (res.ok) {
        setUsers(prev => prev.filter(x => x.id !== u.id))
      } else {
        const json = await res.json()
        alert(json.error ?? 'Xóa thất bại')
      }
      setDeletingId(null)
    })
  }

  function handleSync() {
    startTransition(async () => {
      const res = await fetch('/api/users/sync', { method: 'POST' })
      if (res.ok) router.refresh()
      else {
        const json = await res.json()
        alert(json.error ?? 'Đồng bộ thất bại')
      }
    })
  }

  return (
    <>
    <div className="ua-root">

      {/* ── Stat cards ── */}
      <div className="ua-cards">
        <button
          className={`ua-card ${roleFilter === 'all' ? 'ua-card--active' : ''}`}
          onClick={() => setRoleFilter('all')}
        >
          <span className="ua-card-val">{counts.total}</span>
          <span className="ua-card-lbl">Tất cả</span>
        </button>
        <button
          className={`ua-card ua-card--red ${roleFilter === 'super_admin' ? 'ua-card--active' : ''}`}
          onClick={() => setRoleFilter('super_admin')}
        >
          <span className="ua-card-val">{counts.super_admin}</span>
          <span className="ua-card-lbl">Quản trị viên</span>
        </button>
        <button
          className={`ua-card ua-card--amber ${roleFilter === 'leadership' ? 'ua-card--active' : ''}`}
          onClick={() => setRoleFilter('leadership')}
        >
          <span className="ua-card-val">{counts.leadership}</span>
          <span className="ua-card-lbl">Ban lãnh đạo</span>
        </button>
        <button
          className={`ua-card ua-card--blue ${roleFilter === 'department' ? 'ua-card--active' : ''}`}
          onClick={() => setRoleFilter('department')}
        >
          <span className="ua-card-val">{counts.department}</span>
          <span className="ua-card-lbl">Phòng ban</span>
        </button>
        <button
          className={`ua-card ua-card--violet ${roleFilter === 'marketing' ? 'ua-card--active' : ''}`}
          onClick={() => setRoleFilter('marketing')}
        >
          <span className="ua-card-val">{counts.marketing}</span>
          <span className="ua-card-lbl">Marketing</span>
        </button>
      </div>

      {/* ── Toolbar ── */}
      <div className="ua-toolbar">
        <div className="ua-search-wrap">
          <Search size={13} className="ua-search-icon" />
          <input
            className="ua-search"
            placeholder="Tìm theo tên, email, phòng ban…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="ua-search-clear" onClick={() => setSearch('')} aria-label="Xóa tìm kiếm">
              <X size={12} />
            </button>
          )}
        </div>

        <div className="ua-toolbar-right">
          <button className="ua-btn ua-btn--ghost" onClick={handleSync} disabled={isPending} title="Đồng bộ từ Google Sheet">
            <RefreshCw size={13} className={isPending ? 'ua-spin' : ''} />
            Đồng bộ
          </button>
          <button className="ua-btn ua-btn--primary" onClick={() => setModal({ mode: 'add', user: null })}>
            <UserPlus size={13} />
            Thêm tài khoản
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="ua-table-wrap">
        <table className="ua-table">
          <thead>
            <tr>
              <th className="ua-th">#</th>
              <th className="ua-th">Tên / Email</th>
              <th className="ua-th">Vai trò</th>
              <th className="ua-th">Phòng ban</th>
              <th className="ua-th ua-th--actions">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="ua-empty">
                  {search || roleFilter !== 'all' ? 'Không tìm thấy tài khoản phù hợp.' : 'Chưa có tài khoản nào.'}
                </td>
              </tr>
            ) : (
              filtered.map((u, i) => (
                <tr key={u.id} className="ua-tr">
                  <td className="ua-td ua-td--num">{i + 1}</td>
                  <td className="ua-td">
                    <div className="ua-user-cell">
                      <div className="ua-avatar" data-role={u.role}>
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="ua-user-info">
                        <span className="ua-user-name">{u.name}</span>
                        <span className="ua-user-email">{u.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="ua-td">
                    <span className={`ua-role-badge ua-role-badge--${u.role}`}>
                      {ROLE_LABEL[u.role]}
                    </span>
                  </td>
                  <td className="ua-td ua-td--dept">
                    {u.departments
                      ? <span className="ua-dept">{u.departments.code ?? u.departments.name}</span>
                      : <span className="ua-dept-none">—</span>}
                  </td>
                  <td className="ua-td ua-td--actions">
                    <button
                      className="ua-action-btn ua-action-btn--edit"
                      onClick={() => setModal({ mode: 'edit', user: u })}
                      title="Chỉnh sửa"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      className="ua-action-btn ua-action-btn--delete"
                      onClick={() => handleDelete(u)}
                      disabled={deletingId === u.id || isPending}
                      title="Xóa"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <p className="ua-count">
          Hiển thị {filtered.length} / {users.length} tài khoản
        </p>
      )}

      <style>{`
        .ua-root {
          display: flex; flex-direction: column; gap: 16px;
          font-family: var(--font-sans), sans-serif;
          animation: uaFade 0.3s ease both;
        }
        @keyframes uaFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes uaSpin { to { transform: rotate(360deg); } }
        .ua-spin { animation: uaSpin 0.8s linear infinite; }

        /* ── Cards ── */
        .ua-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        .ua-card {
          display: flex; flex-direction: column; gap: 4px;
          padding: 14px 16px; border-radius: 12px;
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06);
          cursor: pointer; text-align: left; font-family: inherit;
          transition: border-color 0.15s, background 0.15s;
        }
        .ua-card:hover { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.12); }
        .ua-card--active { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.18); }
        .ua-card--red { }
        .ua-card--red.ua-card--active { background: rgba(179,0,0,0.06); border-color: rgba(179,0,0,0.25); }
        .ua-card--amber.ua-card--active { background: rgba(251,191,36,0.06); border-color: rgba(251,191,36,0.25); }
        .ua-card--blue.ua-card--active { background: rgba(99,179,237,0.06); border-color: rgba(99,179,237,0.25); }
        .ua-card--violet.ua-card--active { background: rgba(124,58,237,0.06); border-color: rgba(124,58,237,0.25); }
        .ua-card-val { font-size: 28px; font-weight: 300; letter-spacing: -0.03em; color: rgba(255,255,255,0.85); line-height: 1; }
        .ua-card--red    .ua-card-val { color: #f87171; }
        .ua-card--amber  .ua-card-val { color: #fbbf24; }
        .ua-card--blue   .ua-card-val { color: #63b3ed; }
        .ua-card--violet .ua-card-val { color: #a78bfa; }
        .ua-card-lbl { font-size: 10px; font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase; color: rgba(255,255,255,0.25); }

        /* ── Toolbar ── */
        .ua-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .ua-toolbar-right { display: flex; align-items: center; gap: 8px; }

        .ua-search-wrap { position: relative; display: flex; align-items: center; flex: 1; max-width: 380px; }
        .ua-search-icon { position: absolute; left: 10px; color: rgba(255,255,255,0.25); pointer-events: none; }
        .ua-search {
          width: 100%; padding: 7px 32px 7px 30px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px; font-size: 12.5px; color: rgba(255,255,255,0.75);
          font-family: inherit; outline: none;
          transition: border-color 0.15s;
        }
        .ua-search::placeholder { color: rgba(255,255,255,0.2); }
        .ua-search:focus { border-color: rgba(179,0,0,0.4); }
        .ua-search-clear {
          position: absolute; right: 8px;
          background: none; border: none; cursor: pointer;
          color: rgba(255,255,255,0.25); display: flex; align-items: center;
          padding: 2px; border-radius: 4px; transition: color 0.1s;
        }
        .ua-search-clear:hover { color: rgba(255,255,255,0.5); }

        .ua-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 14px; border-radius: 8px; border: 1px solid transparent;
          font-size: 12px; font-family: inherit; font-weight: 500; letter-spacing: 0.02em;
          cursor: pointer; white-space: nowrap;
          transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.1s;
        }
        .ua-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .ua-btn--primary {
          background: #B30000; color: #fff; border-color: transparent;
          box-shadow: 0 3px 12px rgba(179,0,0,0.3);
        }
        .ua-btn--primary:hover:not(:disabled) { background: #cc0000; transform: translateY(-1px); box-shadow: 0 5px 18px rgba(179,0,0,0.45); }
        .ua-btn--ghost {
          background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.55);
          border-color: rgba(255,255,255,0.08);
        }
        .ua-btn--ghost:hover:not(:disabled) { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.8); border-color: rgba(255,255,255,0.15); }

        /* ── Table ── */
        .ua-table-wrap {
          border-radius: 12px; border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.015); overflow: hidden;
        }
        .ua-table { width: 100%; border-collapse: collapse; }
        .ua-th {
          padding: 10px 16px; text-align: left;
          font-size: 10px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase;
          color: rgba(255,255,255,0.25); border-bottom: 1px solid rgba(255,255,255,0.06);
          white-space: nowrap; position: sticky; top: 0; background: #111; z-index: 1;
        }
        .ua-th--actions { text-align: right; }
        .ua-tr { border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.1s; }
        .ua-tr:hover { background: rgba(255,255,255,0.025); }
        .ua-tr:last-child { border-bottom: none; }
        .ua-td { padding: 11px 16px; vertical-align: middle; }
        .ua-td--num { width: 40px; font-size: 11px; color: rgba(255,255,255,0.2); text-align: center; }
        .ua-td--actions { text-align: right; white-space: nowrap; }
        .ua-td--dept { white-space: nowrap; }

        .ua-user-cell { display: flex; align-items: center; gap: 10px; }
        .ua-avatar {
          width: 32px; height: 32px; border-radius: 9px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 700; color: #fff; letter-spacing: 0;
          background: rgba(255,255,255,0.08);
        }
        .ua-avatar[data-role="super_admin"] { background: linear-gradient(135deg, #B30000, #7a0000); box-shadow: 0 2px 8px rgba(179,0,0,0.35); }
        .ua-avatar[data-role="leadership"]  { background: linear-gradient(135deg, #b88a00, #7a5c00); box-shadow: 0 2px 8px rgba(184,138,0,0.3); }
        .ua-avatar[data-role="department"]  { background: linear-gradient(135deg, #1e6fa8, #124b74); box-shadow: 0 2px 8px rgba(30,111,168,0.3); }
        .ua-avatar[data-role="marketing"]   { background: linear-gradient(135deg, #7c3aed, #4c1d95); box-shadow: 0 2px 8px rgba(124,58,237,0.3); }
        .ua-user-info { display: flex; flex-direction: column; min-width: 0; }
        .ua-user-name { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ua-user-email { font-size: 11px; color: rgba(255,255,255,0.3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }

        .ua-role-badge {
          display: inline-flex; align-items: center;
          padding: 3px 9px; border-radius: 20px; font-size: 11px; font-weight: 500; white-space: nowrap;
          border: 1px solid transparent;
        }
        .ua-role-badge--super_admin { background: rgba(179,0,0,0.12); color: #f87171; border-color: rgba(179,0,0,0.25); }
        .ua-role-badge--leadership  { background: rgba(251,191,36,0.10); color: #fbbf24; border-color: rgba(251,191,36,0.22); }
        .ua-role-badge--department  { background: rgba(99,179,237,0.08); color: #63b3ed; border-color: rgba(99,179,237,0.18); }
        .ua-role-badge--marketing   { background: rgba(124,58,237,0.10); color: #a78bfa; border-color: rgba(124,58,237,0.22); }

        .ua-dept { font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.45); letter-spacing: 0.04em; }
        .ua-dept-none { color: rgba(255,255,255,0.15); font-size: 12px; }

        .ua-action-btn {
          display: inline-flex; align-items: center; justify-content: center;
          width: 28px; height: 28px; border-radius: 7px; border: 1px solid transparent;
          background: transparent; cursor: pointer;
          transition: background 0.15s, border-color 0.15s, color 0.15s;
        }
        .ua-action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .ua-action-btn--edit { color: rgba(255,255,255,0.3); border-color: rgba(255,255,255,0.06); }
        .ua-action-btn--edit:hover:not(:disabled) { color: rgba(255,255,255,0.8); background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.12); }
        .ua-action-btn--delete { color: rgba(255,100,100,0.4); border-color: rgba(255,100,100,0.08); margin-left: 4px; }
        .ua-action-btn--delete:hover:not(:disabled) { color: #f87171; background: rgba(248,113,113,0.08); border-color: rgba(248,113,113,0.2); }

        .ua-empty { padding: 40px; text-align: center; color: rgba(255,255,255,0.2); font-size: 13px; font-style: italic; }
        .ua-count { font-size: 11px; color: rgba(255,255,255,0.2); font-style: italic; text-align: right; margin-top: -4px; }

        /* ── Modal ── */
        .um-overlay {
          position: fixed; inset: 0; z-index: 100;
          background: rgba(0,0,0,0.65); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          padding: 20px;
          animation: umFade 0.2s ease both;
        }
        @keyframes umFade { from { opacity: 0; } to { opacity: 1; } }
        .um-modal {
          width: 100%; max-width: 440px;
          background: #141414; border: 1px solid rgba(255,255,255,0.1);
          border-radius: 16px; overflow: hidden;
          box-shadow: 0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04);
          animation: umSlide 0.25s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        @keyframes umSlide { from { transform: translateY(12px) scale(0.98); opacity: 0; } to { transform: none; opacity: 1; } }
        .um-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.07);
        }
        .um-title { font-size: 13.5px; font-weight: 600; color: rgba(255,255,255,0.85); letter-spacing: 0.01em; }
        .um-close {
          width: 26px; height: 26px; border-radius: 7px; border: 1px solid rgba(255,255,255,0.07);
          background: transparent; color: rgba(255,255,255,0.3); cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: color 0.15s, background 0.15s;
        }
        .um-close:hover { color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.05); }
        .um-form { display: flex; flex-direction: column; gap: 14px; padding: 20px; }
        .um-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .um-field { display: flex; flex-direction: column; gap: 5px; }
        .um-label { font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.35); }
        .um-req { color: #B30000; }
        .um-hint { font-size: 10px; color: rgba(255,255,255,0.2); text-transform: none; letter-spacing: 0; font-weight: 400; font-style: italic; }
        .um-input {
          appearance: none; -webkit-appearance: none;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px; padding: 8px 12px;
          font-size: 13px; color: rgba(255,255,255,0.8); font-family: inherit;
          outline: none; transition: border-color 0.15s;
        }
        .um-input:focus { border-color: rgba(179,0,0,0.5); }
        .um-input::placeholder { color: rgba(255,255,255,0.2); }
        select.um-input { cursor: pointer; }
        select.um-input option { background: #1a1a1a; color: #e5e5e5; }
        .um-pwd-wrap { position: relative; display: flex; align-items: center; }
        .um-input--pwd { flex: 1; padding-right: 36px; }
        .um-pwd-toggle {
          position: absolute; right: 8px;
          background: none; border: none; cursor: pointer;
          color: rgba(255,255,255,0.25); display: flex; padding: 4px;
          transition: color 0.1s;
        }
        .um-pwd-toggle:hover { color: rgba(255,255,255,0.55); }
        .um-error {
          padding: 8px 12px; border-radius: 8px;
          background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25);
          color: #fca5a5; font-size: 12px;
        }
        .um-actions {
          display: flex; justify-content: flex-end; gap: 8px;
          padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.06); margin-top: 2px;
        }
        .um-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 16px; border-radius: 8px;
          font-size: 12.5px; font-family: inherit; font-weight: 500;
          cursor: pointer; border: 1px solid transparent;
          transition: background 0.15s, transform 0.1s;
        }
        .um-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .um-btn--ghost {
          background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.5);
          border-color: rgba(255,255,255,0.08);
        }
        .um-btn--ghost:hover:not(:disabled) { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.75); }
        .um-btn--primary {
          background: #B30000; color: #fff;
          box-shadow: 0 3px 12px rgba(179,0,0,0.3);
        }
        .um-btn--primary:hover:not(:disabled) { background: #cc0000; transform: translateY(-1px); box-shadow: 0 5px 18px rgba(179,0,0,0.45); }

        /* ── Light mode ── */
        [data-theme="light"] .ua-card { background: #fff; border-color: rgba(0,0,0,0.08); }
        [data-theme="light"] .ua-card:hover { background: #fafafa; border-color: rgba(0,0,0,0.15); }
        [data-theme="light"] .ua-card--active { background: #fafafa; border-color: rgba(0,0,0,0.2); }
        [data-theme="light"] .ua-card--red.ua-card--active { background: rgba(179,0,0,0.04); border-color: rgba(179,0,0,0.2); }
        [data-theme="light"] .ua-card--amber.ua-card--active { background: rgba(251,191,36,0.06); border-color: rgba(251,191,36,0.2); }
        [data-theme="light"] .ua-card--blue.ua-card--active { background: rgba(99,179,237,0.06); border-color: rgba(99,179,237,0.2); }
        [data-theme="light"] .ua-card--violet.ua-card--active { background: rgba(124,58,237,0.04); border-color: rgba(124,58,237,0.2); }
        [data-theme="light"] .ua-card-val { color: rgba(0,0,0,0.8); }
        [data-theme="light"] .ua-card--red    .ua-card-val { color: #b30000; }
        [data-theme="light"] .ua-card--amber  .ua-card-val { color: #b45309; }
        [data-theme="light"] .ua-card--blue   .ua-card-val { color: #1d6fa8; }
        [data-theme="light"] .ua-card--violet .ua-card-val { color: #6d28d9; }
        [data-theme="light"] .ua-card-lbl { color: rgba(0,0,0,0.35); }
        [data-theme="light"] .ua-search { background: #fff; border-color: rgba(0,0,0,0.12); color: rgba(0,0,0,0.75); }
        [data-theme="light"] .ua-search::placeholder { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .ua-search-icon { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .ua-search-clear { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .ua-btn--ghost { background: #fff; color: rgba(0,0,0,0.55); border-color: rgba(0,0,0,0.12); }
        [data-theme="light"] .ua-btn--ghost:hover:not(:disabled) { background: #f5f5f5; color: rgba(0,0,0,0.75); }
        [data-theme="light"] .ua-table-wrap { background: #fff; border-color: rgba(0,0,0,0.08); }
        [data-theme="light"] .ua-th { background: #f5f5f5; color: rgba(0,0,0,0.4); border-bottom-color: rgba(0,0,0,0.07); }
        [data-theme="light"] .ua-tr { border-bottom-color: rgba(0,0,0,0.05); }
        [data-theme="light"] .ua-tr:hover { background: rgba(0,0,0,0.02); }
        [data-theme="light"] .ua-td--num { color: rgba(0,0,0,0.25); }
        [data-theme="light"] .ua-avatar { background: rgba(0,0,0,0.08); }
        [data-theme="light"] .ua-user-name { color: rgba(0,0,0,0.8); }
        [data-theme="light"] .ua-user-email { color: rgba(0,0,0,0.4); }
        [data-theme="light"] .ua-role-badge--super_admin { background: rgba(179,0,0,0.08); color: #b30000; border-color: rgba(179,0,0,0.18); }
        [data-theme="light"] .ua-role-badge--leadership  { background: rgba(180,83,9,0.08); color: #b45309; border-color: rgba(180,83,9,0.18); }
        [data-theme="light"] .ua-role-badge--department  { background: rgba(29,111,168,0.08); color: #1d6fa8; border-color: rgba(29,111,168,0.18); }
        [data-theme="light"] .ua-role-badge--marketing   { background: rgba(109,40,217,0.07); color: #6d28d9; border-color: rgba(109,40,217,0.18); }
        [data-theme="light"] .ua-dept { color: rgba(0,0,0,0.5); }
        [data-theme="light"] .ua-dept-none { color: rgba(0,0,0,0.2); }
        [data-theme="light"] .ua-action-btn--edit { color: rgba(0,0,0,0.3); border-color: rgba(0,0,0,0.08); }
        [data-theme="light"] .ua-action-btn--edit:hover:not(:disabled) { color: rgba(0,0,0,0.7); background: rgba(0,0,0,0.05); border-color: rgba(0,0,0,0.12); }
        [data-theme="light"] .ua-action-btn--delete { color: rgba(220,38,38,0.4); border-color: rgba(220,38,38,0.1); }
        [data-theme="light"] .ua-action-btn--delete:hover:not(:disabled) { color: #dc2626; background: rgba(220,38,38,0.07); border-color: rgba(220,38,38,0.2); }
        [data-theme="light"] .ua-empty { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .ua-count { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .um-modal { background: #fff; border-color: rgba(0,0,0,0.1); box-shadow: 0 24px 80px rgba(0,0,0,0.15); }
        [data-theme="light"] .um-header { border-bottom-color: rgba(0,0,0,0.07); }
        [data-theme="light"] .um-title { color: rgba(0,0,0,0.8); }
        [data-theme="light"] .um-close { border-color: rgba(0,0,0,0.08); color: rgba(0,0,0,0.35); }
        [data-theme="light"] .um-close:hover { color: rgba(0,0,0,0.7); background: rgba(0,0,0,0.04); }
        [data-theme="light"] .um-label { color: rgba(0,0,0,0.45); }
        [data-theme="light"] .um-hint { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .um-input { background: #f8f8f8; border-color: rgba(0,0,0,0.12); color: rgba(0,0,0,0.8); }
        [data-theme="light"] .um-input::placeholder { color: rgba(0,0,0,0.25); }
        [data-theme="light"] select.um-input option { background: #fff; color: #1a1a1a; }
        [data-theme="light"] .um-pwd-toggle { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .um-pwd-toggle:hover { color: rgba(0,0,0,0.6); }
        [data-theme="light"] .um-actions { border-top-color: rgba(0,0,0,0.06); }
        [data-theme="light"] .um-btn--ghost { background: #f5f5f5; color: rgba(0,0,0,0.55); border-color: rgba(0,0,0,0.1); }
        [data-theme="light"] .um-btn--ghost:hover:not(:disabled) { background: #ebebeb; color: rgba(0,0,0,0.75); }
      `}</style>
    </div>

    {modal && (
      <UserModal
        mode={modal.mode}
        user={modal.user}
        departments={departments}
        onClose={() => setModal(null)}
        onSaved={handleSaved}
      />
    )}
    </>
  )
}
