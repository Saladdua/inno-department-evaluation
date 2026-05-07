'use client'

import { useRef, useState, useTransition } from 'react'
import { Upload, Play, FileSpreadsheet, X, CheckCircle2 } from 'lucide-react'
import * as XLSX from 'xlsx'

interface Department { id: string; name: string; code: string }

interface BoxState {
  fileNames: string[]
  files: File[]
  output: string
  processing: boolean
  result: Record<string, number> | null  // parsed scores, keyed by dept CODE
  applyStatus: 'idle' | 'applying' | 'done' | 'error'
  applyMessage: string
}

/* ─── xlsx helpers ─────────────────────────────────────────── */

type Row = Record<string, unknown>

function readWorkbook(file: File): Promise<Row[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        resolve(XLSX.utils.sheet_to_json<Row>(ws, { defval: 0 }))
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })
}

/* Strip diacritics + spaces for loose comparison */
function normalise(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

/* Strip common Vietnamese org-unit prefixes: "Phòng", "Ban", "Xưởng", "Khối" */
function stripDeptPrefix(s: string) {
  return s.replace(/^(ph[oò]ng|ban|xu[oô]ng|kh[oô]i)\s+/iu, '').trim()
}

const COL_DEPT   = 'Tên phòng ban'
const COL_NGHI   = 'Số công nghỉ không lý do'
const COL_VI_PHAM = 'Tổng số lần vi phạm đi muộn về sớm'
const COL_CHUAN  = 'Số công chuẩn tự động tính theo công thức cài đặt'

function findKey(row: Row, target: string): string | undefined {
  const norm = normalise(target)
  return Object.keys(row).find(k => normalise(k) === norm)
}

function num(v: unknown): number {
  const n = Number(v)
  return isNaN(n) ? 0 : n
}

interface FileResult {
  /* department code → A value */
  [deptCode: string]: number
}

function processFile(rows: Row[], departments: Department[]): FileResult {
  // Build column key map from first row
  const sample = rows[0] ?? {}
  const keyDept   = findKey(sample, COL_DEPT)
  const keyNghi   = findKey(sample, COL_NGHI)
  const keyVP     = findKey(sample, COL_VI_PHAM)
  const keyChuan  = findKey(sample, COL_CHUAN)

  const missing: string[] = []
  if (!keyDept)  missing.push(COL_DEPT)
  if (!keyNghi)  missing.push(COL_NGHI)
  if (!keyVP)    missing.push(COL_VI_PHAM)
  if (!keyChuan) missing.push(COL_CHUAN)
  if (missing.length) throw new Error(`Không tìm thấy cột: ${missing.join(', ')}`)

  // Group rows by department — only MAIN rows
  const byDept = new Map<string, Row[]>()
  for (const row of rows) {
    const loai = String(row['Loại dòng'] ?? '').trim()
    if (loai && loai !== 'MAIN') continue

    const rawName  = String(row[keyDept!] ?? '').trim()
    const stripped = stripDeptPrefix(rawName)
    // Try 4 match strategies: raw vs code, raw vs name, stripped vs code, stripped vs name
    const dept = departments.find(d =>
      normalise(d.code) === normalise(rawName)    ||
      normalise(d.name) === normalise(rawName)    ||
      normalise(d.code) === normalise(stripped)   ||
      normalise(d.name) === normalise(stripped),
    )
    if (!dept) continue
    if (!byDept.has(dept.code)) byDept.set(dept.code, [])
    byDept.get(dept.code)!.push(row)
  }

  const result: FileResult = {}
  for (const [code, deptRows] of byDept) {
    const memberCount = deptRows.length
    if (memberCount === 0) continue

    const sumScores = deptRows.reduce((s, r) => {
      const nghi  = num(r[keyNghi!])
      const vp    = num(r[keyVP!])
      const chuan = num(r[keyChuan!])
      if (chuan === 0) return s
      return s + (1 - (nghi * 2 + vp) / (chuan * 2)) * 100
    }, 0)
    const A = sumScores / memberCount
    result[code] = A
  }
  return result
}

/* ─── BangLuongBox ─────────────────────────────────────────── */

function BangLuongBox({
  departments,
  state,
  onFilesChange,
  onProcess,
  onApply,
}: {
  departments: Department[]
  state: BoxState
  onFilesChange: (payload: File[] | { __removeIndex: number }) => void
  onProcess: () => void
  onApply: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="dp-box">
      <div className="dp-box-header">
        <FileSpreadsheet size={16} className="dp-box-icon" />
        <span className="dp-box-title">Bảng lương</span>
        {state.fileNames.length > 0 && (
          <span className="dp-file-count">{state.fileNames.length} file</span>
        )}
      </div>

      <div
        className={`dp-dropzone ${state.fileNames.length > 0 ? 'dp-dropzone--loaded' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault()
          onFilesChange(Array.from(e.dataTransfer.files))
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          multiple
          style={{ display: 'none' }}
          onChange={e => { onFilesChange(Array.from(e.target.files ?? [])); e.target.value = '' }}
        />
        <Upload size={20} className="dp-dropzone-icon" />
        {state.fileNames.length > 0 ? (
          <span className="dp-dropzone-label dp-dropzone-label--loaded">Nhấn để thêm file</span>
        ) : (
          <>
            <span className="dp-dropzone-label">Kéo thả hoặc nhấn để chọn file</span>
            <span className="dp-dropzone-hint">.xlsx · .xls · nhiều file</span>
          </>
        )}
      </div>

      {state.fileNames.length > 0 && (
        <ul className="dp-file-list">
          {state.fileNames.map((name, i) => (
            <li key={i} className="dp-file-item">
              <FileSpreadsheet size={12} className="dp-file-item-icon" />
              <span className="dp-file-item-name">{name}</span>
              <button
                className="dp-file-remove"
                onClick={e => { e.stopPropagation(); onFilesChange({ __removeIndex: i }) }}
                aria-label={`Xoá ${name}`}
              >
                <X size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        className="dp-process-btn"
        disabled={state.fileNames.length === 0 || state.processing}
        onClick={onProcess}
      >
        <Play size={13} />
        {state.processing ? 'Đang xử lí…' : 'Xử lí'}
      </button>

      <div className="dp-output-wrap">
        <label className="dp-output-label">Kết quả</label>
        <textarea
          className="dp-output"
          readOnly
          value={state.output}
          placeholder="Kết quả xử lí sẽ hiển thị ở đây…"
        />
      </div>

      {state.result && (
        <div className="dp-apply-row">
          <button
            className="dp-apply-btn"
            disabled={state.applyStatus === 'applying'}
            onClick={onApply}
          >
            <CheckCircle2 size={13} />
            {state.applyStatus === 'applying' ? 'Đang áp dụng…' : 'Áp dụng vào đánh giá'}
          </button>
          {state.applyMessage && (
            <span className={`dp-apply-msg ${state.applyStatus === 'done' ? 'dp-apply-msg--ok' : 'dp-apply-msg--err'}`}>
              {state.applyMessage}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── TimesheetsBox (placeholder) ─────────────────────────── */

function TimesheetsBox({
  state,
  onFilesChange,
  onProcess,
  onApply,
}: {
  state: BoxState
  onFilesChange: (payload: File[] | { __removeIndex: number }) => void
  onProcess: () => void
  onApply: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="dp-box">
      <div className="dp-box-header">
        <FileSpreadsheet size={16} className="dp-box-icon" />
        <span className="dp-box-title">Timesheets</span>
        {state.fileNames.length > 0 && (
          <span className="dp-file-count">{state.fileNames.length} file</span>
        )}
      </div>

      <div
        className={`dp-dropzone ${state.fileNames.length > 0 ? 'dp-dropzone--loaded' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault()
          onFilesChange(Array.from(e.dataTransfer.files))
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          multiple
          style={{ display: 'none' }}
          onChange={e => { onFilesChange(Array.from(e.target.files ?? [])); e.target.value = '' }}
        />
        <Upload size={20} className="dp-dropzone-icon" />
        {state.fileNames.length > 0 ? (
          <span className="dp-dropzone-label dp-dropzone-label--loaded">Nhấn để thêm file</span>
        ) : (
          <>
            <span className="dp-dropzone-label">Kéo thả hoặc nhấn để chọn file</span>
            <span className="dp-dropzone-hint">.xlsx · .xls · nhiều file</span>
          </>
        )}
      </div>

      {state.fileNames.length > 0 && (
        <ul className="dp-file-list">
          {state.fileNames.map((name, i) => (
            <li key={i} className="dp-file-item">
              <FileSpreadsheet size={12} className="dp-file-item-icon" />
              <span className="dp-file-item-name">{name}</span>
              <button
                className="dp-file-remove"
                onClick={e => { e.stopPropagation(); onFilesChange({ __removeIndex: i }) }}
                aria-label={`Xoá ${name}`}
              >
                <X size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        className="dp-process-btn"
        disabled={state.fileNames.length === 0 || state.processing}
        onClick={onProcess}
      >
        <Play size={13} />
        {state.processing ? 'Đang xử lí…' : 'Xử lí'}
      </button>

      <div className="dp-output-wrap">
        <label className="dp-output-label">Kết quả</label>
        <textarea
          className="dp-output"
          readOnly
          value={state.output}
          placeholder="Kết quả xử lí sẽ hiển thị ở đây…"
        />
      </div>

      {state.result && (
        <div className="dp-apply-row">
          <button
            className="dp-apply-btn"
            disabled={state.applyStatus === 'applying'}
            onClick={onApply}
          >
            <CheckCircle2 size={13} />
            {state.applyStatus === 'applying' ? 'Đang áp dụng…' : 'Áp dụng vào đánh giá'}
          </button>
          {state.applyMessage && (
            <span className={`dp-apply-msg ${state.applyStatus === 'done' ? 'dp-apply-msg--ok' : 'dp-apply-msg--err'}`}>
              {state.applyMessage}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── Root ─────────────────────────────────────────────────── */

export default function DataProcessingClient({
  departments,
  currentPeriodId,
  periodLabel,
}: {
  departments: Department[]
  currentPeriodId: string | null
  periodLabel: string | null
}) {
  const emptyState = (): BoxState => ({
    fileNames: [], files: [], output: '', processing: false,
    result: null, applyStatus: 'idle', applyMessage: '',
  })
  const [bangLuong, setBangLuong] = useState<BoxState>(emptyState)
  const [timesheets, setTimesheets] = useState<BoxState>(emptyState)
  const [isPending, startTransition] = useTransition()

  const handleFilesChange = (
    setter: React.Dispatch<React.SetStateAction<BoxState>>,
    payload: File[] | { __removeIndex: number },
  ) => {
    if ('__removeIndex' in payload) {
      setter(prev => {
        const fileNames = prev.fileNames.filter((_, i) => i !== payload.__removeIndex)
        const files     = prev.files.filter((_, i)     => i !== payload.__removeIndex)
        return { ...prev, fileNames, files, output: '' }
      })
      return
    }
    // deduplicate by name
    setter(prev => {
      const existingNames = new Set(prev.fileNames)
      const newFiles = (payload as File[]).filter(f => !existingNames.has(f.name))
      return {
        ...prev,
        fileNames: [...prev.fileNames, ...newFiles.map(f => f.name)],
        files:     [...prev.files, ...newFiles],
        output: '',
      }
    })
  }

  const handleBangLuongProcess = () => {
    setBangLuong(prev => ({ ...prev, processing: true, output: '', result: null, applyStatus: 'idle', applyMessage: '' }))
    startTransition(async () => {
      try {
        const fileResults: FileResult[] = await Promise.all(
          bangLuong.files.map(async f => {
            const rows = await readWorkbook(f)
            return processFile(rows, departments)
          }),
        )

        const allCodes = new Set(fileResults.flatMap(r => Object.keys(r)))

        // B = average A across files, rounded to integer
        const rounded: Record<string, number> = {}
        for (const code of allCodes) {
          const As = fileResults.map(r => r[code] ?? 0)
          const B = As.reduce((s, a) => s + a, 0) / fileResults.length
          rounded[code] = Math.round(B)
        }

        setBangLuong(prev => ({
          ...prev,
          processing: false,
          result: rounded,
          output: JSON.stringify(rounded, null, 2),
        }))
      } catch (err) {
        setBangLuong(prev => ({
          ...prev,
          processing: false,
          output: `Lỗi: ${err instanceof Error ? err.message : String(err)}`,
        }))
      }
    })
  }

  const handleApply = (
    source: 'bang_luong' | 'timesheets',
    result: Record<string, number>,
    setter: React.Dispatch<React.SetStateAction<BoxState>>,
  ) => {
    if (!currentPeriodId) {
      setter(prev => ({ ...prev, applyStatus: 'error', applyMessage: 'Không tìm thấy kỳ đánh giá hiện tại' }))
      return
    }
    setter(prev => ({ ...prev, applyStatus: 'applying', applyMessage: '' }))

    // Convert code → deptId
    const scores = Object.entries(result).flatMap(([code, score]) => {
      const dept = departments.find(
        d => d.code === code || d.name === code,
      )
      return dept ? [{ deptId: dept.id, score }] : []
    })

    startTransition(async () => {
      try {
        const res = await fetch('/api/data-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ periodId: currentPeriodId, source, scores }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Lỗi không xác định')
        setter(prev => ({
          ...prev,
          applyStatus: 'done',
          applyMessage: data.updated > 0
            ? `Đã cập nhật ${data.updated} bản ghi điểm`
            : (data.message ?? 'Không có đánh giá nào để cập nhật'),
        }))
      } catch (err) {
        setter(prev => ({
          ...prev,
          applyStatus: 'error',
          applyMessage: err instanceof Error ? err.message : String(err),
        }))
      }
    })
  }

  const handleTimesheetsProcess = () => {
    setTimesheets(prev => ({ ...prev, processing: true, output: '', result: null, applyStatus: 'idle', applyMessage: '' }))
    setTimeout(() => {
      setTimesheets(prev => ({
        ...prev,
        processing: false,
        result: {},  // empty result still shows apply button as placeholder
        output: 'Chức năng đang được phát triển. Vui lòng thử lại sau.',
      }))
    }, 800)
  }

  return (
    <div className="dp-root">
      <div className="dp-intro">
        <p className="dp-intro-text">
          Tải lên file Excel để xử lí dữ liệu tự động. Chức năng Timesheets đang được phát triển.
          {periodLabel && <> · Kỳ hiện tại: <strong>{periodLabel}</strong></>}
        </p>
      </div>

      <div className="dp-grid">
        <BangLuongBox
          departments={departments}
          state={bangLuong}
          onFilesChange={p => handleFilesChange(setBangLuong, p)}
          onProcess={handleBangLuongProcess}
          onApply={() => bangLuong.result && handleApply('bang_luong', bangLuong.result, setBangLuong)}
        />
        <TimesheetsBox
          state={timesheets}
          onFilesChange={p => handleFilesChange(setTimesheets, p)}
          onProcess={handleTimesheetsProcess}
          onApply={() => timesheets.result && handleApply('timesheets', timesheets.result, setTimesheets)}
        />
      </div>

      <style>{`
        .dp-root {
          display: flex;
          flex-direction: column;
          gap: 24px;
          animation: dpFadeIn 0.3s ease both;
        }
        @keyframes dpFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .dp-intro-text {
          font-size: 13px;
          color: rgba(255,255,255,0.35);
          font-style: italic;
        }

        .dp-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 20px;
        }

        /* ── Box ── */
        .dp-box {
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding: 20px;
          border-radius: 12px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
        }

        .dp-box-header {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .dp-box-icon { color: #22c55e; flex-shrink: 0; }
        .dp-box-title {
          font-size: 14px;
          font-weight: 600;
          color: rgba(255,255,255,0.85);
          letter-spacing: 0.01em;
          flex: 1;
        }
        .dp-file-count {
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 20px;
          background: rgba(34,197,94,0.12);
          color: #22c55e;
          font-weight: 600;
          letter-spacing: 0.03em;
        }

        /* ── Dropzone ── */
        .dp-dropzone {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 22px 16px;
          border-radius: 8px;
          border: 1.5px dashed rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.02);
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
          min-height: 90px;
          text-align: center;
        }
        .dp-dropzone:hover {
          border-color: rgba(179,0,0,0.4);
          background: rgba(179,0,0,0.04);
        }
        .dp-dropzone--loaded {
          border-color: rgba(34,197,94,0.25);
          background: rgba(34,197,94,0.02);
        }
        .dp-dropzone-icon { color: rgba(255,255,255,0.2); }
        .dp-dropzone--loaded .dp-dropzone-icon { color: rgba(34,197,94,0.5); }
        .dp-dropzone-label {
          font-size: 12.5px;
          color: rgba(255,255,255,0.4);
        }
        .dp-dropzone-label--loaded {
          color: rgba(34,197,94,0.6);
          font-size: 12px;
        }
        .dp-dropzone-hint {
          font-size: 11px;
          color: rgba(255,255,255,0.2);
          font-style: italic;
        }

        /* ── File list ── */
        .dp-file-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 4px;
          max-height: 160px;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.1) transparent;
        }
        .dp-file-item {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 6px 10px;
          border-radius: 6px;
          background: rgba(34,197,94,0.06);
          border: 1px solid rgba(34,197,94,0.12);
        }
        .dp-file-item-icon { color: #22c55e; flex-shrink: 0; }
        .dp-file-item-name {
          flex: 1;
          font-size: 12px;
          color: rgba(255,255,255,0.7);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .dp-file-remove {
          width: 18px; height: 18px;
          border-radius: 4px;
          border: none;
          background: transparent;
          color: rgba(255,255,255,0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
          padding: 0;
          transition: color 0.15s, background 0.15s;
        }
        .dp-file-remove:hover {
          color: #ff4444;
          background: rgba(255,50,50,0.1);
        }

        /* ── Process button ── */
        .dp-process-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 9px 0;
          border-radius: 8px;
          border: none;
          background: #B30000;
          color: #fff;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.03em;
          cursor: pointer;
          transition: background 0.15s, opacity 0.15s;
        }
        .dp-process-btn:hover:not(:disabled) { background: #cc0000; }
        .dp-process-btn:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }

        /* ── Output ── */
        .dp-output-wrap {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .dp-output-label {
          font-size: 11px;
          color: rgba(255,255,255,0.3);
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .dp-output {
          width: 100%;
          min-height: 140px;
          resize: vertical;
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.07);
          background: rgba(0,0,0,0.25);
          color: rgba(255,255,255,0.7);
          font-size: 12.5px;
          font-family: 'Consolas', 'Monaco', monospace;
          line-height: 1.6;
          outline: none;
        }
        .dp-output::placeholder { color: rgba(255,255,255,0.18); font-style: italic; }

        /* ── Apply button ── */
        .dp-apply-row {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .dp-apply-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border-radius: 8px;
          border: none;
          background: rgba(34,197,94,0.15);
          color: #22c55e;
          border: 1px solid rgba(34,197,94,0.25);
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s, opacity 0.15s;
          letter-spacing: 0.02em;
        }
        .dp-apply-btn:hover:not(:disabled) { background: rgba(34,197,94,0.22); }
        .dp-apply-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .dp-apply-msg {
          font-size: 12px;
          font-style: italic;
        }
        .dp-apply-msg--ok { color: #22c55e; }
        .dp-apply-msg--err { color: #f87171; }

        /* ── Light mode ── */
        [data-theme="light"] .dp-intro-text { color: rgba(0,0,0,0.4); }
        [data-theme="light"] .dp-box { background: #fff; border-color: rgba(0,0,0,0.08); }
        [data-theme="light"] .dp-box-title { color: rgba(0,0,0,0.8); }
        [data-theme="light"] .dp-dropzone { border-color: rgba(0,0,0,0.12); background: rgba(0,0,0,0.02); }
        [data-theme="light"] .dp-dropzone:hover { border-color: rgba(179,0,0,0.35); background: rgba(179,0,0,0.03); }
        [data-theme="light"] .dp-dropzone--loaded { border-color: rgba(34,197,94,0.3); background: rgba(34,197,94,0.03); }
        [data-theme="light"] .dp-dropzone-icon { color: rgba(0,0,0,0.2); }
        [data-theme="light"] .dp-dropzone-label { color: rgba(0,0,0,0.45); }
        [data-theme="light"] .dp-dropzone-hint { color: rgba(0,0,0,0.25); }
        [data-theme="light"] .dp-file-item { background: rgba(34,197,94,0.06); border-color: rgba(34,197,94,0.15); }
        [data-theme="light"] .dp-file-item-name { color: rgba(0,0,0,0.65); }
        [data-theme="light"] .dp-file-remove { color: rgba(0,0,0,0.25); }
        [data-theme="light"] .dp-output-label { color: rgba(0,0,0,0.35); }
        [data-theme="light"] .dp-output {
          background: rgba(0,0,0,0.03);
          border-color: rgba(0,0,0,0.1);
          color: rgba(0,0,0,0.7);
        }
        [data-theme="light"] .dp-output::placeholder { color: rgba(0,0,0,0.25); }
      `}</style>
    </div>
  )
}
