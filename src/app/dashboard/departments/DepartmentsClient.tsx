'use client'

import { useState, useTransition, useMemo } from 'react'
import { Building2, Pencil, Trash2, X, Search, Plus, Users } from 'lucide-react'

export interface Department {
  id: string
  name: string
  code: string | null
  userCount: number
}

type ModalMode = 'add' | 'edit'

interface FormState {
  name: string
  code: string
}

const EMPTY_FORM: FormState = { name: '', code: '' }

function DeptModal({
  mode,
  dept,
  onClose,
  onSaved,
}: {
  mode: ModalMode
  dept: Department | null
  onClose: () => void
  onSaved: (d: Department) => void
}) {
  const [form, setForm] = useState<FormState>(() =>
    mode === 'edit' && dept
      ? { name: dept.name, code: dept.code ?? '' }
      : EMPTY_FORM
  )
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function set(key: keyof FormState, val: string) {
    setForm(f => ({ ...f, [key]: val }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) { setError('Tên phòng ban là bắt buộc.'); return }

    startTransition(async () => {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        code: form.code.trim() || null,
      }
      if (mode === 'edit' && dept) body.id = dept.id

      const res = await fetch('/api/departments', {
        method: mode === 'add' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Lỗi không xác định'); return }

      onSaved({ ...json, userCount: dept?.userCount ?? 0 })
      onClose()
    })
  }

  return (
    <div className="dm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dm-modal" role="dialog" aria-modal="true">
        <div className="dm-header">
          <div className="dm-header-left">
            <Building2 size={14} className="dm-header-icon" />
            <span className="dm-title">{mode === 'add' ? 'Thêm phòng ban' : 'Chỉnh sửa phòng ban'}</span>
          </div>
          <button className="dm-close" onClick={onClose} aria-label="Đóng"><X size={15} /></button>
        </div>

        <form className="dm-form" onSubmit={handleSubmit} noValidate>
          <div className="dm-field">
            <label className="dm-label">Tên phòng ban <span className="dm-req">*</span></label>
            <input
              className="dm-input"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="VD: Phòng Kỹ thuật"
              autoFocus
            />
          </div>

          <div className="dm-field">
            <label className="dm-label">
              Mã phòng ban
              <span className="dm-hint"> (tuỳ chọn — hiển thị trong bảng đánh giá)</span>
            </label>
            <input
              className="dm-input dm-input--code"
              value={form.code}
              onChange={e => set('code', e.target.value.toUpperCase())}
              placeholder="VD: KT, HCNS, KD…"
              maxLength={10}
            />
          </div>

          {error && <div className="dm-error">{error}</div>}

          <div className="dm-actions">
            <button type="button" className="dm-btn dm-btn--ghost" onClick={onClose} disabled={isPending}>Hủy</button>
            <button type="submit" className="dm-btn dm-btn--primary" disabled={isPending}>
              {isPending ? 'Đang lưu…' : mode === 'add' ? 'Tạo phòng ban' : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function DepartmentsClient({ initialDepartments }: { initialDepartments: Department[] }) {
  const [departments, setDepartments] = useState(initialDepartments)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<{ mode: ModalMode; dept: Department | null } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return departments
    return departments.filter(d =>
      d.name.toLowerCase().includes(q) || (d.code ?? '').toLowerCase().includes(q)
    )
  }, [departments, search])

  const totalUsers = useMemo(() => departments.reduce((s, d) => s + d.userCount, 0), [departments])

  function handleSaved(saved: Department) {
    setDepartments(prev => {
      const idx = prev.findIndex(d => d.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = saved
        return next.sort((a, b) => a.name.localeCompare(b.name))
      }
      return [...prev, saved].sort((a, b) => a.name.localeCompare(b.name))
    })
  }

  function handleDelete(d: Department) {
    if (d.userCount > 0) {
      alert(`Không thể xóa "${d.name}": có ${d.userCount} tài khoản đang thuộc phòng ban này.\n\nHãy chuyển các tài khoản sang phòng ban khác trước.`)
      return
    }
    if (!window.confirm(`Xóa phòng ban "${d.name}"?\n\nHành động này không thể hoàn tác.`)) return

    setDeletingId(d.id)
    startTransition(async () => {
      const res = await fetch(`/api/departments?id=${d.id}`, { method: 'DELETE' })
      if (res.ok) {
        setDepartments(prev => prev.filter(x => x.id !== d.id))
      } else {
        const json = await res.json()
        alert(json.error ?? 'Xóa thất bại')
      }
      setDeletingId(null)
    })
  }

  return (
    <>
    <div className="da-root">

      {/* ── Stat cards ── */}
      <div className="da-cards">
        <div className="da-card">
          <Building2 size={16} className="da-card-icon" />
          <div>
            <span className="da-card-val">{departments.length}</span>
            <span className="da-card-lbl">Phòng ban</span>
          </div>
        </div>
        <div className="da-card da-card--blue">
          <Users size={16} className="da-card-icon" />
          <div>
            <span className="da-card-val">{totalUsers}</span>
            <span className="da-card-lbl">Tài khoản</span>
          </div>
        </div>
        <div className="da-card da-card--muted">
          <div className="da-card-stat-wrap">
            <span className="da-card-val">
              {departments.filter(d => !d.code).length}
            </span>
            <span className="da-card-lbl">Chưa có mã</span>
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="da-toolbar">
        <div className="da-search-wrap">
          <Search size={13} className="da-search-icon" />
          <input
            className="da-search"
            placeholder="Tìm theo tên hoặc mã…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="da-search-clear" onClick={() => setSearch('')} aria-label="Xóa">
              <X size={12} />
            </button>
          )}
        </div>
        <button className="da-btn da-btn--primary" onClick={() => setModal({ mode: 'add', dept: null })}>
          <Plus size={13} />
          Thêm phòng ban
        </button>
      </div>

      {/* ── Grid ── */}
      {filtered.length === 0 ? (
        <div className="da-empty">
          {search ? 'Không tìm thấy phòng ban phù hợp.' : 'Chưa có phòng ban nào.'}
        </div>
      ) : (
        <div className="da-grid">
          {filtered.map((d, i) => (
            <div key={d.id} className="da-card-dept" style={{ animationDelay: `${i * 25}ms` }}>
              <div className="da-dept-top">
                <div className="da-dept-icon-wrap">
                  <Building2 size={16} className="da-dept-icon" />
                </div>
                <div className="da-dept-actions">
                  <button
                    className="da-action-btn da-action-btn--edit"
                    onClick={() => setModal({ mode: 'edit', dept: d })}
                    title="Chỉnh sửa"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    className="da-action-btn da-action-btn--delete"
                    onClick={() => handleDelete(d)}
                    disabled={deletingId === d.id || isPending}
                    title="Xóa"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              <div className="da-dept-body">
                <span className="da-dept-name">{d.name}</span>
                {d.code
                  ? <span className="da-dept-code">{d.code}</span>
                  : <span className="da-dept-code da-dept-code--empty">Chưa có mã</span>}
              </div>

              <div className="da-dept-footer">
                <Users size={11} className="da-dept-users-icon" />
                <span className="da-dept-users">
                  {d.userCount} tài khoản
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {filtered.length > 0 && departments.length !== filtered.length && (
        <p className="da-count">Hiển thị {filtered.length} / {departments.length} phòng ban</p>
      )}

      <style>{`
        .da-root {
          display: flex; flex-direction: column; gap: 16px;
          font-family: var(--font-sans), sans-serif;
          animation: daFade 0.3s ease both;
        }
        @keyframes daFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

        /* ── Stat cards ── */
        .da-cards { display: flex; gap: 10px; flex-wrap: wrap; }
        .da-card {
          display: flex; align-items: center; gap: 12px;
          padding: 14px 18px; border-radius: 12px; min-width: 160px;
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06);
        }
        .da-card--blue { border-color: rgba(99,179,237,0.15); background: rgba(99,179,237,0.04); }
        .da-card--muted { border-color: rgba(255,255,255,0.04); }
        .da-card-icon { color: rgba(255,255,255,0.2); flex-shrink: 0; }
        .da-card--blue .da-card-icon { color: #63b3ed; opacity: 0.7; }
        .da-card-val { display: block; font-size: 26px; font-weight: 300; letter-spacing: -0.03em; color: rgba(255,255,255,0.85); line-height: 1; }
        .da-card--blue .da-card-val { color: #63b3ed; }
        .da-card--muted .da-card-val { color: rgba(255,255,255,0.35); }
        .da-card-lbl { display: block; font-size: 10px; font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase; color: rgba(255,255,255,0.25); margin-top: 3px; }

        /* ── Toolbar ── */
        .da-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .da-search-wrap { position: relative; display: flex; align-items: center; flex: 1; max-width: 360px; }
        .da-search-icon { position: absolute; left: 10px; color: rgba(255,255,255,0.25); pointer-events: none; }
        .da-search {
          width: 100%; padding: 7px 32px 7px 30px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px; font-size: 12.5px; color: rgba(255,255,255,0.75);
          font-family: inherit; outline: none; transition: border-color 0.15s;
        }
        .da-search::placeholder { color: rgba(255,255,255,0.2); }
        .da-search:focus { border-color: rgba(179,0,0,0.4); }
        .da-search-clear {
          position: absolute; right: 8px; background: none; border: none;
          cursor: pointer; color: rgba(255,255,255,0.25); display: flex; align-items: center;
          padding: 2px; border-radius: 4px; transition: color 0.1s;
        }
        .da-search-clear:hover { color: rgba(255,255,255,0.5); }
        .da-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 14px; border-radius: 8px; border: 1px solid transparent;
          font-size: 12px; font-family: inherit; font-weight: 500;
          cursor: pointer; white-space: nowrap;
          transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
        }
        .da-btn--primary {
          background: #B30000; color: #fff;
          box-shadow: 0 3px 12px rgba(179,0,0,0.3);
        }
        .da-btn--primary:hover { background: #cc0000; transform: translateY(-1px); box-shadow: 0 5px 18px rgba(179,0,0,0.45); }

        /* ── Dept grid ── */
        .da-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
          gap: 10px;
        }
        .da-card-dept {
          display: flex; flex-direction: column; gap: 10px;
          padding: 14px 16px; border-radius: 12px;
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06);
          transition: border-color 0.15s, background 0.15s;
          animation: deptIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        @keyframes deptIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
        .da-card-dept:hover { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.1); }

        .da-dept-top { display: flex; align-items: center; justify-content: space-between; }
        .da-dept-icon-wrap {
          width: 32px; height: 32px; border-radius: 9px;
          background: rgba(179,0,0,0.1); border: 1px solid rgba(179,0,0,0.15);
          display: flex; align-items: center; justify-content: center;
        }
        .da-dept-icon { color: rgba(179,0,0,0.7); }
        .da-dept-actions { display: flex; gap: 4px; }

        .da-action-btn {
          display: inline-flex; align-items: center; justify-content: center;
          width: 26px; height: 26px; border-radius: 6px; border: 1px solid transparent;
          background: transparent; cursor: pointer;
          transition: background 0.15s, border-color 0.15s, color 0.15s;
        }
        .da-action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .da-action-btn--edit { color: rgba(255,255,255,0.25); border-color: rgba(255,255,255,0.06); }
        .da-action-btn--edit:hover:not(:disabled) { color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.12); }
        .da-action-btn--delete { color: rgba(255,100,100,0.35); border-color: rgba(255,100,100,0.07); }
        .da-action-btn--delete:hover:not(:disabled) { color: #f87171; background: rgba(248,113,113,0.08); border-color: rgba(248,113,113,0.2); }

        .da-dept-body { display: flex; flex-direction: column; gap: 4px; }
        .da-dept-name { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.8); line-height: 1.3; }
        .da-dept-code {
          display: inline-flex; align-items: center; align-self: flex-start;
          padding: 2px 8px; border-radius: 5px; font-size: 11px; font-weight: 700;
          letter-spacing: 0.1em; font-family: monospace;
          background: rgba(179,0,0,0.1); color: rgba(179,0,0,0.8);
          border: 1px solid rgba(179,0,0,0.18);
        }
        .da-dept-code--empty {
          background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.2);
          border-color: rgba(255,255,255,0.06); font-family: inherit;
          font-weight: 400; letter-spacing: 0; font-style: italic;
        }

        .da-dept-footer {
          display: flex; align-items: center; gap: 5px;
          padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.05);
        }
        .da-dept-users-icon { color: rgba(255,255,255,0.2); }
        .da-dept-users { font-size: 11px; color: rgba(255,255,255,0.3); }

        .da-empty {
          padding: 48px; text-align: center;
          color: rgba(255,255,255,0.2); font-size: 13px; font-style: italic;
          border: 1px dashed rgba(255,255,255,0.08); border-radius: 12px;
        }
        .da-count { font-size: 11px; color: rgba(255,255,255,0.2); font-style: italic; text-align: right; margin-top: -4px; }

        /* ── Modal ── */
        .dm-overlay {
          position: fixed; inset: 0; z-index: 100;
          background: rgba(0,0,0,0.65); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          padding: 20px;
          animation: dmFadeIn 0.2s ease both;
        }
        @keyframes dmFadeIn { from { opacity: 0; } to { opacity: 1; } }
        .dm-modal {
          width: 100%; max-width: 400px;
          background: #141414; border: 1px solid rgba(255,255,255,0.1);
          border-radius: 16px; overflow: hidden;
          box-shadow: 0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04);
          animation: dmSlideIn 0.25s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        @keyframes dmSlideIn { from { transform: translateY(12px) scale(0.98); opacity: 0; } to { transform: none; opacity: 1; } }
        .dm-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.07);
        }
        .dm-header-left { display: flex; align-items: center; gap: 8px; }
        .dm-header-icon { color: rgba(179,0,0,0.7); }
        .dm-title { font-size: 13.5px; font-weight: 600; color: rgba(255,255,255,0.85); }
        .dm-close {
          width: 26px; height: 26px; border-radius: 7px; border: 1px solid rgba(255,255,255,0.07);
          background: transparent; color: rgba(255,255,255,0.3); cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: color 0.15s, background 0.15s;
        }
        .dm-close:hover { color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.05); }

        .dm-form { display: flex; flex-direction: column; gap: 14px; padding: 20px; }
        .dm-field { display: flex; flex-direction: column; gap: 5px; }
        .dm-label { font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.35); }
        .dm-req { color: #B30000; }
        .dm-hint { font-size: 10px; color: rgba(255,255,255,0.2); text-transform: none; letter-spacing: 0; font-weight: 400; font-style: italic; }
        .dm-input {
          appearance: none; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px; padding: 8px 12px; font-size: 13px;
          color: rgba(255,255,255,0.8); font-family: inherit; outline: none;
          transition: border-color 0.15s;
        }
        .dm-input:focus { border-color: rgba(179,0,0,0.5); }
        .dm-input::placeholder { color: rgba(255,255,255,0.2); }
        .dm-input--code { font-family: monospace; letter-spacing: 0.08em; }
        .dm-error {
          padding: 8px 12px; border-radius: 8px;
          background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25);
          color: #fca5a5; font-size: 12px;
        }
        .dm-actions {
          display: flex; justify-content: flex-end; gap: 8px;
          padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.06); margin-top: 2px;
        }
        .dm-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 16px; border-radius: 8px;
          font-size: 12.5px; font-family: inherit; font-weight: 500;
          cursor: pointer; border: 1px solid transparent;
          transition: background 0.15s, transform 0.1s;
        }
        .dm-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .dm-btn--ghost { background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.5); border-color: rgba(255,255,255,0.08); }
        .dm-btn--ghost:hover:not(:disabled) { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.75); }
        .dm-btn--primary { background: #B30000; color: #fff; box-shadow: 0 3px 12px rgba(179,0,0,0.3); }
        .dm-btn--primary:hover:not(:disabled) { background: #cc0000; transform: translateY(-1px); box-shadow: 0 5px 18px rgba(179,0,0,0.45); }

        /* ── Light mode ── */
        [data-theme="light"] .da-card { background: #fff; border-color: rgba(0,0,0,0.08); }
        [data-theme="light"] .da-card--blue { background: rgba(99,179,237,0.05); border-color: rgba(99,179,237,0.15); }
        [data-theme="light"] .da-card--muted { border-color: rgba(0,0,0,0.06); }
        [data-theme="light"] .da-card-icon { color: rgba(0,0,0,0.25); }
        [data-theme="light"] .da-card-val { color: rgba(0,0,0,0.8); }
        [data-theme="light"] .da-card--blue .da-card-val { color: #1d6fa8; }
        [data-theme="light"] .da-card--muted .da-card-val { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .da-card-lbl { color: rgba(0,0,0,0.35); }
        [data-theme="light"] .da-search { background: #fff; border-color: rgba(0,0,0,0.12); color: rgba(0,0,0,0.75); }
        [data-theme="light"] .da-search::placeholder { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .da-search-icon { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .da-search-clear { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .da-card-dept { background: #fff; border-color: rgba(0,0,0,0.08); }
        [data-theme="light"] .da-card-dept:hover { background: #fafafa; border-color: rgba(0,0,0,0.14); }
        [data-theme="light"] .da-dept-icon-wrap { background: rgba(179,0,0,0.07); border-color: rgba(179,0,0,0.12); }
        [data-theme="light"] .da-dept-name { color: rgba(0,0,0,0.8); }
        [data-theme="light"] .da-dept-code { background: rgba(179,0,0,0.07); color: #8b0000; border-color: rgba(179,0,0,0.15); }
        [data-theme="light"] .da-dept-code--empty { background: rgba(0,0,0,0.03); color: rgba(0,0,0,0.25); border-color: rgba(0,0,0,0.07); }
        [data-theme="light"] .da-dept-footer { border-top-color: rgba(0,0,0,0.06); }
        [data-theme="light"] .da-dept-users-icon { color: rgba(0,0,0,0.2); }
        [data-theme="light"] .da-dept-users { color: rgba(0,0,0,0.35); }
        [data-theme="light"] .da-action-btn--edit { color: rgba(0,0,0,0.25); border-color: rgba(0,0,0,0.07); }
        [data-theme="light"] .da-action-btn--edit:hover:not(:disabled) { color: rgba(0,0,0,0.65); background: rgba(0,0,0,0.05); border-color: rgba(0,0,0,0.12); }
        [data-theme="light"] .da-action-btn--delete { color: rgba(220,38,38,0.35); border-color: rgba(220,38,38,0.08); }
        [data-theme="light"] .da-action-btn--delete:hover:not(:disabled) { color: #dc2626; background: rgba(220,38,38,0.06); border-color: rgba(220,38,38,0.18); }
        [data-theme="light"] .da-empty { color: rgba(0,0,0,0.3); border-color: rgba(0,0,0,0.08); }
        [data-theme="light"] .da-count { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .dm-modal { background: #fff; border-color: rgba(0,0,0,0.1); box-shadow: 0 24px 80px rgba(0,0,0,0.15); }
        [data-theme="light"] .dm-header { border-bottom-color: rgba(0,0,0,0.07); }
        [data-theme="light"] .dm-title { color: rgba(0,0,0,0.8); }
        [data-theme="light"] .dm-close { border-color: rgba(0,0,0,0.08); color: rgba(0,0,0,0.35); }
        [data-theme="light"] .dm-close:hover { color: rgba(0,0,0,0.7); background: rgba(0,0,0,0.04); }
        [data-theme="light"] .dm-label { color: rgba(0,0,0,0.45); }
        [data-theme="light"] .dm-hint { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .dm-input { background: #f8f8f8; border-color: rgba(0,0,0,0.12); color: rgba(0,0,0,0.8); }
        [data-theme="light"] .dm-input::placeholder { color: rgba(0,0,0,0.25); }
        [data-theme="light"] .dm-actions { border-top-color: rgba(0,0,0,0.06); }
        [data-theme="light"] .dm-btn--ghost { background: #f5f5f5; color: rgba(0,0,0,0.55); border-color: rgba(0,0,0,0.1); }
        [data-theme="light"] .dm-btn--ghost:hover:not(:disabled) { background: #ebebeb; color: rgba(0,0,0,0.75); }
      `}</style>
    </div>

    {modal && (
      <DeptModal
        mode={modal.mode}
        dept={modal.dept}
        onClose={() => setModal(null)}
        onSaved={handleSaved}
      />
    )}
    </>
  )
}
