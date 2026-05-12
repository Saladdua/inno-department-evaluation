'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Pencil, Check, X, Plus, RefreshCw, Zap, Hand, Upload, FileDown, ChevronDown, CalendarPlus } from 'lucide-react'

/* ── Types ─────────────────────────────────────────── */
export interface Period {
  id: string
  quarter: number
  year: number
  start_date: string
  end_date:   string
  status: 'draft' | 'open' | 'closed'
}

export interface Criterion {
  id: string
  period_id: string
  code:          string | null
  name:          string
  weight:        number
  input_type:    'manual' | 'auto'
  auto_source:   string | null
  display_order: number
}

type Role = 'super_admin' | 'leadership' | 'department'

interface ParsedRow {
  code: string | null
  name: string
  weight: number
  input_type: 'manual' | 'auto'
  auto_source: string | null
}

function parseCSV(text: string): string[][] {
  return text.split(/\r?\n/).map(line => {
    const cells: string[] = []
    let cur = ''
    let inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
        else inQuote = !inQuote
      } else if (ch === ',' && !inQuote) {
        cells.push(cur); cur = ''
      } else {
        cur += ch
      }
    }
    cells.push(cur)
    return cells
  }).filter(row => row.some(c => c.trim()))
}

function parseCriteriaCSV(text: string, quarter: number): ParsedRow[] {
  const rows = parseCSV(text)
  if (rows.length < 2) return []
  const [header, ...data] = rows
  const hdr = header.map(h => h.trim())
  const qCol  = hdr.findIndex(h => h === `HS QUÝ ${quarter}`)
  const q1Col = hdr.findIndex(h => h === 'HS QUÝ 1')
  const weightCol = qCol >= 0 ? qCol : q1Col
  return data
    .filter(row => row[0]?.trim())
    .map(row => {
      const tieuChi  = row[0]?.trim() ?? ''
      const hinhThuc = row[1]?.trim() ?? ''
      const rawWeight = weightCol >= 0 ? row[weightCol]?.trim() ?? '' : ''
      const match   = tieuChi.match(/^(TC\d+):\s*(.+)/)
      const isAuto  = hinhThuc.toLowerCase().includes('dữ liệu từ báo cáo')
      return {
        code:       match ? match[1] : null,
        name:       match ? match[2].trim() : tieuChi,
        weight:     parseFloat(rawWeight) || 1,
        input_type: isAuto ? 'auto' as const : 'manual' as const,
        auto_source: isAuto ? 'google_sheets' : null,
      }
    })
}

const STATUS_LABEL: Record<Period['status'], string> = {
  draft:  'Chưa bắt đầu',
  open:   'Đang diễn ra',
  closed: 'Đã kết thúc',
}
const STATUS_COLOR: Record<Period['status'], string> = {
  draft:  'rgba(255,200,0,0.7)',
  open:   'rgba(0,200,100,0.7)',
  closed: 'rgba(255,255,255,0.3)',
}

/* ── Period Banner ─────────────────────────────────── */
function PeriodBanner({
  period,
  canEdit,
  onSave,
}: {
  period: Period | null
  canEdit: boolean
  onSave: (p: Period) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Period | null>(period)
  const [isPending, startTransition] = useTransition()

  const current = editing ? draft : period

  function fmt(d: string | null | undefined) {
    if (!d) return '—'
    const [y, m, day] = d.slice(0, 10).split('-')
    return `${day}/${m}/${y}`
  }

  function handleSave() {
    if (!draft) return
    startTransition(async () => {
      await onSave(draft)
      setEditing(false)
    })
  }

  if (!period && !canEdit) {
    return (
      <div className="banner banner--empty">
        <span>Chưa có kỳ đánh giá nào được tạo.</span>
      </div>
    )
  }

  return (
    <div className={`banner ${editing ? 'banner--editing' : ''}`}>
      <div className="banner-body">
        {editing && draft ? (
          <div className="banner-form">
            <div className="bf-row">
              <label className="bf-label">Số quý</label>
              <select className="bf-input bf-select" value={draft.quarter}
                onChange={e => setDraft({ ...draft, quarter: +e.target.value })}>
                {[1,2,3,4].map(q => <option key={q} value={q}>Quý {q}</option>)}
              </select>
            </div>
            <div className="bf-row">
              <label className="bf-label">Năm</label>
              <input className="bf-input" type="number" value={draft.year}
                onChange={e => setDraft({ ...draft, year: +e.target.value })} />
            </div>
            <div className="bf-row">
              <label className="bf-label">Bắt đầu</label>
              <input className="bf-input" type="date" value={draft.start_date}
                onChange={e => setDraft({ ...draft, start_date: e.target.value })} />
            </div>
            <div className="bf-row">
              <label className="bf-label">Kết thúc</label>
              <input className="bf-input" type="date" value={draft.end_date}
                onChange={e => setDraft({ ...draft, end_date: e.target.value })} />
            </div>
            <div className="bf-row">
              <label className="bf-label">Tình trạng</label>
              <select className="bf-input bf-select" value={draft.status}
                onChange={e => setDraft({ ...draft, status: e.target.value as Period['status'] })}>
                <option value="draft">Chưa bắt đầu</option>
                <option value="open">Đang diễn ra</option>
                <option value="closed">Đã kết thúc</option>
              </select>
            </div>
          </div>
        ) : current ? (
          <p className="banner-text">
            Đánh giá{' '}
            <strong>Quý {current.quarter}</strong>{' '}
            năm <strong>{current.year}</strong>{' '}
            bắt đầu từ <strong>{fmt(current.start_date)}</strong>{' '}
            tới <strong>{fmt(current.end_date)}</strong>{' '}
            hiện{' '}
            <span className="banner-status" style={{ color: STATUS_COLOR[current.status] }}>
              {STATUS_LABEL[current.status]}
            </span>.
          </p>
        ) : (
          <p className="banner-text banner-text--muted">Chưa có kỳ đánh giá. Nhấn chỉnh sửa để tạo mới.</p>
        )}
      </div>

      {canEdit && (
        <div className="banner-actions">
          {editing ? (
            <>
              <button className="bact-btn bact-btn--save" onClick={handleSave} disabled={isPending}>
                <Check size={13} /> Lưu
              </button>
              <button className="bact-btn bact-btn--cancel" onClick={() => { setDraft(period); setEditing(false) }}>
                <X size={13} /> Huỷ
              </button>
            </>
          ) : (
            <button className="bact-btn bact-btn--edit" onClick={() => {
              setDraft(period ?? { id: '', quarter: 1, year: new Date().getFullYear(), start_date: '', end_date: '', status: 'draft' })
              setEditing(true)
            }}>
              <Pencil size={13} /> Chỉnh sửa
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Criteria Table ────────────────────────────────── */
function CriteriaTable({
  criteria,
  canEdit,
  onUpdateCriterion,
  onAddRow,
  onImportCsv,
}: {
  criteria: Criterion[]
  canEdit: boolean
  onUpdateCriterion: (id: string, fields: { code: string | null; name: string; weight: number; input_type: 'manual' | 'auto'; auto_source: string | null }) => Promise<void>
  onAddRow: () => void
  onImportCsv?: () => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftCode, setDraftCode] = useState('')
  const [draftName, setDraftName] = useState('')
  const [draftWeight, setDraftWeight] = useState('')
  const [draftType, setDraftType] = useState<'manual' | 'auto'>('manual')
  const [draftAutoSource, setDraftAutoSource] = useState('')
  const [isPending, startTransition] = useTransition()

  function startEdit(c: Criterion) {
    setEditingId(c.id)
    setDraftCode(c.code ?? '')
    setDraftName(c.name)
    setDraftWeight(String(c.weight))
    setDraftType(c.input_type)
    setDraftAutoSource(c.auto_source ?? '')
  }

  function saveEdit(id: string) {
    if (!draftName.trim()) return
    const w = parseFloat(draftWeight)
    if (isNaN(w) || w < 0) return
    startTransition(async () => {
      await onUpdateCriterion(id, {
        code: draftCode.trim() || null,
        name: draftName.trim(),
        weight: w,
        input_type: draftType,
        auto_source: draftType === 'auto' ? draftAutoSource || null : null,
      })
      setEditingId(null)
    })
  }

  function handleExportTemplate() {
    const lines = [
      'DS TIÊU CHÍ & HỆ SỐ,Hình thức,HS QUÝ 1,HS QUÝ 2,HS QUÝ 3,HS QUÝ 4',
      'TC01: Chất lượng và hiệu quả công việc,Thủ công,1.5,1.5,1.5,1.5',
      'TC02: Tiến độ hoàn thành đúng hạn,Thủ công,1.0,1.0,1.0,1.0',
      'TC03: Ý thức và thái độ làm việc,Thủ công,1.0,1.0,1.0,1.0',
      'TC04: Kết quả từ hệ thống báo cáo,Dữ liệu từ báo cáo hệ thống,2.0,2.0,2.0,2.0',
    ]
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'mau_tieu_chi.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const totalWeight = criteria.reduce((s, c) => s + Number(c.weight), 0)

  return (
    <div className="ct-wrap">
      <div className="ct-header">
        <span className="ct-title">Danh sách tiêu chí</span>
        <div className="ct-header-right">
          <span className="ct-total">
            Tổng hệ số: <strong>{totalWeight.toFixed(2)}</strong>
          </span>
          {canEdit && (
            <button className="ct-template-btn" onClick={handleExportTemplate}>
              <FileDown size={13} /> Tải mẫu CSV
            </button>
          )}
          {canEdit && onImportCsv && (
            <button className="ct-import-btn" onClick={onImportCsv}>
              <Upload size={13} /> Import CSV
            </button>
          )}
          {canEdit && (
            <button className="ct-add-btn" onClick={onAddRow}>
              <Plus size={13} /> Thêm tiêu chí
            </button>
          )}
        </div>
      </div>

      {criteria.length === 0 ? (
        <div className="ct-empty">
          <RefreshCw size={20} style={{ opacity: 0.2 }} />
          <span>Chưa có tiêu chí nào. Thêm mới hoặc đồng bộ từ Google Sheets.</span>
        </div>
      ) : (
        <div className="ct-table-wrap">
          <table className="ct-table">
            <thead>
              <tr>
                <th className="ct-th ct-th--stt">STT</th>
                <th className="ct-th ct-th--code">Mã</th>
                <th className="ct-th ct-th--name">Tên tiêu chí</th>
                <th className="ct-th ct-th--weight">Hệ số</th>
                <th className="ct-th ct-th--type">Loại</th>
                {canEdit && <th className="ct-th ct-th--actions" />}
              </tr>
            </thead>
            <tbody>
              {criteria.map((c, i) => (
                <tr key={c.id} className={`ct-row${editingId === c.id ? ' ct-row--editing' : ''}`} style={{ animationDelay: editingId === c.id ? '0ms' : `${i * 30}ms` }}>
                  <td className="ct-td ct-td--stt">{i + 1}</td>
                  <td className="ct-td ct-td--code">
                    {editingId === c.id ? (
                      <input
                        className="ct-edit-input ct-edit-input--code"
                        value={draftCode}
                        onChange={e => setDraftCode(e.target.value)}
                        placeholder="TC01"
                        maxLength={20}
                      />
                    ) : (
                      <span className="ct-code">{c.code ?? '—'}</span>
                    )}
                  </td>
                  <td className="ct-td ct-td--name">
                    {editingId === c.id ? (
                      <input
                        className="ct-edit-input ct-edit-input--name"
                        value={draftName}
                        onChange={e => setDraftName(e.target.value)}
                        placeholder="Tên tiêu chí..."
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveEdit(c.id)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                      />
                    ) : c.name}
                  </td>
                  <td className="ct-td ct-td--weight">
                    {editingId === c.id ? (
                      <input
                        className="ct-weight-input"
                        type="number"
                        step="0.01"
                        value={draftWeight}
                        onChange={e => setDraftWeight(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveEdit(c.id)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                      />
                    ) : (
                      <span className="ct-weight-val">{Number(c.weight).toFixed(2)}</span>
                    )}
                  </td>
                  <td className="ct-td ct-td--type">
                    {editingId === c.id ? (
                      <div className="ct-type-edit">
                        <select
                          className="ct-type-select"
                          value={draftType}
                          onChange={e => setDraftType(e.target.value as 'manual' | 'auto')}
                        >
                          <option value="manual">Thủ công</option>
                          <option value="auto">Tự động</option>
                        </select>
                        {draftType === 'auto' && (
                          <select
                            className="ct-type-select"
                            value={draftAutoSource}
                            onChange={e => setDraftAutoSource(e.target.value)}
                          >
                            <option value="">Chọn nguồn…</option>
                            <option value="bang_luong">Bảng lương</option>
                            <option value="timesheets">Timesheets</option>
                            <option value="dao_tao">Đào tạo</option>
                            <option value="marketing">Marketing</option>
                            <option value="google_sheets">Google Sheets</option>
                            <option value="1office">1Office</option>
                            <option value="gitiho">Gitiho</option>
                          </select>
                        )}
                      </div>
                    ) : (
                      <span className={`ct-type-badge ct-type-badge--${c.input_type}`}>
                        {c.input_type === 'auto'
                          ? <><Zap size={10} /> {c.auto_source ?? 'auto'}</>
                          : <><Hand size={10} /> Thủ công</>}
                      </span>
                    )}
                  </td>
                  {canEdit && (
                    <td className="ct-td ct-td--actions">
                      {editingId === c.id ? (
                        <div className="ct-row-actions">
                          <button className="ct-icon-btn ct-icon-btn--save" onClick={() => saveEdit(c.id)} disabled={isPending}>
                            <Check size={12} />
                          </button>
                          <button className="ct-icon-btn ct-icon-btn--cancel" onClick={() => setEditingId(null)}>
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <button className="ct-icon-btn ct-icon-btn--edit" onClick={() => startEdit(c)}>
                          <Pencil size={12} />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ── Add Criterion Modal ────────────────────────────── */
function AddCriterionModal({
  periodId,
  nextOrder,
  onClose,
  onAdded,
}: {
  periodId: string
  nextOrder: number
  onClose: () => void
  onAdded: (c: Criterion) => void
}) {
  const [form, setForm] = useState({ code: '', name: '', weight: '1', input_type: 'manual' as 'manual' | 'auto', auto_source: '' })
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setErr('Tên tiêu chí không được để trống.'); return }
    startTransition(async () => {
      const res = await fetch('/api/criteria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period_id:     periodId,
          code:          form.code || null,
          name:          form.name,
          weight:        parseFloat(form.weight) || 1,
          input_type:    form.input_type,
          auto_source:   form.input_type === 'auto' ? form.auto_source || null : null,
          display_order: nextOrder,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error); return }
      onAdded(data)
      onClose()
    })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Thêm tiêu chí</span>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="mf-field">
            <label className="mf-label">Mã tiêu chí</label>
            <input className="mf-input" placeholder="TC01" value={form.code}
              onChange={e => setForm({ ...form, code: e.target.value })} />
          </div>
          <div className="mf-field">
            <label className="mf-label">Tên tiêu chí <span className="mf-required">*</span></label>
            <input className="mf-input" placeholder="Nhập tên tiêu chí..." value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="mf-field">
            <label className="mf-label">Hệ số</label>
            <input className="mf-input" type="number" step="0.01" min="0" value={form.weight}
              onChange={e => setForm({ ...form, weight: e.target.value })} />
          </div>
          <div className="mf-field">
            <label className="mf-label">Loại</label>
            <select className="mf-input" value={form.input_type}
              onChange={e => setForm({ ...form, input_type: e.target.value as 'manual' | 'auto' })}>
              <option value="manual">Thủ công</option>
              <option value="auto">Tự động</option>
            </select>
          </div>
          {form.input_type === 'auto' && (
            <div className="mf-field">
              <label className="mf-label">Nguồn dữ liệu</label>
              <select className="mf-input" value={form.auto_source}
                onChange={e => setForm({ ...form, auto_source: e.target.value })}>
                <option value="">Chọn nguồn…</option>
                <option value="bang_luong">Bảng lương</option>
                <option value="timesheets">Timesheets</option>
                <option value="dao_tao">Đào tạo</option>
                <option value="marketing">Marketing</option>
                <option value="google_sheets">Google Sheets</option>
                <option value="1office">1Office</option>
                <option value="gitiho">Gitiho</option>
              </select>
            </div>
          )}
          {err && <p className="mf-error">{err}</p>}
          <div className="mf-actions">
            <button type="button" className="mf-btn mf-btn--cancel" onClick={onClose}>Huỷ</button>
            <button type="submit" className="mf-btn mf-btn--save" disabled={isPending}>
              {isPending ? 'Đang lưu…' : 'Thêm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ── Import CSV Modal ──────────────────────────────── */
function ImportCsvModal({
  periodId,
  quarter,
  onClose,
  onImported,
}: {
  periodId: string
  quarter: number
  onClose: () => void
  onImported: (c: Criterion[]) => void
}) {
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState('')

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const text = ev.target?.result as string
        setRows(parseCriteriaCSV(text, quarter))
        setErr('')
      } catch {
        setErr('Không đọc được file CSV. Hãy kiểm tra định dạng.')
      }
    }
    reader.readAsText(file, 'utf-8')
  }

  function handleImport() {
    if (!rows.length) return
    startTransition(async () => {
      const body = rows.map((r, i) => ({
        period_id: periodId,
        code: r.code,
        name: r.name,
        weight: r.weight,
        input_type: r.input_type,
        auto_source: r.auto_source,
        display_order: i + 1,
      }))
      const res = await fetch('/api/criteria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error); return }
      onImported(data)
      onClose()
    })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card import-modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Import tiêu chí từ CSV</span>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="import-body">
          <label className="import-file-zone">
            <Upload size={20} />
            <span className="import-file-text">Chọn file CSV</span>
            <span className="import-file-hint">Dùng cột HS QUÝ {quarter} · DS TIÊU CHÍ & HỆ SỐ</span>
            <input type="file" accept=".csv" onChange={handleFile} style={{ display: 'none' }} />
          </label>

          {rows.length > 0 && (
            <>
              <div className="import-count">{rows.length} tiêu chí sẽ được thêm vào kỳ này</div>
              <div className="import-table-wrap">
                <table className="ct-table">
                  <thead>
                    <tr>
                      <th className="ct-th">Mã</th>
                      <th className="ct-th ct-th--name">Tên tiêu chí</th>
                      <th className="ct-th">Hệ số</th>
                      <th className="ct-th">Loại</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="ct-row">
                        <td className="ct-td"><span className="ct-code">{r.code ?? '—'}</span></td>
                        <td className="ct-td">{r.name}</td>
                        <td className="ct-td">
                          <input
                            className="ct-weight-input"
                            type="number" step="0.01" min="0"
                            value={r.weight}
                            onChange={e => setRows(prev => prev.map((row, j) =>
                              j === i ? { ...row, weight: parseFloat(e.target.value) || 0 } : row
                            ))}
                          />
                        </td>
                        <td className="ct-td">
                          <span className={`ct-type-badge ct-type-badge--${r.input_type}`}>
                            {r.input_type === 'auto'
                              ? <><Zap size={10} /> {r.auto_source}</>
                              : <><Hand size={10} /> Thủ công</>}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {err && <p className="mf-error">{err}</p>}

          <div className="mf-actions">
            <button type="button" className="mf-btn mf-btn--cancel" onClick={onClose}>Huỷ</button>
            <button
              type="button"
              className="mf-btn mf-btn--save"
              disabled={!rows.length || isPending}
              onClick={handleImport}
            >
              {isPending ? 'Đang import…' : `Import ${rows.length || ''} tiêu chí từ CSV`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Create Period Modal ───────────────────────────── */
function CreatePeriodModal({
  onClose,
  onCreated,
  periods,
}: {
  onClose: () => void
  onCreated: (p: Period) => void
  periods: Period[]
}) {
  const curYear = new Date().getFullYear()
  const [form, setForm] = useState({
    quarter: 1,
    year: curYear,
    start_date: '',
    end_date: '',
    status: 'draft' as Period['status'],
  })
  const [copyCriteria, setCopyCriteria] = useState(periods.length > 0)
  const [copyFromId, setCopyFromId] = useState<string>(periods[0]?.id ?? '')
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.start_date || !form.end_date) { setErr('Vui lòng chọn ngày bắt đầu và kết thúc.'); return }
    startTransition(async () => {
      const res = await fetch('/api/period', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          ...(copyCriteria && copyFromId ? { copy_criteria_from: copyFromId } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error ?? 'Lỗi tạo kỳ.'); return }
      onCreated(data)
      onClose()
    })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Tạo kỳ đánh giá mới</span>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="cp-row">
            <div className="mf-field" style={{ flex: 1 }}>
              <label className="mf-label">Quý <span className="mf-required">*</span></label>
              <select className="mf-input" value={form.quarter}
                onChange={e => setForm({ ...form, quarter: +e.target.value })}>
                {[1,2,3,4].map(q => <option key={q} value={q}>Quý {q}</option>)}
              </select>
            </div>
            <div className="mf-field" style={{ flex: 1 }}>
              <label className="mf-label">Năm <span className="mf-required">*</span></label>
              <input className="mf-input" type="number" min={2020} max={2099}
                value={form.year}
                onChange={e => setForm({ ...form, year: +e.target.value })} />
            </div>
          </div>
          <div className="cp-row">
            <div className="mf-field" style={{ flex: 1 }}>
              <label className="mf-label">Bắt đầu <span className="mf-required">*</span></label>
              <input className="mf-input" type="date" value={form.start_date}
                onChange={e => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div className="mf-field" style={{ flex: 1 }}>
              <label className="mf-label">Kết thúc <span className="mf-required">*</span></label>
              <input className="mf-input" type="date" value={form.end_date}
                onChange={e => setForm({ ...form, end_date: e.target.value })} />
            </div>
          </div>
          <div className="mf-field">
            <label className="mf-label">Tình trạng ban đầu</label>
            <select className="mf-input" value={form.status}
              onChange={e => setForm({ ...form, status: e.target.value as Period['status'] })}>
              <option value="draft">Chưa bắt đầu (Draft)</option>
              <option value="open">Đang diễn ra (Open)</option>
            </select>
          </div>
          {periods.length > 0 && (
            <div className="mf-field">
              <label className="mf-copy-row">
                <input
                  type="checkbox"
                  className="mf-checkbox"
                  checked={copyCriteria}
                  onChange={e => setCopyCriteria(e.target.checked)}
                />
                <span className="mf-copy-label">Sao chép tiêu chí từ kỳ</span>
                <select
                  className="mf-input mf-copy-select"
                  value={copyFromId}
                  disabled={!copyCriteria}
                  onChange={e => setCopyFromId(e.target.value)}
                >
                  {periods.map(p => (
                    <option key={p.id} value={p.id}>
                      Quý {p.quarter} · {p.year}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {err && <p className="mf-error">{err}</p>}
          <div className="mf-actions">
            <button type="button" className="mf-btn mf-btn--cancel" onClick={onClose}>Huỷ</button>
            <button type="submit" className="mf-btn mf-btn--save" disabled={isPending}>
              {isPending ? 'Đang tạo…' : 'Tạo kỳ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ── Main export ───────────────────────────────────── */
export default function CriteriaClient({
  periods: initialPeriods,
  initialPeriod,
  initialCriteria,
  role,
}: {
  periods: Period[]
  initialPeriod: Period | null
  initialCriteria: Criterion[]
  role: Role
}) {
  const router      = useRouter()
  const searchParams = useSearchParams()
  const [periods, setPeriods] = useState<Period[]>(initialPeriods)
  const [period, setPeriod] = useState<Period | null>(initialPeriod)
  const [criteria, setCriteria] = useState<Criterion[]>(initialCriteria)
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showCreatePeriod, setShowCreatePeriod] = useState(false)

  const canEdit = role === 'super_admin' || role === 'leadership'

  // Restore last-selected period when navigating back without a periodId param
  useEffect(() => {
    if (searchParams.get('periodId')) return  // URL already has explicit period — respect it
    const savedId = localStorage.getItem('criteria_period_id')
    if (!savedId) return
    const saved = periods.find(p => p.id === savedId)
    if (!saved || saved.id === period?.id) return
    setPeriod(saved)
    setCriteria([])
    fetch(`/api/criteria?periodId=${savedId}`)
      .then(r => r.json())
      .then((data: Criterion[]) => { if (Array.isArray(data)) setCriteria(data) })
      .catch(() => {})
    window.history.replaceState({}, '', `/dashboard/criteria?periodId=${savedId}`)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handlePeriodSave(p: Period) {
    const method = p.id ? 'PUT' : 'POST'
    const res = await fetch('/api/period', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    })
    const data = await res.json()
    if (res.ok) setPeriod(data)
  }

  async function handleUpdateCriterion(id: string, fields: { code: string | null; name: string; weight: number; input_type: 'manual' | 'auto'; auto_source: string | null }) {
    const res = await fetch('/api/criteria', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...fields }),
    })
    const data = await res.json()
    if (res.ok) setCriteria(prev => prev.map(c => c.id === id ? { ...c, ...fields, weight: data.weight } : c))
  }

  function switchPeriod(selectedId: string, newPeriod: Period | null) {
    localStorage.setItem('criteria_period_id', selectedId)
    setPeriod(newPeriod)
    setCriteria([])
    // Update URL without going through the Next.js router — avoids server re-render
    // races when router.refresh() is also in flight (e.g. after period creation).
    window.history.replaceState({}, '', `/dashboard/criteria?periodId=${selectedId}`)
    if (selectedId) {
      fetch(`/api/criteria?periodId=${selectedId}`)
        .then(r => r.json())
        .then((data: Criterion[]) => { if (Array.isArray(data)) setCriteria(data) })
        .catch(() => {})
    }
  }

  function handlePeriodChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const selectedId = e.target.value
    switchPeriod(selectedId, periods.find(p => p.id === selectedId) ?? null)
  }

  function handlePeriodCreated(p: Period) {
    setPeriods(prev => [p, ...prev])
    switchPeriod(p.id, p)
    // Purge router cache so other pages (matrix, evaluate, status…) re-fetch
    // and pick up the new period. No router.push here — switchPeriod already
    // updated the URL via replaceState, avoiding any race with refresh().
    router.refresh()
  }

  return (
    <div className="criteria-root">
      {/* Period selector row */}
      <div className="cp-header-row">
        <div className="cp-selector-wrap">
          <select className="cp-period-select" value={period?.id ?? ''} onChange={handlePeriodChange}>
            {periods.map(p => (
              <option key={p.id} value={p.id}>
                Quý {p.quarter} · {p.year}
                {p.status === 'closed' ? ' (Đã kết thúc)' : p.status === 'open' ? ' (Đang diễn ra)' : ' (Chưa bắt đầu)'}
              </option>
            ))}
            {periods.length === 0 && <option value="">— Chưa có kỳ nào —</option>}
          </select>
          <ChevronDown size={13} className="cp-chevron" />
        </div>
        {canEdit && (
          <button className="cp-new-btn" onClick={() => setShowCreatePeriod(true)}>
            <CalendarPlus size={13} /> Tạo kỳ mới
          </button>
        )}
      </div>

      <PeriodBanner period={period} canEdit={canEdit} onSave={handlePeriodSave} />

      {period && (
        <CriteriaTable
          criteria={criteria}
          canEdit={canEdit}
          onUpdateCriterion={handleUpdateCriterion}
          onAddRow={() => setShowAdd(true)}
          onImportCsv={canEdit ? () => setShowImport(true) : undefined}
        />
      )}

      {!period && canEdit && (
        <div className="no-period-hint">
          <p>Tạo kỳ đánh giá trước để thêm tiêu chí.</p>
        </div>
      )}

      {showAdd && period && (
        <AddCriterionModal
          periodId={period.id}
          nextOrder={criteria.length + 1}
          onClose={() => setShowAdd(false)}
          onAdded={c => setCriteria(prev => [...prev, c])}
        />
      )}

      {showImport && period && (
        <ImportCsvModal
          periodId={period.id}
          quarter={period.quarter}
          onClose={() => setShowImport(false)}
          onImported={imported => setCriteria(prev => [...prev, ...imported])}
        />
      )}

      {showCreatePeriod && (
        <CreatePeriodModal
          onClose={() => setShowCreatePeriod(false)}
          onCreated={handlePeriodCreated}
          periods={periods}
        />
      )}

      <style>{`
        /* ── Banner ── */
        .banner {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-left: 3px solid #B30000;
          border-radius: 10px;
          padding: 16px 20px;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 24px;
          box-shadow: 0 2px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04);
          animation: fadeUp 0.4s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        .banner--empty { border-left-color: rgba(255,255,255,0.15); }
        .banner--editing { border-left-color: #cc0000; background: rgba(179,0,0,0.04); }
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(10px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .banner-text {
          font-size: 13.5px;
          color: rgba(255,255,255,0.7);
          line-height: 1.7;
          font-family: var(--font-sans), sans-serif;
        }
        .banner-text--muted { color: rgba(255,255,255,0.3); font-style: italic; }
        .banner-text strong { color: #fff; font-weight: 600; }
        .banner-status { font-weight: 600; }
        .banner-form {
          display: flex;
          flex-wrap: wrap;
          gap: 12px 20px;
        }
        .bf-row { display: flex; flex-direction: column; gap: 4px; }
        .bf-label {
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.35);
          font-family: monospace;
        }
        .bf-input {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 6px;
          padding: 6px 10px;
          font-size: 13px;
          color: #fff;
          outline: none;
          font-family: var(--font-sans), sans-serif;
          min-width: 110px;
        }
        .bf-input:focus { border-color: rgba(179,0,0,0.5); }
        .bf-select { cursor: pointer; }
        .bf-select option { background: #1a1a1a; color: #fff; }
        .banner-actions { display: flex; gap: 8px; flex-shrink: 0; align-items: flex-start; padding-top: 2px; }
        .bact-btn {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 6px 12px; border-radius: 7px; border: none;
          font-size: 12px; font-family: var(--font-sans), sans-serif; cursor: pointer;
          transition: opacity 0.15s, transform 0.15s;
        }
        .bact-btn:hover { opacity: 0.85; transform: translateY(-1px); }
        .bact-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .bact-btn--edit   { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.7); }
        .bact-btn--save   { background: #B30000; color: #fff; box-shadow: 0 2px 8px rgba(179,0,0,0.3); }
        .bact-btn--cancel { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.4); }

        /* ── Criteria table ── */
        .ct-wrap {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 24px rgba(0,0,0,0.3);
          animation: fadeUp 0.45s 0.05s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        .ct-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .ct-title {
          font-size: 12px; font-weight: 600; letter-spacing: 0.1em;
          text-transform: uppercase; color: rgba(255,255,255,0.4);
          font-family: monospace;
        }
        .ct-header-right { display: flex; align-items: center; gap: 12px; }
        .ct-total { font-size: 12px; color: rgba(255,255,255,0.4); font-family: var(--font-sans), sans-serif; font-style: italic; }
        .ct-total strong { color: #B30000; }
        .ct-add-btn {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 6px 12px; border-radius: 7px;
          background: rgba(179,0,0,0.12); border: 1px solid rgba(179,0,0,0.25);
          color: rgba(255,100,100,0.9); font-size: 12px; cursor: pointer;
          font-family: var(--font-sans), sans-serif;
          transition: background 0.15s, transform 0.15s;
        }
        .ct-add-btn:hover { background: rgba(179,0,0,0.2); transform: translateY(-1px); }

        .ct-empty {
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          padding: 48px 20px;
          color: rgba(255,255,255,0.2); font-size: 13px; font-style: italic;
          font-family: var(--font-sans), sans-serif;
        }

        .ct-table-wrap { overflow-x: auto; }
        .ct-table { width: 100%; border-collapse: collapse; }
        .ct-th {
          padding: 10px 16px;
          font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase;
          color: rgba(255,255,255,0.25); font-family: monospace; font-weight: 600;
          text-align: left; white-space: nowrap;
        }
        .ct-th--stt, .ct-th--code, .ct-th--weight, .ct-th--type, .ct-th--actions { width: 1%; }
        .ct-row {
          border-top: 1px solid rgba(255,255,255,0.04);
          animation: rowIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both;
          transition: background 0.12s;
          position: relative;
        }
        .ct-row:hover { background: rgba(255,255,255,0.02); }
        .ct-row--editing {
          background: rgba(179,0,0,0.05) !important;
          box-shadow: inset 3px 0 0 #B30000;
        }
        @keyframes rowIn {
          from { opacity:0; transform:translateX(-6px); }
          to   { opacity:1; transform:translateX(0); }
        }
        .ct-td { padding: 11px 16px; font-size: 13px; color: rgba(255,255,255,0.7); font-family: var(--font-sans), sans-serif; }

        /* Inline edit inputs */
        .ct-edit-input {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(179,0,0,0.4);
          border-radius: 6px;
          padding: 5px 9px;
          font-size: 13px;
          color: #fff;
          outline: none;
          font-family: var(--font-sans), sans-serif;
          transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
        }
        .ct-edit-input:focus {
          border-color: rgba(179,0,0,0.75);
          background: rgba(179,0,0,0.07);
          box-shadow: 0 0 0 3px rgba(179,0,0,0.12);
        }
        .ct-edit-input--code {
          width: 78px;
          font-family: monospace;
          font-size: 12px;
          letter-spacing: 0.04em;
        }
        .ct-edit-input--name {
          width: 100%;
          min-width: 180px;
        }
        .ct-td--stt { color: rgba(255,255,255,0.2); font-size: 12px; }
        .ct-code {
          display: inline-block; padding: 2px 8px; border-radius: 5px;
          background: rgba(255,255,255,0.05); font-family: monospace;
          font-size: 11.5px; color: rgba(255,255,255,0.5);
        }
        .ct-weight-val { color: #fff; font-weight: 600; }
        .ct-weight-input {
          width: 70px; padding: 4px 8px; border-radius: 5px;
          background: rgba(255,255,255,0.08); border: 1px solid rgba(179,0,0,0.4);
          color: #fff; font-size: 13px; outline: none;
        }
        .ct-icon-btn {
          width: 24px; height: 24px; border-radius: 5px; border: none;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: background 0.12s, color 0.12s;
          font-size: 0;
        }
        .ct-icon-btn--save   { background: rgba(0,200,100,0.15); color: rgba(0,200,100,0.8); }
        .ct-icon-btn--save:hover { background: rgba(0,200,100,0.25); }
        .ct-icon-btn--cancel { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.3); }
        .ct-icon-btn--cancel:hover { background: rgba(255,255,255,0.1); }
        .ct-row-actions { display: flex; align-items: center; gap: 4px; }
        .ct-icon-btn--edit   { background: transparent; color: rgba(255,255,255,0.2); }
        .ct-icon-btn--edit:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.6); }
        .ct-type-badge {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 2px 8px; border-radius: 20px; font-size: 11px;
        }
        .ct-type-badge--manual {
          background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.35);
        }
        .ct-type-badge--auto {
          background: rgba(0,160,255,0.1); color: rgba(80,180,255,0.8);
          border: 1px solid rgba(0,160,255,0.15);
        }

        /* ── No period hint ── */
        .no-period-hint {
          margin-top: 12px; font-size: 13px; font-style: italic;
          color: rgba(255,255,255,0.2); font-family: var(--font-sans), sans-serif;
        }

        /* ── Modal ── */
        .modal-backdrop {
          position: fixed; inset: 0; z-index: 100;
          background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        .modal-card {
          background: #141414; border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px; width: 100%; max-width: 420px;
          box-shadow: 0 24px 64px rgba(0,0,0,0.7);
          animation: modalIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        @keyframes modalIn {
          from { opacity:0; transform:scale(0.95) translateY(10px); }
          to   { opacity:1; transform:scale(1) translateY(0); }
        }
        .modal-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 18px 20px 14px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .modal-title { font-size: 14px; font-weight: 600; color: #fff; font-family: var(--font-sans), sans-serif; }
        .modal-close {
          background: rgba(255,255,255,0.05); border: none; border-radius: 6px;
          width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
          color: rgba(255,255,255,0.4); cursor: pointer;
        }
        .modal-close:hover { background: rgba(255,255,255,0.1); color: #fff; }
        .modal-form { padding: 16px 20px 20px; display: flex; flex-direction: column; gap: 14px; }
        .mf-field { display: flex; flex-direction: column; gap: 5px; }
        .mf-label { font-size: 11px; letter-spacing: 0.07em; text-transform: uppercase; color: rgba(255,255,255,0.35); font-family: monospace; }
        .mf-required { color: #B30000; }
        .mf-input {
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09);
          border-radius: 8px; padding: 9px 12px; font-size: 13px; color: #fff;
          outline: none; font-family: var(--font-sans), sans-serif;
          transition: border-color 0.15s;
        }
        .mf-input:focus { border-color: rgba(179,0,0,0.5); }
        .mf-input option { background: #1a1a1a; color: #fff; }
        .mf-copy-row { display: flex; align-items: center; gap: 8px; cursor: pointer; }
        .mf-checkbox { width: 14px; height: 14px; accent-color: #B30000; cursor: pointer; flex-shrink: 0; }
        .mf-copy-label { font-size: 12px; color: rgba(255,255,255,0.6); white-space: nowrap; }
        .mf-copy-select { flex: 1; margin: 0; }
        .mf-copy-select:disabled { opacity: 0.35; cursor: not-allowed; }
        .mf-error { font-size: 12px; color: #ff6666; font-style: italic; }
        .mf-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }
        .mf-btn {
          padding: 8px 18px; border-radius: 8px; border: none;
          font-size: 13px; cursor: pointer; font-family: var(--font-sans), sans-serif;
          transition: opacity 0.15s, transform 0.15s;
        }
        .mf-btn:hover { opacity: 0.85; transform: translateY(-1px); }
        .mf-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .mf-btn--cancel { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.5); }
        .mf-btn--save   { background: #B30000; color: #fff; box-shadow: 0 2px 12px rgba(179,0,0,0.3); }

        /* ── Template download button ── */
        .ct-template-btn {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 6px 12px; border-radius: 7px;
          background: rgba(0,180,110,0.08); border: 1px solid rgba(0,180,110,0.2);
          color: rgba(0,210,130,0.85); font-size: 12px; cursor: pointer;
          font-family: var(--font-sans), sans-serif;
          transition: background 0.15s, color 0.15s, transform 0.15s;
        }
        .ct-template-btn:hover {
          background: rgba(0,180,110,0.15);
          color: rgba(0,230,150,1);
          transform: translateY(-1px);
        }
        .ct-template-btn:hover svg {
          animation: dlBounce 0.4s cubic-bezier(0.34,1.56,0.64,1);
        }
        @keyframes dlBounce {
          0%   { transform: translateY(0); }
          40%  { transform: translateY(4px); }
          70%  { transform: translateY(-2px); }
          100% { transform: translateY(0); }
        }

        /* ── Import button ── */
        .ct-import-btn {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 6px 12px; border-radius: 7px;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.45); font-size: 12px; cursor: pointer;
          font-family: var(--font-sans), sans-serif;
          transition: background 0.15s, color 0.15s, transform 0.15s;
        }
        .ct-import-btn:hover { background: rgba(255,255,255,0.09); color: rgba(255,255,255,0.7); transform: translateY(-1px); }

        /* ── Import modal ── */
        .import-modal-card { max-width: 620px; }
        .import-body { padding: 16px 20px 20px; display: flex; flex-direction: column; gap: 14px; }
        .import-file-zone {
          display: flex; flex-direction: column; align-items: center; gap: 6px;
          padding: 24px 16px; border-radius: 10px;
          border: 1.5px dashed rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.02); cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
          color: rgba(255,255,255,0.35);
        }
        .import-file-zone:hover { border-color: rgba(179,0,0,0.4); background: rgba(179,0,0,0.04); color: rgba(255,255,255,0.6); }
        .import-file-text { font-size: 13px; font-family: var(--font-sans), sans-serif; }
        .import-file-hint { font-size: 11px; color: rgba(255,255,255,0.2); font-style: italic; }
        .import-count {
          font-size: 12px; color: rgba(0,200,100,0.7); font-style: italic;
          font-family: var(--font-sans), sans-serif; padding: 0 2px;
        }
        .import-table-wrap { max-height: 280px; overflow-y: auto; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06); scrollbar-width: thin; scrollbar-color: rgba(179,0,0,0.2) transparent; }
        .import-table-wrap::-webkit-scrollbar { width: 4px; }
        .import-table-wrap::-webkit-scrollbar-thumb { background: rgba(179,0,0,0.2); border-radius: 4px; }

        /* ── Type edit ── */
        .ct-type-edit { display: flex; flex-direction: column; gap: 4px; }
        .ct-type-select {
          padding: 3px 6px; border-radius: 5px;
          background: rgba(255,255,255,0.08); border: 1px solid rgba(179,0,0,0.4);
          color: #fff; font-size: 12px; outline: none; cursor: pointer;
          font-family: var(--font-sans), sans-serif;
        }
        .ct-type-select option { background: #1a1a1a; }

        /* ── Period selector row ── */
        .cp-header-row {
          display: flex; align-items: center; gap: 10px;
          margin-bottom: 16px;
        }
        .cp-selector-wrap {
          position: relative; display: inline-flex; align-items: center;
        }
        .cp-period-select {
          appearance: none;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          padding: 7px 32px 7px 12px;
          font-size: 13px;
          color: rgba(255,255,255,0.8);
          font-family: var(--font-sans), sans-serif;
          cursor: pointer;
          outline: none;
          transition: border-color 0.15s, background 0.15s;
          min-width: 220px;
        }
        .cp-period-select:focus { border-color: rgba(179,0,0,0.4); }
        .cp-period-select option { background: #1a1a1a; }
        .cp-chevron {
          position: absolute; right: 10px;
          pointer-events: none; color: rgba(255,255,255,0.3);
        }
        .cp-new-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 14px; border-radius: 8px;
          background: rgba(179,0,0,0.1); border: 1px solid rgba(179,0,0,0.25);
          color: rgba(255,100,100,0.85); font-size: 12px; cursor: pointer;
          font-family: var(--font-sans), sans-serif;
          transition: background 0.15s, transform 0.15s;
          white-space: nowrap;
        }
        .cp-new-btn:hover { background: rgba(179,0,0,0.18); transform: translateY(-1px); }

        /* ── Create period form row ── */
        .cp-row { display: flex; gap: 12px; }

        /* ── Root ── */
        .criteria-root { font-family: var(--font-sans), sans-serif; }

        /* ── Light mode ───────────────────────────────── */
        [data-theme="light"] .banner { background: rgba(0,0,0,0.02); border-color: rgba(0,0,0,0.08); box-shadow: 0 1px 6px rgba(0,0,0,0.05); }
        [data-theme="light"] .banner--empty { border-left-color: rgba(0,0,0,0.18); }
        [data-theme="light"] .banner-text { color: rgba(0,0,0,0.65); }
        [data-theme="light"] .banner-text strong { color: #1a1a1a; }
        [data-theme="light"] .banner-text--muted { color: rgba(0,0,0,0.35); }
        [data-theme="light"] .bf-label { color: rgba(0,0,0,0.4); }
        [data-theme="light"] .bf-input { background: rgba(0,0,0,0.04); border-color: rgba(0,0,0,0.1); color: #1a1a1a; }
        [data-theme="light"] .bact-btn--edit   { background: rgba(0,0,0,0.06); color: rgba(0,0,0,0.65); }
        [data-theme="light"] .bact-btn--cancel { background: rgba(0,0,0,0.04); color: rgba(0,0,0,0.4); }
        [data-theme="light"] .ct-wrap { background: #fff; border-color: rgba(0,0,0,0.08); box-shadow: 0 2px 10px rgba(0,0,0,0.06); }
        [data-theme="light"] .ct-header { border-bottom-color: rgba(0,0,0,0.07); }
        [data-theme="light"] .ct-title { color: rgba(0,0,0,0.4); }
        [data-theme="light"] .ct-total { color: rgba(0,0,0,0.4); }
        [data-theme="light"] .ct-empty { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .ct-th { color: rgba(0,0,0,0.35); }
        [data-theme="light"] .ct-row { border-top-color: rgba(0,0,0,0.05); }
        [data-theme="light"] .ct-row:hover { background: rgba(0,0,0,0.02); }
        [data-theme="light"] .ct-td { color: rgba(0,0,0,0.65); }
        [data-theme="light"] .ct-td--stt { color: rgba(0,0,0,0.25); }
        [data-theme="light"] .ct-weight-val { color: #1a1a1a; }
        [data-theme="light"] .ct-weight-input { background: rgba(0,0,0,0.04); border-color: rgba(0,0,0,0.1); color: #1a1a1a; }
        [data-theme="light"] .ct-icon-btn--cancel { background: rgba(0,0,0,0.04); color: rgba(0,0,0,0.3); }
        [data-theme="light"] .ct-icon-btn--edit   { color: rgba(0,0,0,0.25); }
        [data-theme="light"] .no-period-hint { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .modal-card { background: #fff; border-color: rgba(0,0,0,0.1); box-shadow: 0 8px 32px rgba(0,0,0,0.15); }
        [data-theme="light"] .modal-header { border-bottom-color: rgba(0,0,0,0.07); }
        [data-theme="light"] .modal-title { color: #1a1a1a; }
        [data-theme="light"] .modal-close { border-color: rgba(0,0,0,0.08); color: rgba(0,0,0,0.3); }
        [data-theme="light"] .mf-label { color: rgba(0,0,0,0.4); }
        [data-theme="light"] .mf-input { background: #f7f7f8; border-color: rgba(0,0,0,0.1); color: #1a1a1a; }
        [data-theme="light"] .mf-copy-label { color: rgba(0,0,0,0.6); }
        [data-theme="light"] .mf-btn--cancel { background: rgba(0,0,0,0.06); color: rgba(0,0,0,0.5); }
        [data-theme="light"] .import-file-zone { background: rgba(0,0,0,0.02); border-color: rgba(0,0,0,0.1); }
        [data-theme="light"] .import-file-hint { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .import-table-wrap { border-color: rgba(0,0,0,0.08); }
        [data-theme="light"] .ct-row--editing { background: rgba(179,0,0,0.04) !important; }
        [data-theme="light"] .ct-edit-input { background: rgba(0,0,0,0.04); border-color: rgba(179,0,0,0.35); color: #1a1a1a; }
        [data-theme="light"] .ct-edit-input:focus { background: rgba(179,0,0,0.04); box-shadow: 0 0 0 3px rgba(179,0,0,0.08); }
        [data-theme="light"] .ct-template-btn { background: rgba(0,140,90,0.07); border-color: rgba(0,140,90,0.18); color: rgba(0,120,80,0.9); }
        [data-theme="light"] .ct-template-btn:hover { background: rgba(0,140,90,0.13); color: rgba(0,110,75,1); }
        [data-theme="light"] .ct-import-btn { background: rgba(0,0,0,0.04); border-color: rgba(0,0,0,0.1); color: rgba(0,0,0,0.5); }
        [data-theme="light"] .ct-import-btn:hover { background: rgba(0,0,0,0.07); color: rgba(0,0,0,0.75); }
        [data-theme="light"] .ct-code { background: rgba(0,0,0,0.06); color: rgba(0,0,0,0.5); }
        [data-theme="light"] .ct-type-badge--manual { background: rgba(0,0,0,0.06); color: rgba(0,0,0,0.5); }
        [data-theme="light"] .ct-type-select { background: rgba(0,0,0,0.04); border-color: rgba(0,0,0,0.1); color: rgba(0,0,0,0.7); }
        [data-theme="light"] .ct-type-select option { background: #fff; }
        [data-theme="light"] .cp-period-select { background: rgba(0,0,0,0.04); border-color: rgba(0,0,0,0.1); color: rgba(0,0,0,0.75); }
        [data-theme="light"] .cp-period-select option { background: #fff; }
        [data-theme="light"] .cp-chevron { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .cp-new-btn { background: rgba(179,0,0,0.07); border-color: rgba(179,0,0,0.2); color: rgba(160,0,0,0.85); }
      `}</style>
    </div>
  )
}
