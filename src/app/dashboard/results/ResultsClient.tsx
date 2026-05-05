'use client'

import { useState, Fragment } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

export interface CriterionInfo {
  id: string
  code: string | null
  name: string
  weight: number
}

export interface CriterionAvg {
  criteriaId: string
  avgRaw: number | null
  avgWeighted: number | null
}

export interface DeptResult {
  id: string
  name: string
  code: string | null
  rank: number
  avgScore: number | null
  receivedCount: number
  totalEvaluators: number
  criteriaAvg: CriterionAvg[]
  isMyDept: boolean
}

interface Props {
  periodLabel: string
  results: DeptResult[]
  criteria: CriterionInfo[]
  maxScore: number
  totalSubmitted: number
  canManageAll: boolean
}

function fmt(n: number | null, decimals = 1) {
  return n == null ? '—' : n.toFixed(decimals)
}

function pct(score: number | null, max: number) {
  if (score == null || max === 0) return 0
  return Math.min(100, (score / max) * 100)
}

const RANK_COLOR: Record<number, string> = {
  1: '#FFD700',
  2: '#C0C0C0',
  3: '#CD7F32',
}

export default function ResultsClient({ periodLabel, results, criteria, maxScore, totalSubmitted, canManageAll }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const ranked = results.filter(r => r.avgScore != null)
  const unranked = results.filter(r => r.avgScore == null)
  const allRows = [...ranked, ...unranked]

  function toggle(id: string) {
    setExpandedId(prev => prev === id ? null : id)
  }

  if (results.length === 0) {
    return (
      <div className="rs-empty">Chưa có dữ liệu đánh giá nào được nộp trong kỳ này.</div>
    )
  }

  return (
    <div className="rs-root">

      {/* ── Header ── */}
      <div className="rs-header">
        <div className="rs-header-left">
          <span className="rs-period">{periodLabel}</span>
          <span className="rs-sub">Kết quả tổng hợp</span>
        </div>
        <div className="rs-header-right">
          <span className="rs-meta">{totalSubmitted} đánh giá · tối đa {maxScore} điểm</span>
        </div>
      </div>

      {/* ── Podium (top 3) ── */}
      {ranked.length >= 1 && (
        <div className="rs-podium">
          {([1, 0, 2] as const).map(podiumIndex => {
            const r = ranked[podiumIndex]
            if (!r) return <div key={podiumIndex} className="rs-podium-slot rs-podium-slot--empty" />
            const place = podiumIndex + 1
            const heightMap: Record<number, string> = { 1: '80px', 2: '64px', 3: '52px' }
            return (
              <div key={r.id} className={`rs-podium-slot rs-podium-slot--${place} ${r.isMyDept ? 'rs-podium-slot--mine' : ''}`}>
                <div className="rs-podium-info">
                  <span className="rs-podium-rank" style={{ color: RANK_COLOR[place] }}>#{place}</span>
                  <span className="rs-podium-name">{r.code ?? r.name}</span>
                  <span className="rs-podium-score">{fmt(r.avgScore)}</span>
                  <span className="rs-podium-pct">{pct(r.avgScore, maxScore).toFixed(1)}%</span>
                </div>
                <div className="rs-podium-base" style={{ height: heightMap[place], borderColor: RANK_COLOR[place] }} />
              </div>
            )
          })}
        </div>
      )}

      {/* ── Ranking table ── */}
      <div className="rs-table-wrap">
        <table className="rs-table">
          <thead>
            <tr>
              <th className="rs-th th-rank">#</th>
              <th className="rs-th th-dept">Phòng ban</th>
              <th className="rs-th th-bar">Điểm trung bình</th>
              <th className="rs-th th-score">Điểm TB</th>
              <th className="rs-th th-pct">%</th>
              <th className="rs-th th-count">Được đánh giá</th>
              <th className="rs-th th-expand" />
            </tr>
          </thead>
          <tbody>
            {allRows.map(r => {
              const isExpanded = expandedId === r.id
              const barPct = pct(r.avgScore, maxScore)
              const rankColor = r.rank <= 3 ? RANK_COLOR[r.rank] : undefined

              return (
                <Fragment key={r.id}>
                  <tr
                    className={`rs-tr ${r.isMyDept ? 'rs-tr--mine' : ''} ${isExpanded ? 'rs-tr--expanded' : ''}`}
                    onClick={() => toggle(r.id)}
                  >
                    <td className="rs-td td-rank">
                      {r.avgScore != null ? (
                        <span className="rs-rank-num" style={{ color: rankColor }}>
                          {r.rank}
                        </span>
                      ) : (
                        <span className="rs-rank-dash">—</span>
                      )}
                    </td>

                    <td className="rs-td td-dept">
                      <span className={`rs-dept-name ${r.isMyDept ? 'rs-dept-name--mine' : ''}`}>
                        {r.code ?? r.name}
                      </span>
                      {r.isMyDept && <span className="rs-you">bạn</span>}
                    </td>

                    <td className="rs-td td-bar">
                      <div className="rs-bar-track">
                        <div
                          className="rs-bar-fill"
                          style={{
                            width: `${barPct}%`,
                            background: rankColor ?? '#B30000',
                          }}
                        />
                      </div>
                    </td>

                    <td className="rs-td td-score">
                      <span className="rs-score-val" style={{ color: rankColor }}>
                        {fmt(r.avgScore)}
                      </span>
                    </td>

                    <td className="rs-td td-pct">
                      <span className="rs-pct-val">{r.avgScore != null ? `${barPct.toFixed(1)}%` : '—'}</span>
                    </td>

                    <td className="rs-td td-count">
                      <span className={`rs-count ${r.receivedCount === r.totalEvaluators && r.totalEvaluators > 0 ? 'rs-count--full' : ''}`}>
                        {r.receivedCount}
                      </span>
                      <span className="rs-count-total">/{r.totalEvaluators}</span>
                    </td>

                    <td className="rs-td td-expand">
                      {isExpanded
                        ? <ChevronDown size={13} className="rs-chevron rs-chevron--open" />
                        : <ChevronRight size={13} className="rs-chevron" />
                      }
                    </td>
                  </tr>

                  {/* Expanded criterion breakdown */}
                  {isExpanded && (
                    <tr className="rs-detail-row">
                      <td colSpan={7} className="rs-detail-cell">
                        <div className="rs-detail-inner">
                          {r.receivedCount === 0 ? (
                            <span className="rs-detail-empty">Chưa có đánh giá nào được nộp.</span>
                          ) : (
                            <table className="rs-detail-table">
                              <thead>
                                <tr>
                                  <th className="rs-dth dth-code">Mã</th>
                                  <th className="rs-dth dth-name">Tiêu chí</th>
                                  <th className="rs-dth dth-weight">Hệ số</th>
                                  <th className="rs-dth dth-raw">TB điểm</th>
                                  <th className="rs-dth dth-bar">Phân bố</th>
                                  <th className="rs-dth dth-weighted">TB quy đổi</th>
                                </tr>
                              </thead>
                              <tbody>
                                {criteria.map(c => {
                                  const avg = r.criteriaAvg.find(a => a.criteriaId === c.id)
                                  const rawPct = avg?.avgRaw != null ? (avg.avgRaw / 10) * 100 : 0
                                  return (
                                    <tr key={c.id} className="rs-dtr">
                                      <td className="rs-dtd dtd-code">{c.code ?? '—'}</td>
                                      <td className="rs-dtd dtd-name">{c.name}</td>
                                      <td className="rs-dtd dtd-weight">×{c.weight}</td>
                                      <td className="rs-dtd dtd-raw">{fmt(avg?.avgRaw ?? null)}</td>
                                      <td className="rs-dtd dtd-bar">
                                        <div className="rs-dbar-track">
                                          <div className="rs-dbar-fill" style={{ width: `${rawPct}%` }} />
                                        </div>
                                      </td>
                                      <td className="rs-dtd dtd-weighted">
                                        <span className="rs-weighted-val">{fmt(avg?.avgWeighted ?? null)}</span>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                              <tfoot>
                                <tr className="rs-dfoot">
                                  <td colSpan={5} className="rs-dfoot-label">Tổng</td>
                                  <td className="rs-dfoot-val">
                                    {fmt(r.avgScore)}
                                    <span className="rs-dfoot-max"> / {maxScore}</span>
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <style>{`
        .rs-root {
          display: flex; flex-direction: column; gap: 20px;
          font-family: var(--font-sans), sans-serif;
          animation: rsFade 0.3s ease both;
        }
        @keyframes rsFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

        .rs-empty {
          color: rgba(255,255,255,0.2); font-size: 13px; font-style: italic; padding: 48px 0;
        }

        /* ── Header ── */
        .rs-header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
        .rs-header-left { display: flex; align-items: baseline; gap: 10px; }
        .rs-period {
          font-size: 12px; font-weight: 700; letter-spacing: 0.1em;
          text-transform: uppercase; color: rgba(255,255,255,0.4);
        }
        .rs-sub { font-size: 13px; color: rgba(255,255,255,0.25); font-style: italic; }
        .rs-meta { font-size: 11px; color: rgba(255,255,255,0.25); font-style: italic; }

        /* ── Podium ── */
        .rs-podium {
          display: grid; grid-template-columns: 1fr 1fr 1fr;
          gap: 10px; align-items: end;
        }
        .rs-podium-slot {
          display: flex; flex-direction: column; align-items: center; gap: 0;
        }
        .rs-podium-slot--empty { visibility: hidden; }
        .rs-podium-info {
          display: flex; flex-direction: column; align-items: center; gap: 2px;
          padding: 12px 16px 10px; width: 100%;
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.07);
          border-bottom: none;
          border-radius: 10px 10px 0 0;
        }
        .rs-podium-slot--1 .rs-podium-info {
          background: rgba(255,215,0,0.04);
          border-color: rgba(255,215,0,0.15);
        }
        .rs-podium-slot--2 .rs-podium-info {
          background: rgba(192,192,192,0.03);
          border-color: rgba(192,192,192,0.1);
        }
        .rs-podium-slot--3 .rs-podium-info {
          background: rgba(205,127,50,0.03);
          border-color: rgba(205,127,50,0.1);
        }
        .rs-podium-slot--mine .rs-podium-info { border-color: rgba(179,0,0,0.3); }
        .rs-podium-rank { font-size: 11px; font-weight: 800; letter-spacing: 0.08em; }
        .rs-podium-name { font-size: 15px; font-weight: 700; color: #fff; letter-spacing: 0.06em; }
        .rs-podium-score { font-size: 22px; font-weight: 300; color: rgba(255,255,255,0.9); letter-spacing: -0.02em; line-height: 1; margin-top: 4px; }
        .rs-podium-pct { font-size: 11px; color: rgba(255,255,255,0.3); }
        .rs-podium-base {
          width: 100%; border: 1px solid;
          border-top: none; border-radius: 0 0 8px 8px;
          opacity: 0.15;
          background: currentColor;
        }

        /* ── Table ── */
        .rs-table-wrap {
          overflow: auto; border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.015);
          scrollbar-width: thin; scrollbar-color: rgba(179,0,0,0.15) transparent;
        }
        .rs-table-wrap::-webkit-scrollbar { width: 4px; }
        .rs-table-wrap::-webkit-scrollbar-thumb { background: rgba(179,0,0,0.15); border-radius: 4px; }
        .rs-table { width: 100%; border-collapse: collapse; }

        .rs-th {
          padding: 10px 14px; text-align: left;
          font-size: 10px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase;
          color: rgba(255,255,255,0.25); border-bottom: 1px solid rgba(255,255,255,0.06);
          white-space: nowrap; position: sticky; top: 0; background: #0e0e0e; z-index: 1;
        }
        .th-rank { width: 44px; text-align: center; }
        .th-bar  { min-width: 160px; }
        .th-score, .th-pct { width: 80px; text-align: right; }
        .th-count { width: 90px; text-align: center; }
        .th-expand { width: 32px; }

        .rs-tr {
          border-bottom: 1px solid rgba(255,255,255,0.04);
          cursor: pointer; transition: background 0.1s;
        }
        .rs-tr:hover { background: rgba(255,255,255,0.03); }
        .rs-tr--mine { background: rgba(179,0,0,0.04); }
        .rs-tr--mine:hover { background: rgba(179,0,0,0.07); }
        .rs-tr--expanded { background: rgba(255,255,255,0.03); }
        .rs-tr:last-child:not(.rs-detail-row) { border-bottom: none; }

        .rs-td { padding: 12px 14px; vertical-align: middle; }

        .td-rank { text-align: center; }
        .rs-rank-num { font-size: 14px; font-weight: 700; }
        .rs-rank-dash { color: rgba(255,255,255,0.2); font-size: 13px; }

        .td-dept { white-space: nowrap; }
        .rs-dept-name { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.7); letter-spacing: 0.04em; }
        .rs-dept-name--mine { color: #B30000; }
        .rs-you {
          display: inline-block; margin-left: 6px;
          font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
          padding: 1px 6px; border-radius: 4px;
          background: rgba(179,0,0,0.15); color: rgba(179,0,0,0.9);
          border: 1px solid rgba(179,0,0,0.2); vertical-align: middle;
        }

        .td-bar { min-width: 160px; padding-right: 8px; }
        .rs-bar-track {
          height: 5px; background: rgba(255,255,255,0.06); border-radius: 3px;
          overflow: hidden;
        }
        .rs-bar-fill {
          height: 100%; border-radius: 3px;
          transition: width 0.5s cubic-bezier(0.34,1.56,0.64,1);
          box-shadow: 0 0 6px rgba(179,0,0,0.4);
        }

        .td-score { text-align: right; }
        .rs-score-val { font-size: 15px; font-weight: 300; letter-spacing: -0.01em; }

        .td-pct { text-align: right; }
        .rs-pct-val { font-size: 11px; color: rgba(255,255,255,0.3); }

        .td-count { text-align: center; white-space: nowrap; }
        .rs-count { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.5); }
        .rs-count--full { color: #4ade80; }
        .rs-count-total { font-size: 12px; color: rgba(255,255,255,0.25); }

        .td-expand { text-align: center; }
        .rs-chevron { color: rgba(255,255,255,0.2); transition: transform 0.15s; }
        .rs-chevron--open { color: rgba(179,0,0,0.6); }

        /* ── Expanded detail ── */
        .rs-detail-row { background: rgba(255,255,255,0.01); }
        .rs-detail-cell { padding: 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .rs-detail-inner {
          padding: 14px 20px 16px 56px;
          border-top: 1px solid rgba(255,255,255,0.04);
          background: rgba(0,0,0,0.15);
        }
        .rs-detail-empty { font-size: 12px; color: rgba(255,255,255,0.25); font-style: italic; }

        .rs-detail-table { width: 100%; border-collapse: collapse; }
        .rs-dth {
          padding: 6px 10px; text-align: left;
          font-size: 9px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
          color: rgba(255,255,255,0.2); border-bottom: 1px solid rgba(255,255,255,0.05);
          white-space: nowrap;
        }
        .dth-raw, .dth-weighted { text-align: right; }
        .dth-bar { min-width: 100px; }

        .rs-dtr { border-bottom: 1px solid rgba(255,255,255,0.03); }
        .rs-dtr:last-child { border-bottom: none; }
        .rs-dtd { padding: 7px 10px; font-size: 12px; color: rgba(255,255,255,0.6); vertical-align: middle; }
        .dtd-code { color: rgba(179,0,0,0.7); font-size: 10px; font-weight: 600; font-family: monospace; white-space: nowrap; }
        .dtd-raw, .dtd-weighted { text-align: right; }
        .rs-weighted-val { color: rgba(179,0,0,0.8); font-weight: 600; }

        .rs-dbar-track { height: 3px; background: rgba(255,255,255,0.05); border-radius: 2px; overflow: hidden; }
        .rs-dbar-fill { height: 100%; background: rgba(179,0,0,0.5); border-radius: 2px; transition: width 0.4s ease; }

        .rs-dfoot { border-top: 1px solid rgba(255,255,255,0.06); }
        .rs-dfoot-label {
          padding: 8px 10px; font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
          text-transform: uppercase; color: rgba(255,255,255,0.25); text-align: right;
        }
        .rs-dfoot-val {
          padding: 8px 10px; text-align: right;
          font-size: 15px; font-weight: 300; color: #B30000;
        }
        .rs-dfoot-max { font-size: 11px; color: rgba(255,255,255,0.2); }

        /* ── Light mode ───────────────────────────────── */
        [data-theme="light"] .rs-empty { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .rs-period { color: rgba(0,0,0,0.4); }
        [data-theme="light"] .rs-sub { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .rs-meta { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .rs-podium-info { background: rgba(0,0,0,0.02); border-color: rgba(0,0,0,0.08); }
        [data-theme="light"] .rs-podium-slot--1 .rs-podium-info { background: rgba(255,215,0,0.07); border-color: rgba(200,160,0,0.2); }
        [data-theme="light"] .rs-podium-slot--2 .rs-podium-info { background: rgba(160,160,160,0.06); border-color: rgba(140,140,140,0.18); }
        [data-theme="light"] .rs-podium-slot--3 .rs-podium-info { background: rgba(180,110,40,0.06); border-color: rgba(150,90,30,0.15); }
        [data-theme="light"] .rs-podium-name { color: #1a1a1a; }
        [data-theme="light"] .rs-podium-score { color: rgba(0,0,0,0.75); }
        [data-theme="light"] .rs-podium-pct { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .rs-table-wrap { background: #fff; border-color: rgba(0,0,0,0.08); }
        [data-theme="light"] .rs-th { background: #f5f5f5; color: rgba(0,0,0,0.35); border-bottom-color: rgba(0,0,0,0.07); }
        [data-theme="light"] .rs-tr { border-bottom-color: rgba(0,0,0,0.05); }
        [data-theme="light"] .rs-tr:hover { background: rgba(0,0,0,0.02); }
        [data-theme="light"] .rs-tr--expanded { background: rgba(0,0,0,0.02); }
        [data-theme="light"] .rs-td { color: rgba(0,0,0,0.7); }
        [data-theme="light"] .rs-rank-dash { color: rgba(0,0,0,0.2); }
        [data-theme="light"] .rs-dept-name { color: rgba(0,0,0,0.7); }
        [data-theme="light"] .rs-bar-track { background: rgba(0,0,0,0.09); }
        [data-theme="light"] .rs-score-val { color: #1a1a1a; }
        [data-theme="light"] .rs-pct-val { color: rgba(0,0,0,0.35); }
        [data-theme="light"] .rs-count { color: rgba(0,0,0,0.55); }
        [data-theme="light"] .rs-count-total { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .rs-chevron { color: rgba(0,0,0,0.2); }
        [data-theme="light"] .rs-detail-row { background: rgba(0,0,0,0.01); }
        [data-theme="light"] .rs-detail-cell { border-bottom-color: rgba(0,0,0,0.07); }
        [data-theme="light"] .rs-detail-inner { background: rgba(0,0,0,0.025); border-top-color: rgba(0,0,0,0.05); }
        [data-theme="light"] .rs-detail-empty { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .rs-dth { color: rgba(0,0,0,0.3); border-bottom-color: rgba(0,0,0,0.07); }
        [data-theme="light"] .rs-dtr { border-bottom-color: rgba(0,0,0,0.04); }
        [data-theme="light"] .rs-dtd { color: rgba(0,0,0,0.6); }
        [data-theme="light"] .rs-dbar-track { background: rgba(0,0,0,0.07); }
        [data-theme="light"] .rs-dfoot { border-top-color: rgba(0,0,0,0.07); }
        [data-theme="light"] .rs-dfoot-label { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .rs-dfoot-max { color: rgba(0,0,0,0.25); }
      `}</style>
    </div>
  )
}
