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
type SheetRow = (string | number | boolean | null | undefined)[]

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

function readWorkbookRaw(file: File): Promise<SheetRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        resolve(XLSX.utils.sheet_to_json<SheetRow>(ws, { header: 1, defval: null }) as SheetRow[])
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
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/\s+/g, '')
    .toLowerCase()
}

/* Normalise a dept code: strips diacritics/spaces then removes leading zeros
   from every digit group so "AS08" == "AS8", "SS02" == "SS2", "AS10" == "AS10" */
function normaliseCode(s: string) {
  return normalise(s).replace(/(\d+)/g, m => String(parseInt(m, 10)))
}

/* Match a raw code string against the departments list.
   Two-pass: exact normaliseCode match first, then if the code ends in "1"
   (e.g. MEP01 → mep1) retry without the trailing "1" (→ mep) so that
   codes like MEP01 match MEP. Codes ending in 2+ (MEP2) are unaffected. */
function matchDeptByCode(rawCode: string, departments: Department[]): Department | undefined {
  const nc = normaliseCode(rawCode)
  const exact = departments.find(d => normaliseCode(d.code) === nc || normalise(d.name) === normalise(rawCode))
  if (exact) return exact
  if (nc.endsWith('1') && nc.length > 1) {
    const base = nc.slice(0, -1)
    return departments.find(d => normaliseCode(d.code) === base)
  }
  return undefined
}

/* Strip common Vietnamese org-unit prefixes: "Phòng", "Ban", "Xưởng", "Khối" */
function stripDeptPrefix(s: string) {
  return s.replace(/^(ph[oò]ng|ban|xu[oô]ng|kh[oô]i)\s+/iu, '').trim()
}

/* ─── Timesheet helpers ─────────────────────────────────────── */

const TS_LEAVE_TYPES = ['NTC', 'CKH', 'DL', 'NKH', 'DT', 'KL', 'O', 'P', 'T', 'NTN', 'TS', 'TSN', 'NTS']

interface TSAccum {
  congChuan: number
  congLe:    number
  congNghi:  number
  tongGio:   number
}

type TSFileResult = Record<string, TSAccum>

// Extract dept name from section header like "─ ─ ─ ─  2.1.2.29 .Phòng AS1" → "Phòng AS1"
// Format is: [dashes] [double-space] [number] [space] [.] [DeptName]
function extractDeptName(header: string): string {
  // Look for " ." (space then period) — the separator before dept name
  const spaceDot = header.lastIndexOf(' .')
  if (spaceDot !== -1) return header.slice(spaceDot + 2).trim()
  // Fallback: everything after double space
  const dbl = header.lastIndexOf('  ')
  if (dbl !== -1) return header.slice(dbl).trim()
  return header.trim()
}

// Aggressive key for timesheet dept matching: strip all non-alphanumeric
function normKey(s: string) {
  return s.normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
}

function matchDeptTS(name: string, departments: Department[]): Department | undefined {
  const nk  = normKey(name)
  const nks = normKey(stripDeptPrefix(name))
  return departments.find(d => {
    const dn = normKey(d.name)
    const dc = normKey(d.code)
    const ds = normKey(stripDeptPrefix(d.name))
    return (
      dn === nk || dc === nk ||
      dn === nks || dc === nks || ds === nks ||
      // endsWith prevents "as1" from matching "as10" / "as11"
      (nks.length > 3 && (dn.endsWith(nks) || nks.endsWith(dn))) ||
      (nks.length > 3 && (ds.endsWith(nks) || nks.endsWith(ds)))
    )
  })
}

function numVal(row: SheetRow, idx: number): number {
  if (idx < 0 || idx >= row.length) return 0
  const n = Number(row[idx])
  return isNaN(n) ? 0 : n
}

function parseTimesheetFile(
  rows: SheetRow[],
  departments: Department[],
): { result: TSFileResult; unmatched: string[] } {
  if (rows.length < 4) return { result: {}, unmatched: [] }

  // Row 2 (index 1): contains "Công chuẩn"
  const headerR1 = (rows[1] ?? []).map(c => normalise(String(c ?? '')))
  const colCC = headerR1.indexOf(normalise('Công chuẩn'))
  if (colCC < 0) throw new Error('Không tìm thấy cột "Công chuẩn"')

  // Row 3 (index 2): date pattern cells tell us the daily attendance range
  // Daily columns start at J (index 9); scan forward for DD/MM formatted cells
  const rawRow3 = rows[2] ?? []
  let dailyCount = 0
  for (let c = 9; c < rawRow3.length; c++) {
    if (/^\d{1,2}\/\d{1,2}$/.test(String(rawRow3[c] ?? '').trim())) {
      dailyCount++
    } else if (dailyCount > 0) {
      break  // hit non-date after date run → end of daily section
    }
  }
  const monthDays = dailyCount > 0 ? dailyCount : 31

  // Công lễ column: BU (index 72) for Jan/Mar (31 days), BR (index 69) for Feb (28 days)
  const colCL = monthDays === 28 ? 69 : 72

  // Leave-type columns: find NTC…NTS anywhere in row 3 headers (shifts with month)
  const headerR3norm = rawRow3.map(c => normalise(String(c ?? '')))
  const colLTs = TS_LEAVE_TYPES.map(lt => headerR3norm.indexOf(normalise(lt))).filter(i => i >= 0)

  const deptEmp   = new Map<string, Map<string, TSAccum>>()
  const unmatched: string[] = []
  let curDept: string | null = null

  for (let i = 3; i < rows.length; i++) {
    const row = rows[i] ?? []
    const c0  = String(row[0] ?? '').trim()
    const c2  = String(row[2] ?? '').trim()  // Mã NV

    if (!c0 && !c2) continue

    if (c0 && !c2) {
      const deptName = extractDeptName(c0)
      const dept = matchDeptTS(deptName, departments)
      if (dept) {
        curDept = dept.code
        if (!deptEmp.has(dept.code)) deptEmp.set(dept.code, new Map())
      } else {
        if (!unmatched.includes(deptName)) unmatched.push(deptName)
        curDept = null
      }
      continue
    }

    if (!curDept || !c2) continue

    const acc: TSAccum = {
      congChuan: numVal(row, colCC),
      congLe:    numVal(row, colCL),                                    // SUM(BU) or SUM(BR) for Feb
      congNghi:  colLTs.reduce((s, idx) => s + numVal(row, idx), 0),   // SUM(AZ:BL)
      tongGio:   0,                                                      // from BC Timesheet
    }

    const empMap = deptEmp.get(curDept)!
    const prev   = empMap.get(c2)
    if (prev) {
      prev.congChuan += acc.congChuan
      prev.congLe    += acc.congLe
      prev.congNghi  += acc.congNghi
    } else {
      empMap.set(c2, acc)
    }
  }

  const result: TSFileResult = {}
  for (const [code, empMap] of deptEmp) {
    const totals: TSAccum = { congChuan: 0, congLe: 0, congNghi: 0, tongGio: 0 }
    for (const emp of empMap.values()) {
      totals.congChuan += emp.congChuan
      totals.congLe    += emp.congLe
      totals.congNghi  += emp.congNghi
    }
    result[code] = totals
  }

  return { result, unmatched }
}

// Detect BC Timesheet template: col 0 = "Phòng ban", col 1 = "Số giờ khai timesheet"
function isBCTimesheetFormat(rows: SheetRow[]): boolean {
  if (rows.length < 2) return false
  const h0 = (rows[0] ?? []).map(c => normKey(String(c ?? '')))
  return h0[0] === normKey('Phòng ban') &&
    h0.slice(1, 6).some(v => v.includes('sogio') || v.startsWith('thoigian'))
}

// Parse BC Timesheet template: (Phòng ban | Số giờ khai timesheet)
function parseTSheetBC(
  rows: SheetRow[],
  departments: Department[],
): { result: TSFileResult; unmatched: string[] } {
  if (rows.length < 2) return { result: {}, unmatched: [] }
  const h0 = (rows[0] ?? []).map(c => normKey(String(c ?? '')))
  const colHrs = h0.findIndex(v => v.includes('sogio') || v.startsWith('thoigian'))
  if (colHrs < 0) throw new Error('Không tìm thấy cột "Số giờ khai timesheet" trong file BC Timesheet')

  const hoursPerDept: Record<string, number> = {}
  const unmatched: string[] = []
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    const deptRaw = String(row[0] ?? '').trim()
    if (!deptRaw) continue
    const dept = matchDeptTS(deptRaw, departments)
    if (!dept) {
      if (!unmatched.includes(deptRaw)) unmatched.push(deptRaw)
      continue
    }
    hoursPerDept[dept.code] = (hoursPerDept[dept.code] ?? 0) + Number(row[colHrs] || 0)
  }

  const result: TSFileResult = {}
  for (const [code, hours] of Object.entries(hoursPerDept)) {
    result[code] = { congChuan: 0, congLe: 0, congNghi: 0, tongGio: hours }
  }
  return { result, unmatched }
}

interface TSScoreDetail {
  score: number
  t: number  // Giờ làm việc thực tế trong quý = (cc - cl - cn) × 8
  u: number  // Số giờ khai timesheet
}

// score = min(100, u / t × 100)  where t = (Σcc − Σcl − Σcn) × 8
function computeTimesheetScores(fileResults: TSFileResult[]): {
  scores: Record<string, number>
  details: Record<string, TSScoreDetail>
} {
  const allCodes = new Set(fileResults.flatMap(r => Object.keys(r)))
  const scores:  Record<string, number>        = {}
  const details: Record<string, TSScoreDetail> = {}
  for (const code of allCodes) {
    let cc = 0, cl = 0, cn = 0, tg = 0
    for (const fr of fileResults) {
      const a = fr[code]
      if (!a) continue
      cc += a.congChuan
      cl += a.congLe
      cn += a.congNghi
      tg += a.tongGio
    }
    const d = cc - cl - cn
    if (d <= 0) continue
    const t = d * 8
    scores[code]  = Math.min(100, Math.round((tg / t) * 100))
    details[code] = { score: scores[code], t, u: tg }
  }
  return { scores, details }
}

// ── Debug: dump raw extraction from one Bang-cham-cong file ──────────────
function debugTimesheetFile(rows: SheetRow[], departments: Department[]): string {
  const out: string[] = []

  if (rows.length < 4) return 'File quá ngắn (< 4 dòng)'

  // ── Column detection ──
  const headerR1 = (rows[1] ?? []).map(c => normalise(String(c ?? '')))
  const colCC = headerR1.indexOf(normalise('Công chuẩn'))

  const rawRow3 = rows[2] ?? []
  let dailyStart = -1
  let dailyCount = 0
  for (let c = 0; c < rawRow3.length; c++) {
    if (/^\d{1,2}\/\d{1,2}$/.test(String(rawRow3[c] ?? '').trim())) {
      if (dailyStart < 0) dailyStart = c
      dailyCount++
    } else if (dailyCount > 0) break
  }
  const monthDays = dailyCount > 0 ? dailyCount : 31
  // Công lễ column: BU (index 72) for 31-day months, BR (index 69) for February (28 days)
  const colCL = monthDays === 28 ? 69 : 72

  const headerR3norm = rawRow3.map(c => normalise(String(c ?? '')))
  const colLTsMap = TS_LEAVE_TYPES.map(lt => ({ lt, idx: headerR3norm.indexOf(normalise(lt)) })).filter(x => x.idx >= 0)

  // Excel column letter helper
  const colLetter = (i: number) => {
    let s = ''
    for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s
    return s
  }

  out.push('=== PHÁT HIỆN CỘT ===')
  out.push(`Row 2 header (${headerR1.length} cột) — mẫu: ${headerR1.slice(0, 5).join(' | ')} ...`)
  out.push(`Cột Công chuẩn: ${colCC >= 0 ? `index ${colCC} (${colLetter(colCC)})` : 'KHÔNG TÌM THẤY ⚠'}`)
  out.push(`Cột Công lễ: index ${colCL} (${colLetter(colCL)}) — ${monthDays === 28 ? 'BR (tháng 2)' : 'BU (tháng 31 ngày)'}`)
  out.push(`Ngày làm việc: ${monthDays} ngày, cột ${colLetter(dailyStart >= 0 ? dailyStart : 9)} → ${colLetter((dailyStart >= 0 ? dailyStart : 9) + monthDays - 1)}`)
  out.push(`Cột nghỉ phép: ${colLTsMap.map(x => `${x.lt}=${colLetter(x.idx)}`).join('  ') || 'KHÔNG TÌM THẤY ⚠'}`)
  out.push('')

  // ── Dept + employee scan ──
  out.push('=== PHÒNG BAN & NHÂN VIÊN ===')
  let curDeptLabel = ''
  let curDeptCode  = ''
  let deptIdx      = 0
  const deptTotals: Record<string, TSAccum & { empCount: number }> = {}

  const flushDept = () => {
    if (!curDeptCode || !deptTotals[curDeptCode]) return
    const t = deptTotals[curDeptCode]
    out.push(`  → Tổng phòng (${t.empCount} NV): Chuẩn=${t.congChuan}  Lễ=${t.congLe}  Nghỉ=${t.congNghi}`)
  }

  for (let i = 3; i < rows.length; i++) {
    const row = rows[i] ?? []
    const c0  = String(row[0] ?? '').trim()
    const c2  = String(row[2] ?? '').trim()

    if (!c0 && !c2) continue

    if (c0 && !c2) {
      flushDept()
      deptIdx++
      const deptName = extractDeptName(c0)
      const dept     = matchDeptTS(deptName, departments)
      curDeptLabel   = deptName
      curDeptCode    = dept?.code ?? ''
      out.push('')
      if (dept) {
        out.push(`[${deptIdx}] "${c0}"`)
        out.push(`     → extractDeptName: "${deptName}"  KHỚP: ${dept.code} (${dept.name})`)
        if (!deptTotals[dept.code]) deptTotals[dept.code] = { congChuan: 0, congLe: 0, congNghi: 0, tongGio: 0, empCount: 0 }
      } else {
        out.push(`[${deptIdx}] "${c0}"`)
        out.push(`     → extractDeptName: "${deptName}"  KHÔNG KHỚP ⚠`)
      }
      continue
    }

    if (!curDeptCode || !c2) continue

    const congChuan = numVal(row, colCC)
    const congLe    = numVal(row, colCL)
    const congNghi  = colLTsMap.reduce((s, x) => s + numVal(row, x.idx), 0)

    out.push(`     NV ${c2}: Chuẩn=${congChuan}  Lễ=${congLe} (col ${colLetter(colCL)})  Nghỉ=${congNghi}`)

    const t = deptTotals[curDeptCode]
    t.congChuan += congChuan
    t.congLe    += congLe
    t.congNghi  += congNghi
    t.empCount  += 1
  }
  flushDept()

  if (!curDeptLabel) out.push('Không tìm thấy dòng phòng ban nào ⚠')

  return out.join('\n')
}

/* ─── DebugBox ──────────────────────────────────────────────── */

function DebugBox({ departments }: { departments: Department[] }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [file, setFile]         = useState<File | null>(null)
  const [output, setOutput]     = useState('')
  const [busy, setBusy]         = useState(false)

  const run = async () => {
    if (!file) return
    setBusy(true)
    try {
      const rows = await readWorkbookRaw(file)
      setOutput(debugTimesheetFile(rows, departments))
    } catch (e) {
      setOutput(`Lỗi: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dp-box" style={{ borderColor: 'rgba(234,179,8,0.25)', background: 'rgba(234,179,8,0.03)' }}>
      <div className="dp-box-header">
        <FileSpreadsheet size={16} style={{ color: '#eab308' }} />
        <span className="dp-box-title" style={{ color: 'rgba(234,179,8,0.85)' }}>Kiểm tra cấu trúc Bang-cham-cong</span>
        <span style={{ fontSize: 11, color: 'rgba(234,179,8,0.5)', fontStyle: 'italic' }}>tạm thời</span>
      </div>

      <div
        className={`dp-dropzone ${fileName ? 'dp-dropzone--loaded' : ''}`}
        style={{ borderColor: 'rgba(234,179,8,0.2)' }}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault()
          const f = e.dataTransfer.files[0]
          if (f) { setFile(f); setFileName(f.name); setOutput('') }
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: 'none' }}
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) { setFile(f); setFileName(f.name); setOutput('') }
            e.target.value = ''
          }}
        />
        <Upload size={20} className="dp-dropzone-icon" />
        {fileName
          ? <span className="dp-dropzone-label dp-dropzone-label--loaded">{fileName}</span>
          : <><span className="dp-dropzone-label">Chọn 1 file Bang-cham-cong</span><span className="dp-dropzone-hint">.xlsx · .xls</span></>
        }
      </div>

      <button className="dp-process-btn" style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308' }} disabled={!file || busy} onClick={run}>
        <Play size={13} />
        {busy ? 'Đang phân tích…' : 'Phân tích cấu trúc'}
      </button>

      {output && (
        <div className="dp-output-wrap">
          <label className="dp-output-label">Cấu trúc thô</label>
          <textarea className="dp-output" readOnly value={output} style={{ minHeight: 320, fontSize: 11, fontFamily: 'monospace' }} />
        </div>
      )}
    </div>
  )
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

/* ─── NoiQuyBox ─────────────────────────────────────────── */

function NoiQuyBox({
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
        <span className="dp-box-title">Tuân thủ nội quy</span>
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

      {state.fileNames.length === 0 && (
        <p className="dp-ts-hint">Upload <strong>3 file Noi-quy-cong-ty-moi</strong></p>
      )}

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

      {state.fileNames.length === 0 && (
        <p className="dp-ts-hint">Upload <strong>3 file Bang-cham-cong</strong> và <strong>1 file BC Timesheet</strong> (tự nhập)</p>
      )}

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

/* ─── MKT Import helpers ────────────────────────────────────── */

function parseMktScoreCsv(
  text: string,
  departments: Department[],
): { result: Record<string, number>; unmatched: string[]; lines: string[] } {
  const clean = text.replace(/^﻿/, '')

  // RFC-4180-lite: handles quoted fields (scores use comma as decimal sep)
  const parseRow = (line: string): string[] => {
    const cells: string[] = []
    let field = ''
    let inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { inQuote = !inQuote; continue }
      if (ch === ',' && !inQuote) { cells.push(field.trim()); field = ''; continue }
      field += ch
    }
    cells.push(field.trim())
    return cells
  }

  const rawLines = clean.split(/\r?\n/).filter(r => r.trim())
  if (rawLines.length < 2) throw new Error('File CSV quá ngắn')

  const header = parseRow(rawLines[0])
  const colScore = header.findIndex(h => normalise(h) === normalise('Xếp hạng điểm'))
  if (colScore < 0) throw new Error('Không tìm thấy cột "Xếp hạng điểm" trong file')

  const result: Record<string, number> = {}
  const unmatched: string[] = []
  const lines: string[] = [`Cột điểm: "${header[colScore]}"`, '']

  for (let i = 1; i < rawLines.length; i++) {
    const row = parseRow(rawLines[i])
    const code = row[0]?.trim()
    if (!code) continue

    const dept = matchDeptByCode(code, departments)
    if (!dept) { if (!unmatched.includes(code)) unmatched.push(code); continue }

    // Vietnamese decimal: "100,00" → 100.00
    const rawScore = (row[colScore] ?? '').replace(',', '.')
    const score = parseFloat(rawScore)
    if (isNaN(score)) continue

    result[dept.code ?? code] = Math.max(0, Math.min(100, score))
    lines.push(`${dept.code ?? code}: ${score.toFixed(2)}đ`)
  }

  if (unmatched.length > 0) lines.push('', `⚠ Không khớp (${unmatched.length}):`, ...unmatched.map(u => `  - ${u}`))
  return { result, unmatched, lines }
}

/* ─── MktImportBox ──────────────────────────────────────────── */

function MktImportBox({
  state,
  onFileChange,
  onProcess,
  onApply,
}: {
  state: BoxState
  onFileChange: (f: File | null) => void
  onProcess: () => void
  onApply: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const fileName = state.fileNames[0] ?? ''

  return (
    <div className="dp-box" style={{ borderColor: 'rgba(179,0,0,0.2)', background: 'rgba(179,0,0,0.02)' }}>
      <div className="dp-box-header">
        <FileSpreadsheet size={16} style={{ color: '#f87171' }} />
        <span className="dp-box-title" style={{ color: 'rgba(252,165,165,0.9)' }}>Import điểm MKT</span>
        {fileName && <span className="dp-file-count" style={{ background: 'rgba(179,0,0,0.15)', color: '#f87171' }}>1 file</span>}
      </div>

      <div
        className={`dp-dropzone ${fileName ? 'dp-dropzone--loaded' : ''}`}
        style={{ borderColor: fileName ? 'rgba(179,0,0,0.35)' : undefined }}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault()
          const f = e.dataTransfer.files[0]
          if (f) onFileChange(f)
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          style={{ display: 'none' }}
          onChange={e => { onFileChange(e.target.files?.[0] ?? null); e.target.value = '' }}
        />
        <Upload size={20} className="dp-dropzone-icon" />
        {fileName
          ? <span className="dp-dropzone-label dp-dropzone-label--loaded">{fileName}</span>
          : <>
              <span className="dp-dropzone-label">Kéo thả hoặc nhấn để chọn file</span>
              <span className="dp-dropzone-hint">.csv · cột: Nhóm, Xếp hạng điểm</span>
            </>
        }
      </div>

      {!fileName && (
        <p className="dp-ts-hint">Liên hệ <strong>bộ phận Marketing</strong> để lấy file dữ liệu</p>
      )}

      <button
        className="dp-process-btn"
        style={{ background: 'rgba(179,0,0,0.8)' }}
        disabled={!fileName || state.processing}
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
            style={{ background: 'rgba(179,0,0,0.12)', color: '#f87171', borderColor: 'rgba(179,0,0,0.25)' }}
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

/* ─── Đào tạo helpers ──────────────────────────────────────── */

function parseDaoTaoCsv(
  text: string,
  departments: Department[],
): { result: Record<string, number>; unmatched: string[]; lines: string[] } {
  // Strip BOM
  const clean = text.replace(/^﻿/, '')
  const rows = clean.split(/\r?\n/).map(r => r.split(',').map(c => c.trim()))
  if (rows.length < 2) throw new Error('File CSV quá ngắn')

  const header = rows[0].map(h => normalise(h))
  const colDept  = header.indexOf(normalise('Phòng ban'))
  if (colDept < 0) throw new Error('Không tìm thấy cột "Phòng ban"')

  // Match any column whose header starts with "diem" (e.g. "Điểm quý 1")
  const colScore = header.findIndex(h => h.startsWith(normalise('Điểm')) || h.startsWith('diem'))
  if (colScore < 0) throw new Error('Không tìm thấy cột điểm (phải bắt đầu bằng "Điểm")')

  const result: Record<string, number> = {}
  const unmatched: string[] = []
  const lines: string[] = [`Cột: "${rows[0][colDept]}" → "${rows[0][colScore]}"`, '']

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length < 2) continue
    const rawCode = row[colDept] ?? ''
    if (!rawCode) continue
    const score = parseFloat(row[colScore] ?? '')
    if (isNaN(score)) continue

    const dept = departments.find(
      d => normaliseCode(d.code) === normaliseCode(rawCode) || normalise(d.name) === normalise(rawCode),
    )
    if (!dept) {
      if (!unmatched.includes(rawCode)) unmatched.push(rawCode)
      continue
    }
    result[dept.code] = Math.max(0, Math.min(100, score))
    lines.push(`${dept.code}: ${score.toFixed(2)}đ`)
  }

  if (unmatched.length > 0) {
    lines.push('', `⚠ Không khớp (${unmatched.length}):`, ...unmatched.map(u => `  - ${u}`))
  }

  return { result, unmatched, lines }
}

/* ─── DaoTaoBox ─────────────────────────────────────────────── */

function DaoTaoBox({
  departments,
  state,
  onFileChange,
  onProcess,
  onApply,
}: {
  departments: Department[]
  state: BoxState
  onFileChange: (f: File | null) => void
  onProcess: () => void
  onApply: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const fileName = state.fileNames[0] ?? ''

  return (
    <div className="dp-box" style={{ borderColor: 'rgba(99,102,241,0.2)', background: 'rgba(99,102,241,0.02)' }}>
      <div className="dp-box-header">
        <FileSpreadsheet size={16} style={{ color: '#818cf8' }} />
        <span className="dp-box-title" style={{ color: 'rgba(165,180,252,0.9)' }}>Điểm đào tạo</span>
        {fileName && <span className="dp-file-count" style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>1 file</span>}
      </div>

      <div
        className={`dp-dropzone ${fileName ? 'dp-dropzone--loaded' : ''}`}
        style={{ borderColor: fileName ? 'rgba(99,102,241,0.3)' : undefined }}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault()
          const f = e.dataTransfer.files[0]
          if (f) onFileChange(f)
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          style={{ display: 'none' }}
          onChange={e => { onFileChange(e.target.files?.[0] ?? null); e.target.value = '' }}
        />
        <Upload size={20} className="dp-dropzone-icon" />
        {fileName
          ? <span className="dp-dropzone-label dp-dropzone-label--loaded">{fileName}</span>
          : <>
              <span className="dp-dropzone-label">Kéo thả hoặc nhấn để chọn file</span>
              <span className="dp-dropzone-hint">.csv · cột: Phòng ban, Điểm quý X</span>
            </>
        }
      </div>

      {!fileName && (
        <p className="dp-ts-hint">Liên hệ <strong>bộ phận Đào tạo</strong> để lấy file dữ liệu</p>
      )}

      <button
        className="dp-process-btn"
        style={{ background: 'rgba(99,102,241,0.7)' }}
        disabled={!fileName || state.processing}
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
            style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', borderColor: 'rgba(99,102,241,0.3)' }}
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
  const [noiQuy, setNoiQuy] = useState<BoxState>(emptyState)
  const [timesheets, setTimesheets] = useState<BoxState>(emptyState)
  const [daoTao, setDaoTao] = useState<BoxState>(emptyState)
  const [mktImport, setMktImport] = useState<BoxState>(emptyState)
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

  const handleNoiQuyProcess = () => {
    setNoiQuy(prev => ({ ...prev, processing: true, output: '', result: null, applyStatus: 'idle', applyMessage: '' }))
    startTransition(async () => {
      try {
        const fileResults: FileResult[] = await Promise.all(
          noiQuy.files.map(async f => {
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

        setNoiQuy(prev => ({
          ...prev,
          processing: false,
          result: rounded,
          output: JSON.stringify(rounded, null, 2),
        }))
      } catch (err) {
        setNoiQuy(prev => ({
          ...prev,
          processing: false,
          output: `Lỗi: ${err instanceof Error ? err.message : String(err)}`,
        }))
      }
    })
  }

  const handleApply = (
    source: 'noi_quy' | 'timesheets' | 'marketing' | 'dao_tao',
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
    startTransition(async () => {
      try {
        // Separate files by type: BC Timesheet export vs Bang-cham-cong attendance
        const tsResults: TSFileResult[]                      = []
        const ccFiles:   { label: string; result: TSFileResult }[] = []
        const allUnmatched: string[] = []
        const fileLines: string[]    = []

        // Extract short month label from filename, e.g. "Bang-cham-cong-01-2026.xlsx" → "T1"
        const monthLabel = (fname: string) => {
          const m = fname.match(/[_\-]0?(\d{1,2})[_\-]20\d{2}/i)
          return m ? `T${m[1]}` : fname.replace(/\.xlsx?$/i, '').slice(-6)
        }

        for (const file of timesheets.files) {
          const rows = await readWorkbookRaw(file)
          const addUnmatched = (u: string[]) => { for (const s of u) { if (!allUnmatched.includes(s)) allUnmatched.push(s) } }

          if (isBCTimesheetFormat(rows)) {
            const { result, unmatched } = parseTSheetBC(rows, departments)
            tsResults.push(result)
            addUnmatched(unmatched)
            fileLines.push(`${file.name}: BC Timesheet — ${Object.keys(result).length} phòng ban`)
          } else {
            const { result, unmatched } = parseTimesheetFile(rows, departments)
            ccFiles.push({ label: monthLabel(file.name), result })
            addUnmatched(unmatched)
            fileLines.push(`${file.name}: Chấm công — ${Object.keys(result).length} phòng ban`)
          }
        }

        if (tsResults.length === 0) {
          throw new Error('Thiếu file BC Timesheet — vui lòng upload file "BC Timesheet" cùng với 3 file Bang-cham-cong')
        }
        if (ccFiles.length === 0) {
          throw new Error('Thiếu file Bang-cham-cong — vui lòng upload đủ 3 file chấm công (tháng 1, 2, 3)')
        }

        // Merge: cc provides cc/cl/cn (tongGio=0), ts provides tongGio (cc/cl/cn=0)
        const ccZeroed = ccFiles.map(({ result: fr }) => {
          const z: TSFileResult = {}
          for (const [code, acc] of Object.entries(fr)) z[code] = { ...acc, tongGio: 0 }
          return z
        })
        const mergedResults: TSFileResult[] = [...ccZeroed, ...tsResults]

        const { scores, details } = computeTimesheetScores(mergedResults)
        const lines: string[] = [...fileLines, '']

        // Collect u (tongGio) per dept from all ts files
        const tongGioByCode: Record<string, number> = {}
        for (const fr of tsResults) {
          for (const [code, acc] of Object.entries(fr)) {
            tongGioByCode[code] = (tongGioByCode[code] ?? 0) + acc.tongGio
          }
        }

        lines.push(`=== Điểm Timesheets (${Object.keys(scores).length} phòng ban) ===`)
        Object.entries(scores)
          .sort((a, b) => b[1] - a[1])
          .forEach(([code, score]) => {
            const dept   = departments.find(d => d.code === code)
            const d      = details[code]
            const labels = ccFiles.map(f => f.label)

            // Per-month values for this dept
            const ccVals = ccFiles.map(f => f.result[code]?.congChuan ?? 0)
            const clVals = ccFiles.map(f => f.result[code]?.congLe    ?? 0)
            const cnVals = ccFiles.map(f => f.result[code]?.congNghi  ?? 0)
            const sumCC  = ccVals.reduce((s, v) => s + v, 0)
            const sumCL  = clVals.reduce((s, v) => s + v, 0)
            const sumCN  = cnVals.reduce((s, v) => s + v, 0)

            const fmt = (vals: number[]) => vals.map((v, i) => `${labels[i]}: ${v}`).join('  ')

            lines.push(
              ``,
              `${dept?.name ?? code}: ${score}đ`,
              `  Tổng công chuẩn  ${fmt(ccVals)}  →  Quý: ${sumCC}`,
              `  Số công nghỉ lễ  ${fmt(clVals)}  →  Quý: ${sumCL}`,
              `  Số công nghỉ     ${fmt(cnVals)}  →  Quý: ${sumCN}`,
              `  Giờ làm việc TT: ${d.t.toLocaleString('vi')}  |  Giờ khai TS: ${d.u.toLocaleString('vi')}`,
            )
          })

        if (allUnmatched.length > 0) {
          lines.push('', `⚠ Không khớp (${allUnmatched.length}):`, ...allUnmatched.map(u => `  - ${u}`))
        }

        setTimesheets(prev => ({
          ...prev,
          processing: false,
          result: scores,
          output: lines.join('\n'),
        }))
      } catch (err) {
        setTimesheets(prev => ({
          ...prev,
          processing: false,
          output: `Lỗi: ${err instanceof Error ? err.message : String(err)}`,
        }))
      }
    })
  }

  const handleMktFileChange = (f: File | null) => {
    if (!f) setMktImport(emptyState())
    else setMktImport(prev => ({ ...emptyState(), fileNames: [f.name], files: [f] }))
  }

  const handleMktProcess = () => {
    const file = mktImport.files[0]
    if (!file) return
    setMktImport(prev => ({ ...prev, processing: true, output: '', result: null, applyStatus: 'idle', applyMessage: '' }))
    startTransition(async () => {
      try {
        const text = await file.text()
        const { result, lines } = parseMktScoreCsv(text, departments)
        if (Object.keys(result).length === 0) throw new Error('Không khớp được phòng ban nào. Kiểm tra lại mã trong cột "Nhóm".')
        setMktImport(prev => ({ ...prev, processing: false, result, output: lines.join('\n') }))
      } catch (err) {
        setMktImport(prev => ({ ...prev, processing: false, output: `Lỗi: ${err instanceof Error ? err.message : String(err)}` }))
      }
    })
  }

  const handleDaoTaoFileChange = (f: File | null) => {
    if (!f) {
      setDaoTao(emptyState())
    } else {
      setDaoTao(prev => ({ ...emptyState(), fileNames: [f.name], files: [f] }))
    }
  }

  const handleDaoTaoProcess = () => {
    const file = daoTao.files[0]
    if (!file) return
    setDaoTao(prev => ({ ...prev, processing: true, output: '', result: null, applyStatus: 'idle', applyMessage: '' }))
    startTransition(async () => {
      try {
        const text = await file.text()
        const { result, lines } = parseDaoTaoCsv(text, departments)
        if (Object.keys(result).length === 0) throw new Error('Không khớp được phòng ban nào. Kiểm tra lại mã phòng ban trong CSV.')
        setDaoTao(prev => ({
          ...prev,
          processing: false,
          result,
          output: lines.join('\n'),
        }))
      } catch (err) {
        setDaoTao(prev => ({
          ...prev,
          processing: false,
          output: `Lỗi: ${err instanceof Error ? err.message : String(err)}`,
        }))
      }
    })
  }

  return (
    <div className="dp-root">
      <div className="dp-intro">
        <p className="dp-intro-text">
          Tải lên file Excel để xử lí dữ liệu tự động.
          {periodLabel && <> · Kỳ hiện tại: <strong>{periodLabel}</strong></>}
        </p>
      </div>

      <div className="dp-grid">
        <NoiQuyBox
          departments={departments}
          state={noiQuy}
          onFilesChange={p => handleFilesChange(setNoiQuy, p)}
          onProcess={handleNoiQuyProcess}
          onApply={() => noiQuy.result && handleApply('noi_quy', noiQuy.result, setNoiQuy)}
        />
        <TimesheetsBox
          state={timesheets}
          onFilesChange={p => handleFilesChange(setTimesheets, p)}
          onProcess={handleTimesheetsProcess}
          onApply={() => timesheets.result && handleApply('timesheets', timesheets.result, setTimesheets)}
        />
        <MktImportBox
          state={mktImport}
          onFileChange={handleMktFileChange}
          onProcess={handleMktProcess}
          onApply={() => mktImport.result && handleApply('marketing', mktImport.result, setMktImport)}
        />
        <DaoTaoBox
          departments={departments}
          state={daoTao}
          onFileChange={handleDaoTaoFileChange}
          onProcess={handleDaoTaoProcess}
          onApply={() => daoTao.result && handleApply('dao_tao', daoTao.result, setDaoTao)}
        />
        <DebugBox departments={departments} />
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

        /* ── Timesheets hint ── */
        .dp-ts-hint {
          font-size: 11.5px;
          color: rgba(255,255,255,0.3);
          line-height: 1.5;
          font-style: italic;
        }
        .dp-ts-hint strong { color: rgba(255,255,255,0.55); font-style: normal; }
        .dp-ts-hint em { font-style: normal; color: rgba(255,255,255,0.2); }
        [data-theme="light"] .dp-ts-hint { color: rgba(0,0,0,0.35); }
        [data-theme="light"] .dp-ts-hint strong { color: rgba(0,0,0,0.6); }

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
