'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Archive } from 'lucide-react'
import JSZip from 'jszip'
import { generateHTML, generateXLS, triggerDownload } from '../results/ResultsClient'
import type { DeptResult, CriterionInfo } from '../results/ResultsClient'

export interface DeptStat {
  id: string
  name: string
  code: string | null
  dueCount: number
  doneCount: number
  draftCount: number
  pendingTargetCodes: string[]
  incomingDone: number
  incomingTotal: number
  isMyDept: boolean
}

export interface OverallStats {
  totalTasks: number
  submittedCount: number
  draftCount: number
  notStartedCount: number
}

export interface PeriodOption {
  id: string
  quarter: number
  year: number
  status: string
}

interface Props {
  periodLabel: string
  periodStatus: string
  endDate: string
  activePeriodId: string
  periods: PeriodOption[]
  stats: DeptStat[]
  overall: OverallStats
  canManageAll: boolean
}

type Status = 'done' | 'in_progress' | 'not_started' | 'none'

function getStatus(s: DeptStat): Status {
  if (s.dueCount === 0) return 'none'
  if (s.doneCount === s.dueCount) return 'done'
  if (s.doneCount > 0 || s.draftCount > 0) return 'in_progress'
  return 'not_started'
}

const STATUS_LABEL: Record<Status, string> = {
  done:        'Hoàn thành',
  in_progress: 'Đang làm',
  not_started: 'Chưa bắt đầu',
  none:        '—',
}

const PERIOD_STATUS_LABEL: Record<string, string> = {
  open:   'Đang mở',
  closed: 'Đã tổng kết',
  draft:  'Nháp',
}

interface ArchiveData {
  period: Record<string, unknown>
  criteria: Record<string, unknown>[]
  departments: Record<string, unknown>[]
  matrix: Record<string, unknown>[]
  evaluations: Record<string, unknown>[]
  evalScores: Record<string, unknown>[]
  autoScores: Record<string, unknown>[]
  results: DeptResult[]
  totalSubmitted: number
  maxScore: number
}

function escH(s: unknown) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function tableSection(id: string, title: string, headers: string[], rows: unknown[][]): string {
  const ths = headers.map(h => `<th>${escH(h)}</th>`).join('')
  const trs = rows.map(row =>
    `<tr>${(row as unknown[]).map(cell => `<td>${escH(cell ?? '—')}</td>`).join('')}</tr>`
  ).join('')
  return `
  <section id="${id}" class="section">
    <h2>${title}</h2>
    <div class="tbl-wrap">
      <table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>
    </div>
  </section>`
}

function buildArchiveHTML(data: ArchiveData, pLabel: string): string {
  const now = new Date().toLocaleString('vi-VN')
  const p = data.period
  const deptMap = new Map(data.departments.map(d => [d.id as string, ((d.code ?? d.name) as string)]))
  const criteriaMap = new Map(data.criteria.map(c => [c.id as string, ((c.code ?? c.name) as string)]))

  const sections = [
    tableSection('ky-danh-gia', '1. Kỳ đánh giá',
      ['ID', 'Quý', 'Năm', 'Trạng thái', 'Ngày bắt đầu', 'Ngày kết thúc'],
      [[p.id, p.quarter, p.year, p.status, p.start_date ?? '', p.end_date ?? '']]
    ),
    tableSection('tieu-chi', '2. Tiêu chí',
      ['STT', 'Mã', 'Tên tiêu chí', 'Hệ số', 'Loại', 'Nguồn tự động'],
      data.criteria.map((c, i) => [i + 1, c.code ?? '', c.name, c.weight, c.input_type, c.auto_source ?? ''])
    ),
    tableSection('phong-ban', '3. Phòng ban',
      ['STT', 'Mã', 'Tên phòng ban'],
      data.departments.map((d, i) => [i + 1, d.code ?? '', d.name])
    ),
    tableSection('ma-tran', '4. Ma trận đánh giá',
      ['Phòng đánh giá', 'Phòng được đánh giá'],
      data.matrix.map(m => [deptMap.get(m.evaluator_id as string) ?? m.evaluator_id, deptMap.get(m.target_id as string) ?? m.target_id])
    ),
    tableSection('danh-gia', '5. Đánh giá',
      ['Phòng đánh giá', 'Phòng được đánh giá', 'Trạng thái', 'Điểm tổng', 'Ngày nộp'],
      data.evaluations.map(e => [
        deptMap.get(e.evaluator_id as string) ?? e.evaluator_id,
        deptMap.get(e.target_id as string) ?? e.target_id,
        e.status, e.total_score ?? '', e.submitted_at ?? '',
      ])
    ),
    tableSection('diem-danh-gia', '6. Điểm đánh giá',
      ['Mã đánh giá', 'Tiêu chí', 'Điểm thô', 'Điểm quy đổi', 'Ghi chú'],
      data.evalScores.map(s => [
        s.evaluation_id, criteriaMap.get(s.criteria_id as string) ?? s.criteria_id,
        s.raw_score ?? '', s.weighted_score ?? '', s.note ?? '',
      ])
    ),
    tableSection('diem-tu-dong', '7. Điểm tự động',
      ['Phòng ban', 'Tiêu chí', 'Nguồn', 'Điểm thô'],
      data.autoScores.map(s => [
        deptMap.get(s.dept_id as string) ?? s.dept_id,
        criteriaMap.get(s.criteria_id as string) ?? s.criteria_id,
        s.source ?? '', s.raw_score ?? '',
      ])
    ),
    tableSection('ket-qua', '8. Kết quả xếp hạng',
      ['Hạng', 'Mã phòng', 'Tên phòng ban', 'Điểm TB', 'Số đánh giá', 'Tổng đánh giá viên'],
      data.results.map(r => [
        r.avgScore != null ? r.rank : '—', r.code ?? '', r.name,
        r.avgScore != null ? r.avgScore.toFixed(2) : '—', r.receivedCount, r.totalEvaluators,
      ])
    ),
  ].join('')

  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<title>Lưu trữ Đánh giá — ${escH(pLabel)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,sans-serif;background:#f0f2f5;color:#1a1a1a;padding:24px 32px}
h1{color:#B30000;font-size:22px;margin-bottom:4px}
.meta{font-size:12px;color:#666;margin-bottom:20px}
nav{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px}
nav a{padding:5px 14px;border-radius:20px;background:#B30000;color:#fff;text-decoration:none;font-size:12px;font-weight:600}
nav a:hover{background:#990000}
.section{background:#fff;border-radius:10px;padding:20px 24px;margin-bottom:20px;box-shadow:0 1px 4px rgba(0,0,0,0.08)}
h2{font-size:14px;font-weight:700;color:#B30000;border-bottom:2px solid #f0e8e8;padding-bottom:8px;margin-bottom:14px;letter-spacing:0.03em}
.tbl-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:12.5px}
th{background:#1a1a1a;color:#fff;padding:8px 12px;text-align:left;font-weight:600;white-space:nowrap}
td{padding:7px 12px;border-bottom:1px solid #f0f0f0;vertical-align:top}
tr:nth-child(even) td{background:#fafafa}
tr:last-child td{border-bottom:none}
@media print{nav{display:none}.section{box-shadow:none;border:1px solid #ddd}}
</style>
</head>
<body>
<h1>Lưu trữ Kỳ Đánh giá — ${escH(pLabel)}</h1>
<p class="meta">Xuất lúc ${escH(now)} · ${escH(String(data.criteria.length))} tiêu chí · ${escH(String(data.departments.length))} phòng ban · ${escH(String(data.totalSubmitted))} đánh giá đã nộp</p>
<nav>
  <a href="#ky-danh-gia">Kỳ đánh giá</a>
  <a href="#tieu-chi">Tiêu chí</a>
  <a href="#phong-ban">Phòng ban</a>
  <a href="#ma-tran">Ma trận</a>
  <a href="#danh-gia">Đánh giá</a>
  <a href="#diem-danh-gia">Điểm đánh giá</a>
  <a href="#diem-tu-dong">Điểm tự động</a>
  <a href="#ket-qua">Kết quả</a>
</nav>
${sections}
</body>
</html>`
}

function buildCriteriaCSV(data: ArchiveData): string {
  const lines: string[] = ['DS TIÊU CHÍ & HỆ SỐ,Hình thức,HS QUÝ 1,HS QUÝ 2,HS QUÝ 3,HS QUÝ 4']
  for (const c of data.criteria) {
    const code = c.code as string | null
    const name = c.name as string
    const weight = Number(c.weight)
    const inputType = c.input_type as string
    const label = code ? `${code}: ${name}` : name
    const hinhThuc = inputType === 'auto' ? 'Dữ liệu từ báo cáo hệ thống' : 'Thủ công'
    const escapedLabel = label.includes(',') ? `"${label}"` : label
    lines.push(`${escapedLabel},${hinhThuc},${weight},${weight},${weight},${weight}`)
  }
  return '﻿' + lines.join('\n')
}

export default function StatusClient({
  periodLabel,
  periodStatus,
  endDate,
  activePeriodId,
  periods,
  stats,
  overall,
  canManageAll,
}: Props) {
  const router = useRouter()
  const [localStatus, setLocalStatus] = useState(periodStatus)
  const [archiveStep, setArchiveStep] = useState<string | null>(null)

  const completionRate = overall.totalTasks > 0
    ? (overall.submittedCount / overall.totalTasks) * 100
    : 0

  const doneCount    = stats.filter(s => getStatus(s) === 'done').length
  const activeCount  = stats.filter(s => getStatus(s) === 'in_progress').length
  const pendingCount = stats.filter(s => getStatus(s) === 'not_started').length
  const myStats = stats.find(s => s.isMyDept)

  const isOverdue = localStatus === 'open' && endDate && new Date(endDate) < new Date()

  async function handleArchivePeriod() {
    const confirmed = window.confirm(
      `Kết thúc & Lưu trữ kỳ đánh giá "${periodLabel}"?\n\n` +
      `Hệ thống sẽ:\n` +
      `  1. Tạo file ZIP gồm: lưu trữ HTML, báo cáo HTML, Excel kết quả, CSV tiêu chí\n` +
      `  2. Xóa toàn bộ dữ liệu và kỳ đánh giá khỏi hệ thống\n\n` +
      `Thao tác này KHÔNG THỂ hoàn tác. Tiếp tục?`
    )
    if (!confirmed) return

    try {
      setArchiveStep('Đang lấy dữ liệu…')
      const res = await fetch(`/api/close-period?periodId=${activePeriodId}`)
      if (!res.ok) throw new Error('Không lấy được dữ liệu kỳ đánh giá')
      const data: ArchiveData = await res.json()

      const pLabel = `Quý ${data.period.quarter} · ${data.period.year}`
      const slug = String(pLabel).replace(/[\s·]+/g, '_')

      const criteriaForExport: CriterionInfo[] = data.criteria.map(c => ({
        id: c.id as string,
        code: (c.code as string | null) ?? null,
        name: c.name as string,
        weight: Number(c.weight),
        input_type: c.input_type as 'manual' | 'auto',
      }))

      setArchiveStep('Đang tạo file…')

      const archiveHtml = buildArchiveHTML(data, pLabel)
      const resultsHtml = generateHTML(data.results, criteriaForExport, pLabel, data.maxScore, data.totalSubmitted, process.env.NEXT_PUBLIC_COMPANY_LOGO_URL)
      const resultsXls  = generateXLS(data.results, criteriaForExport, pLabel, data.maxScore)
      const criteriaCsv = buildCriteriaCSV(data)

      setArchiveStep('Đang nén ZIP…')
      const zip = new JSZip()
      zip.file(`luu_tru_${slug}.html`, archiveHtml)
      zip.file(`ket_qua_${slug}.html`, resultsHtml)
      zip.file(`ket_qua_${slug}.xls`, resultsXls)
      zip.file(`tieu_chi_${slug}.csv`, criteriaCsv)

      const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
      const zipUrl = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = zipUrl
      a.download = `danh_gia_${slug}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(zipUrl)

      await new Promise(r => setTimeout(r, 600))

      setArchiveStep('Đang xóa dữ liệu…')
      const delRes = await fetch('/api/close-period', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodId: activePeriodId }),
      })
      if (!delRes.ok) throw new Error('Xóa dữ liệu thất bại — kiểm tra kết nối và thử lại')

      setArchiveStep('Hoàn tất!')
      await new Promise(r => setTimeout(r, 1200))
      setArchiveStep(null)
      router.refresh()
    } catch (err) {
      setArchiveStep(null)
      alert(`Lỗi: ${err instanceof Error ? err.message : 'Không xác định'}`)
    }
  }

  return (
    <div className="st-root">

      {/* ── Top bar ── */}
      <div className="st-topbar">
        <div className="st-topbar-left">
          <span className="st-period-label">{periodLabel}</span>

          <span className={`st-period-status ${localStatus === 'open' ? 'st-period-status--open' : localStatus === 'closed' ? 'st-period-status--closed' : ''}`}>
            {PERIOD_STATUS_LABEL[localStatus] ?? localStatus}
          </span>

          {isOverdue && (
            <span className="st-overdue-badge">Quá hạn</span>
          )}
        </div>

        <div className="st-topbar-right">
          <span className="st-rate">{completionRate.toFixed(0)}% hoàn thành</span>

          {canManageAll && localStatus !== 'closed' && (
            <button
              className="st-finalize-btn"
              onClick={handleArchivePeriod}
              disabled={archiveStep !== null}
            >
              <Archive size={13} />
              {archiveStep ?? 'Kết thúc & Lưu trữ'}
            </button>
          )}

          {localStatus === 'closed' && (
            <span className="st-finalized-badge">
              <Lock size={11} /> Đã lưu trữ
            </span>
          )}
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div className="st-progress-track">
        <div className="st-progress-submitted" style={{ width: `${completionRate}%` }} />
        <div
          className="st-progress-draft"
          style={{
            width: `${overall.totalTasks > 0 ? (overall.draftCount / overall.totalTasks) * 100 : 0}%`,
            left: `${completionRate}%`,
          }}
        />
      </div>

      {/* ── Stat cards ── */}
      <div className="st-cards">
        <div className="st-card">
          <span className="st-card-value">{overall.totalTasks}</span>
          <span className="st-card-label">Tổng đánh giá</span>
        </div>
        <div className="st-card st-card--green">
          <span className="st-card-value">{overall.submittedCount}</span>
          <span className="st-card-label">Đã nộp</span>
        </div>
        <div className="st-card st-card--amber">
          <span className="st-card-value">{overall.draftCount}</span>
          <span className="st-card-label">Đang làm</span>
        </div>
        <div className="st-card st-card--muted">
          <span className="st-card-value">{overall.notStartedCount}</span>
          <span className="st-card-label">Chưa bắt đầu</span>
        </div>
      </div>

      {/* ── My status (dept user) ── */}
      {!canManageAll && myStats && (
        <div className={`st-my-card st-my-card--${getStatus(myStats)}`}>
          <div className="st-my-header">
            <span className="st-my-title">Phòng của bạn — {myStats.code ?? myStats.name}</span>
            <span className={`st-badge st-badge--${getStatus(myStats)}`}>
              {STATUS_LABEL[getStatus(myStats)]}
            </span>
          </div>
          <div className="st-my-body">
            <div className="st-my-stat">
              <span className="st-my-num">{myStats.doneCount}</span>
              <span className="st-my-den">/{myStats.dueCount}</span>
              <span className="st-my-lbl">đã nộp</span>
            </div>
            {myStats.draftCount > 0 && (
              <div className="st-my-stat">
                <span className="st-my-num st-my-num--draft">{myStats.draftCount}</span>
                <span className="st-my-lbl">đang làm</span>
              </div>
            )}
            <div className="st-my-stat">
              <span className="st-my-num">{myStats.incomingDone}</span>
              <span className="st-my-den">/{myStats.incomingTotal}</span>
              <span className="st-my-lbl">đã được đánh giá</span>
            </div>
          </div>
          {myStats.pendingTargetCodes.length > 0 && (
            <div className="st-my-pending">
              <span className="st-my-pending-label">Chờ nộp:</span>
              <div className="st-tags">
                {myStats.pendingTargetCodes.map(code => (
                  <span key={code} className="st-tag">{code}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Dept summary pills (admin/leadership) ── */}
      {canManageAll && (
        <div className="st-dept-pills">
          <div className="st-pill st-pill--green">
            <span className="st-pill-num">{doneCount}</span>
            <span className="st-pill-lbl">hoàn thành</span>
          </div>
          <div className="st-pill st-pill--amber">
            <span className="st-pill-num">{activeCount}</span>
            <span className="st-pill-lbl">đang làm</span>
          </div>
          <div className="st-pill st-pill--muted">
            <span className="st-pill-num">{pendingCount}</span>
            <span className="st-pill-lbl">chưa bắt đầu</span>
          </div>
          <span className="st-pill-sep">·</span>
          <span className="st-pill-note">{stats.length} phòng ban</span>
        </div>
      )}

      {/* ── Department table ── */}
      <div className="st-table-wrap">
        <table className="st-table">
          <thead>
            <tr>
              <th className="st-th th-dept">Phòng ban</th>
              <th className="st-th th-progress">Tiến độ nộp</th>
              <th className="st-th th-incoming">Được đánh giá</th>
              <th className="st-th th-status">Tình trạng</th>
              {canManageAll && <th className="st-th th-pending">Còn chờ nộp</th>}
            </tr>
          </thead>
          <tbody>
            {stats.map(s => {
              const status = getStatus(s)
              const pct = s.dueCount > 0 ? (s.doneCount / s.dueCount) * 100 : 0
              const draftPct = s.dueCount > 0 ? (s.draftCount / s.dueCount) * 100 : 0
              const inPct = s.incomingTotal > 0 ? (s.incomingDone / s.incomingTotal) * 100 : 0

              return (
                <tr key={s.id} className={`st-tr ${s.isMyDept ? 'st-tr--mine' : ''}`}>
                  <td className="st-td td-dept">
                    <span className={`st-dept-code ${s.isMyDept ? 'st-dept-code--mine' : ''}`}>
                      {s.code ?? s.name}
                    </span>
                    {s.isMyDept && <span className="st-you-badge">bạn</span>}
                  </td>

                  <td className="st-td td-progress">
                    <div className="st-prog-wrap">
                      <div className="st-prog-track">
                        <div className="st-prog-fill" style={{ width: `${pct}%` }} />
                        <div className="st-prog-draft" style={{ width: `${draftPct}%`, left: `${pct}%` }} />
                      </div>
                      <span className="st-prog-nums">
                        <span className={`st-prog-done ${status === 'done' ? 'st-prog-done--full' : ''}`}>{s.doneCount}</span>
                        <span className="st-prog-total">/{s.dueCount}</span>
                      </span>
                    </div>
                  </td>

                  <td className="st-td td-incoming">
                    <div className="st-incoming-wrap">
                      <div className="st-in-track">
                        <div className="st-in-fill" style={{ width: `${inPct}%` }} />
                      </div>
                      <span className="st-in-nums">
                        <span className="st-in-done">{s.incomingDone}</span>
                        <span className="st-in-total">/{s.incomingTotal}</span>
                      </span>
                    </div>
                  </td>

                  <td className="st-td td-status">
                    <span className={`st-badge st-badge--${status}`}>
                      {STATUS_LABEL[status]}
                    </span>
                  </td>

                  {canManageAll && (
                    <td className="st-td td-pending">
                      {s.pendingTargetCodes.length === 0 ? (
                        <span className="st-pending-none">—</span>
                      ) : (
                        <div className="st-tags">
                          {s.pendingTargetCodes.slice(0, 5).map(code => (
                            <span key={code} className="st-tag">{code}</span>
                          ))}
                          {s.pendingTargetCodes.length > 5 && (
                            <span className="st-tag st-tag--more">+{s.pendingTargetCodes.length - 5}</span>
                          )}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <style>{`
        .st-root {
          display: flex; flex-direction: column; gap: 16px;
          font-family: var(--font-sans), sans-serif;
          animation: stFade 0.3s ease both;
        }
        @keyframes stFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

        /* ── Top bar ── */
        .st-topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .st-topbar-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .st-topbar-right { display: flex; align-items: center; gap: 10px; }

        /* Period label (replaces selector — 1 period at a time) */
        .st-period-label {
          font-size: 13px; font-weight: 700; letter-spacing: 0.06em;
          text-transform: uppercase; color: rgba(255,255,255,0.7);
        }

        .st-period-status {
          font-size: 11px; padding: 2px 8px; border-radius: 20px;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.3); font-style: italic;
        }
        .st-period-status--open {
          background: rgba(74,222,128,0.08); border-color: rgba(74,222,128,0.2); color: rgba(74,222,128,0.8);
        }
        .st-period-status--closed {
          background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.08); color: rgba(255,255,255,0.3);
        }

        /* Overdue badge */
        .st-overdue-badge {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 600;
          background: rgba(251,100,36,0.12); color: rgba(251,140,36,0.9);
          border: 1px solid rgba(251,100,36,0.25);
          animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.65; } }

        .st-rate { font-size: 12px; color: rgba(179,0,0,0.8); font-weight: 600; letter-spacing: 0.04em; }

        /* Finalize / Archive button */
        .st-finalize-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 14px; border-radius: 8px; border: none;
          background: #B30000; color: #fff;
          font-size: 12px; font-family: var(--font-sans), sans-serif;
          font-weight: 600; letter-spacing: 0.03em;
          cursor: pointer; white-space: nowrap;
          box-shadow: 0 3px 14px rgba(179,0,0,0.35);
          transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
        }
        .st-finalize-btn:hover:not(:disabled) {
          background: #cc0000; transform: translateY(-1px);
          box-shadow: 0 5px 20px rgba(179,0,0,0.5);
        }
        .st-finalize-btn:disabled {
          opacity: 0.75; cursor: not-allowed;
          background: rgba(179,0,0,0.6);
          animation: archivePulse 1.4s ease-in-out infinite;
        }
        @keyframes archivePulse { 0%,100% { opacity: 0.75; } 50% { opacity: 0.5; } }

        /* Finalized badge */
        .st-finalized-badge {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.35);
        }

        /* ── Main progress bar ── */
        .st-progress-track {
          height: 4px; background: rgba(255,255,255,0.05); border-radius: 2px;
          overflow: hidden; position: relative;
        }
        .st-progress-submitted {
          position: absolute; top: 0; left: 0; height: 100%;
          background: #B30000; border-radius: 2px;
          transition: width 0.5s cubic-bezier(0.34,1.56,0.64,1);
          box-shadow: 0 0 8px rgba(179,0,0,0.5);
        }
        .st-progress-draft {
          position: absolute; top: 0; height: 100%;
          background: rgba(251,191,36,0.4); border-radius: 2px;
          transition: width 0.5s cubic-bezier(0.34,1.56,0.64,1);
        }

        /* ── Stat cards ── */
        .st-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        .st-card {
          display: flex; flex-direction: column; gap: 4px;
          padding: 14px 16px; border-radius: 12px;
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06);
        }
        .st-card--green { border-color: rgba(74,222,128,0.15); background: rgba(74,222,128,0.04); }
        .st-card--amber { border-color: rgba(251,191,36,0.15); background: rgba(251,191,36,0.04); }
        .st-card--muted { border-color: rgba(255,255,255,0.05); }
        .st-card-value { font-size: 28px; font-weight: 300; letter-spacing: -0.03em; color: rgba(255,255,255,0.85); line-height: 1; }
        .st-card--green .st-card-value { color: #4ade80; }
        .st-card--amber .st-card-value { color: #fbbf24; }
        .st-card--muted .st-card-value { color: rgba(255,255,255,0.35); }
        .st-card-label { font-size: 10px; font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase; color: rgba(255,255,255,0.25); }

        /* ── My status card ── */
        .st-my-card {
          padding: 16px 18px; border-radius: 12px;
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08);
          display: flex; flex-direction: column; gap: 12px;
        }
        .st-my-card--done { border-color: rgba(74,222,128,0.2); background: rgba(74,222,128,0.04); }
        .st-my-card--in_progress { border-color: rgba(251,191,36,0.2); background: rgba(251,191,36,0.04); }
        .st-my-card--not_started { border-color: rgba(179,0,0,0.2); background: rgba(179,0,0,0.04); }
        .st-my-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .st-my-title { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.7); }
        .st-my-body { display: flex; align-items: center; gap: 24px; }
        .st-my-stat { display: flex; align-items: baseline; gap: 4px; }
        .st-my-num { font-size: 22px; font-weight: 300; color: #fff; letter-spacing: -0.02em; line-height: 1; }
        .st-my-num--draft { color: #fbbf24; }
        .st-my-den { font-size: 14px; color: rgba(255,255,255,0.3); }
        .st-my-lbl { font-size: 11px; color: rgba(255,255,255,0.35); letter-spacing: 0.02em; }
        .st-my-pending { display: flex; align-items: center; gap: 8px; }
        .st-my-pending-label { font-size: 11px; color: rgba(255,255,255,0.3); font-style: italic; white-space: nowrap; }

        /* ── Dept pills (admin) ── */
        .st-dept-pills { display: flex; align-items: center; gap: 10px; }
        .st-pill { display: flex; align-items: center; gap: 5px; padding: 4px 12px; border-radius: 20px; font-size: 12px; border: 1px solid transparent; }
        .st-pill--green { background: rgba(74,222,128,0.08); border-color: rgba(74,222,128,0.15); color: #4ade80; }
        .st-pill--amber { background: rgba(251,191,36,0.08); border-color: rgba(251,191,36,0.15); color: #fbbf24; }
        .st-pill--muted { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.08); color: rgba(255,255,255,0.4); }
        .st-pill-num { font-weight: 700; }
        .st-pill-lbl { font-size: 11px; opacity: 0.8; }
        .st-pill-sep { color: rgba(255,255,255,0.15); font-size: 16px; }
        .st-pill-note { font-size: 11px; color: rgba(255,255,255,0.25); font-style: italic; }

        /* ── Table ── */
        .st-table-wrap {
          overflow: auto; border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.015);
          scrollbar-width: thin; scrollbar-color: rgba(179,0,0,0.15) transparent;
        }
        .st-table-wrap::-webkit-scrollbar { width: 4px; height: 4px; }
        .st-table-wrap::-webkit-scrollbar-thumb { background: rgba(179,0,0,0.15); border-radius: 4px; }
        .st-table { width: 100%; border-collapse: collapse; }
        .st-th {
          padding: 10px 16px; text-align: left;
          font-size: 10px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase;
          color: rgba(255,255,255,0.25); border-bottom: 1px solid rgba(255,255,255,0.06);
          white-space: nowrap; position: sticky; top: 0; background: #0e0e0e; z-index: 1;
        }
        .th-progress, .th-incoming { width: 180px; }
        .th-status { width: 130px; }
        .st-tr { border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.1s; }
        .st-tr:hover { background: rgba(255,255,255,0.025); }
        .st-tr:last-child { border-bottom: none; }
        .st-tr--mine { background: rgba(179,0,0,0.04); }
        .st-tr--mine:hover { background: rgba(179,0,0,0.07); }
        .st-td { padding: 11px 16px; vertical-align: middle; }

        .td-dept { white-space: nowrap; }
        .st-dept-code { font-size: 12.5px; font-weight: 600; color: rgba(255,255,255,0.6); letter-spacing: 0.05em; }
        .st-dept-code--mine { color: #B30000; }
        .st-you-badge {
          display: inline-block; margin-left: 6px;
          font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
          padding: 1px 6px; border-radius: 4px;
          background: rgba(179,0,0,0.15); color: rgba(179,0,0,0.9);
          border: 1px solid rgba(179,0,0,0.2); vertical-align: middle;
        }

        .td-progress, .td-incoming { min-width: 160px; }
        .st-prog-wrap, .st-incoming-wrap { display: flex; align-items: center; gap: 10px; }
        .st-prog-track, .st-in-track {
          flex: 1; height: 4px; background: rgba(255,255,255,0.06);
          border-radius: 2px; overflow: visible; position: relative;
        }
        .st-prog-fill {
          position: absolute; top: 0; left: 0; height: 100%;
          background: #B30000; border-radius: 2px;
          transition: width 0.4s cubic-bezier(0.34,1.56,0.64,1);
          box-shadow: 0 0 5px rgba(179,0,0,0.4);
        }
        .st-prog-draft {
          position: absolute; top: 0; height: 100%;
          background: rgba(251,191,36,0.5); border-radius: 2px; transition: width 0.4s;
        }
        .st-in-fill {
          position: absolute; top: 0; left: 0; height: 100%;
          background: rgba(255,255,255,0.2); border-radius: 2px;
          transition: width 0.4s cubic-bezier(0.34,1.56,0.64,1);
        }
        .st-prog-nums, .st-in-nums { white-space: nowrap; }
        .st-prog-done, .st-in-done { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.6); }
        .st-prog-done--full { color: #4ade80; }
        .st-prog-total, .st-in-total { font-size: 12px; color: rgba(255,255,255,0.25); }

        .st-badge {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 500; white-space: nowrap;
        }
        .st-badge--done { background: rgba(74,222,128,0.1); color: #4ade80; border: 1px solid rgba(74,222,128,0.2); }
        .st-badge--in_progress { background: rgba(251,191,36,0.08); color: #fbbf24; border: 1px solid rgba(251,191,36,0.18); }
        .st-badge--not_started { background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.35); border: 1px solid rgba(255,255,255,0.08); }
        .st-badge--none { background: transparent; color: rgba(255,255,255,0.15); border: none; }

        .td-pending { max-width: 320px; }
        .st-pending-none { color: rgba(255,255,255,0.15); font-size: 12px; }
        .st-tags { display: flex; flex-wrap: wrap; gap: 4px; }
        .st-tag {
          display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px;
          font-weight: 500; letter-spacing: 0.04em; font-family: monospace;
          background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.45);
          border: 1px solid rgba(255,255,255,0.08);
        }
        .st-tag--more { background: rgba(179,0,0,0.08); color: rgba(179,0,0,0.7); border-color: rgba(179,0,0,0.15); }

        @media (max-width: 768px) {
          .st-cards { grid-template-columns: repeat(2, 1fr); }
          .st-topbar { flex-wrap: wrap; }
        }

        /* ── Light mode ── */
        [data-theme="light"] .st-period-label { color: rgba(0,0,0,0.7); }
        [data-theme="light"] .st-period-status { background: rgba(0,0,0,0.04); border-color: rgba(0,0,0,0.1); color: rgba(0,0,0,0.4); }
        [data-theme="light"] .st-finalized-badge { background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.1); color: rgba(0,0,0,0.35); }
        [data-theme="light"] .st-progress-track { background: rgba(0,0,0,0.07); }
        [data-theme="light"] .st-card { background: #fff; border-color: rgba(0,0,0,0.08); }
        [data-theme="light"] .st-card--muted { border-color: rgba(0,0,0,0.07); }
        [data-theme="light"] .st-card-value { color: rgba(0,0,0,0.8); }
        [data-theme="light"] .st-card--muted .st-card-value { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .st-card-label { color: rgba(0,0,0,0.35); }
        [data-theme="light"] .st-my-card { background: #fff; border-color: rgba(0,0,0,0.08); }
        [data-theme="light"] .st-my-title { color: rgba(0,0,0,0.6); }
        [data-theme="light"] .st-my-num { color: #1a1a1a; }
        [data-theme="light"] .st-my-den { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .st-my-lbl { color: rgba(0,0,0,0.35); }
        [data-theme="light"] .st-my-pending-label { color: rgba(0,0,0,0.35); }
        [data-theme="light"] .st-pill--muted { background: rgba(0,0,0,0.04); border-color: rgba(0,0,0,0.08); color: rgba(0,0,0,0.4); }
        [data-theme="light"] .st-pill-sep { color: rgba(0,0,0,0.15); }
        [data-theme="light"] .st-pill-note { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .st-table-wrap { background: #fff; border-color: rgba(0,0,0,0.08); }
        [data-theme="light"] .st-th { background: #f5f5f5; color: rgba(0,0,0,0.4); border-bottom-color: rgba(0,0,0,0.07); }
        [data-theme="light"] .st-tr { border-bottom-color: rgba(0,0,0,0.05); }
        [data-theme="light"] .st-tr:hover { background: rgba(0,0,0,0.02); }
        [data-theme="light"] .st-tr--mine { background: rgba(179,0,0,0.03); }
        [data-theme="light"] .st-dept-code { color: rgba(0,0,0,0.6); }
        [data-theme="light"] .st-prog-track,
        [data-theme="light"] .st-in-track { background: rgba(0,0,0,0.09); }
        [data-theme="light"] .st-in-fill { background: rgba(0,0,0,0.18); }
        [data-theme="light"] .st-prog-done,
        [data-theme="light"] .st-in-done { color: rgba(0,0,0,0.7); }
        [data-theme="light"] .st-prog-done--full { color: #16a34a; }
        [data-theme="light"] .st-prog-total,
        [data-theme="light"] .st-in-total { color: rgba(0,0,0,0.35); }
        [data-theme="light"] .st-badge--not_started { background: rgba(0,0,0,0.05); color: rgba(0,0,0,0.4); border-color: rgba(0,0,0,0.08); }
        [data-theme="light"] .st-badge--none { color: rgba(0,0,0,0.2); border: none; }
        [data-theme="light"] .st-tag { background: rgba(0,0,0,0.05); border-color: rgba(0,0,0,0.09); color: rgba(0,0,0,0.5); }
        [data-theme="light"] .st-tag--more { background: rgba(179,0,0,0.06); color: rgba(140,0,0,0.7); border-color: rgba(179,0,0,0.12); }
        [data-theme="light"] .st-pending-none { color: rgba(0,0,0,0.25); }
      `}</style>
    </div>
  )
}
