'use client'

import { useState, useMemo, useEffect } from 'react'

export interface CriterionInfo {
  id: string
  code: string | null
  name: string
  weight: number
  region?: string | null
}

export interface ScoreEntry {
  criteriaId: string
  rawScore: number | null
  weightedScore: number | null
}

export interface EvaluatorEntry {
  evaluatorId: string
  evaluatorCode: string | null
  evaluatorName: string
  totalScore: number | null
  scores: ScoreEntry[]
}

export interface TargetData {
  targetId: string
  targetName: string
  targetCode: string | null
  region?: string | null
  evaluators: EvaluatorEntry[]
}

interface Props {
  periodLabel: string
  criteria: CriterionInfo[]
  targets: TargetData[]
  role?: 'super_admin' | 'leadership' | 'department'
  myRegion?: string | null
}

function fmt(n: number | null, d = 2) {
  return n == null ? '—' : n.toFixed(d)
}

function avg(vals: (number | null)[]) {
  const nums = vals.filter(v => v != null) as number[]
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null
}

export default function DetailClient({ periodLabel, criteria, targets, role, myRegion = null }: Props) {
  const isDept = role === 'department'
  const canManageAll = role === 'super_admin' || role === 'leadership'

  const [regionFilter, setRegionFilter] = useState<'Miền Bắc' | 'Miền Nam'>(
    (myRegion as 'Miền Bắc' | 'Miền Nam') ?? 'Miền Bắc'
  )
  useEffect(() => {
    if (myRegion) return
    const saved = localStorage.getItem('region_filter') as 'Miền Bắc' | 'Miền Nam' | null
    if (saved === 'Miền Bắc' || saved === 'Miền Nam') setRegionFilter(saved)
  }, [myRegion])
  useEffect(() => {
    localStorage.setItem('region_filter', regionFilter)
  }, [regionFilter])

  const activeRegion = myRegion ?? regionFilter

  const displayCriteria = useMemo(
    () => criteria.filter(c => !c.region || c.region === activeRegion),
    [criteria, activeRegion]
  )

  const displayTargets = useMemo(
    () => targets.filter(t => (t.region ?? 'Miền Bắc') === activeRegion),
    [targets, activeRegion]
  )

  const maxScore = useMemo(
    () => displayCriteria.reduce((sum, c) => sum + c.weight * 10, 0),
    [displayCriteria]
  )

  const [selectedId, setSelectedId] = useState<string>(() => {
    const initTargets = targets.filter(t => (t.region ?? 'Miền Bắc') === (myRegion ?? 'Miền Bắc'))
    return initTargets[0]?.targetId ?? targets[0]?.targetId ?? ''
  })

  // Keep selectedId valid when region changes
  const effectiveSelectedId = displayTargets.find(t => t.targetId === selectedId)
    ? selectedId
    : (displayTargets[0]?.targetId ?? '')

  const target = useMemo(
    () => displayTargets.find(t => t.targetId === effectiveSelectedId),
    [displayTargets, effectiveSelectedId]
  )

  const criteriaAvgs = useMemo(() => {
    if (!target) return []
    return displayCriteria.map(c => {
      const rawVals = target.evaluators.map(e => e.scores.find(s => s.criteriaId === c.id)?.rawScore ?? null)
      const wVals   = target.evaluators.map(e => e.scores.find(s => s.criteriaId === c.id)?.weightedScore ?? null)
      return { criteriaId: c.id, avgRaw: avg(rawVals), avgWeighted: avg(wVals) }
    })
  }, [target, displayCriteria])

  const overallAvg = useMemo(() => {
    if (!target || target.evaluators.length === 0) return null
    return avg(target.evaluators.map(e => e.totalScore))
  }, [target])

  if (displayTargets.length === 0) {
    return (
      <div className="dt-empty">Chưa có đánh giá nào được nộp trong kỳ này.</div>
    )
  }

  return (
    <div className="dt-root">

      {/* ── Header + selector ── */}
      <div className="dt-header">
        <div className="dt-header-left">
          <span className="dt-period">{periodLabel}</span>
          <span className="dt-sub">Kết quả chi tiết</span>
          {myRegion === null ? (
            <div className="dt-region-tabs">
              {(['Miền Bắc', 'Miền Nam'] as const).map(r => (
                <button
                  key={r}
                  className={`dt-region-tab${regionFilter === r ? ' dt-region-tab--active' : ''}`}
                  onClick={() => setRegionFilter(r)}
                >{r}</button>
              ))}
            </div>
          ) : canManageAll ? (
            <span className="dt-region-badge">{myRegion}</span>
          ) : null}
        </div>
        <div className="dt-header-right">
          <span className="dt-selector-label">Phòng được đánh giá</span>
          <select
            className="dt-select"
            value={effectiveSelectedId}
            onChange={e => setSelectedId(e.target.value)}
          >
            {displayTargets.map(t => (
              <option key={t.targetId} value={t.targetId}>
                {t.targetCode ?? t.targetName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {target && (
        <>
          {/* ── Target summary ── */}
          <div className="dt-summary">
            <div className="dt-summary-name">
              {target.targetCode ?? target.targetName}
              {target.targetCode && target.targetCode !== target.targetName && (
                <span className="dt-summary-fullname"> — {target.targetName}</span>
              )}
            </div>
            <div className="dt-summary-stats">
              <div className="dt-stat">
                <span className="dt-stat-val">{target.evaluators.length}</span>
                <span className="dt-stat-lbl">đánh giá đã nộp</span>
              </div>
              <div className="dt-stat">
                <span className="dt-stat-val dt-stat-val--score">{fmt(overallAvg, 1)}</span>
                <span className="dt-stat-lbl">điểm trung bình / 100</span>
              </div>
              <div className="dt-stat">
                <span className="dt-stat-val dt-stat-val--pct">
                  {overallAvg != null ? `${overallAvg.toFixed(1)}%` : '—'}
                </span>
                <span className="dt-stat-lbl">% điểm tối đa</span>
              </div>
            </div>
          </div>

          {target.evaluators.length === 0 ? (
            <div className="dt-empty">Chưa có đánh giá nào từ các phòng ban.</div>
          ) : isDept ? (
            /* Simplified view for department users — average score only */
            <div className="dt-dept-result">
              <div className="dt-dept-avg-label">Điểm trung bình của phòng bạn</div>
              <div className="dt-dept-avg-score">
                {overallAvg != null ? overallAvg.toFixed(1) : '—'}
                <span className="dt-dept-avg-max"> / {maxScore}</span>
              </div>
              <div className="dt-dept-avg-pct">
                {overallAvg != null ? `${((overallAvg / maxScore) * 100).toFixed(1)}%` : '—'} điểm tối đa
              </div>
              <div className="dt-dept-count">{target.evaluators.length} lượt đánh giá đã nộp</div>
            </div>
          ) : (
            <>
              {/* ── Evaluator × Criteria matrix table ── */}
              <div className="dt-matrix-wrap">
                <table className="dt-matrix">
                  <thead>
                    <tr>
                      <th className="dt-th th-evaluator">Phòng đánh giá</th>
                      {displayCriteria.map(c => (
                        <th key={c.id} className="dt-th th-criterion">
                          <span className="dt-col-label">{c.code ?? c.name}</span>
                          <span className="dt-col-weight">×{c.weight}</span>
                        </th>
                      ))}
                      <th className="dt-th th-total">Tổng điểm<span className="dt-col-weight">/100</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {target.evaluators.map(ev => (
                      <tr key={ev.evaluatorId} className="dt-tr">
                        <td className="dt-td td-evaluator">
                          <span className="dt-eval-name">{ev.evaluatorCode ?? ev.evaluatorName}</span>
                        </td>
                        {displayCriteria.map(c => {
                          const s = ev.scores.find(s => s.criteriaId === c.id)
                          const raw = s?.rawScore ?? null
                          return (
                            <td key={c.id} className="dt-td td-criterion">
                              {raw != null ? (
                                <span className={`dt-score ${raw >= 8 ? 'dt-score--hi' : raw >= 5 ? 'dt-score--mid' : 'dt-score--lo'}`}>
                                  {raw % 1 === 0 ? raw : raw.toFixed(1)}
                                </span>
                              ) : (
                                <span className="dt-score-empty">—</span>
                              )}
                            </td>
                          )
                        })}
                        <td className="dt-td td-total">
                          <span className="dt-total-val">{fmt(ev.totalScore, 1)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="dt-avg-row">
                      <td className="dt-avg-label">Trung bình</td>
                      {criteriaAvgs.map(ca => (
                        <td key={ca.criteriaId} className="dt-td td-criterion dt-avg-cell">
                          <span className="dt-avg-val">{fmt(ca.avgRaw, 1)}</span>
                        </td>
                      ))}
                      <td className="dt-avg-total">
                        <span className="dt-avg-total-val">{fmt(overallAvg, 1)}</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </>
      )}

      <style>{`
        .dt-root {
          display: flex; flex-direction: column; gap: 18px;
          font-family: var(--font-sans), sans-serif;
          animation: dtFade 0.3s ease both;
        }
        @keyframes dtFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

        .dt-empty { color: rgba(255,255,255,0.2); font-size: 13px; font-style: italic; padding: 48px 0; }

        /* ── Header ── */
        .dt-header {
          display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
        }
        .dt-header-left { display: flex; align-items: baseline; gap: 10px; }
        .dt-period {
          font-size: 12px; font-weight: 700; letter-spacing: 0.1em;
          text-transform: uppercase; color: rgba(255,255,255,0.4);
        }
        .dt-sub { font-size: 13px; color: rgba(255,255,255,0.25); font-style: italic; }

        .dt-region-tabs { display: flex; align-items: center; gap: 2px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 3px; }
        .dt-region-tab { padding: 3px 11px; border-radius: 5px; border: none; cursor: pointer; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; background: transparent; color: rgba(255,255,255,0.35); font-family: var(--font-sans), sans-serif; transition: background 0.15s, color 0.15s; }
        .dt-region-tab:hover { color: rgba(255,255,255,0.6); background: rgba(255,255,255,0.05); }
        .dt-region-tab--active { background: #B30000; color: #fff; }
        .dt-region-tab--active:hover { background: #cc0000; }
        .dt-region-badge { padding: 3px 11px; border-radius: 5px; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; background: #B30000; color: #fff; }

        .dt-header-right { display: flex; align-items: center; gap: 10px; }
        .dt-selector-label { font-size: 11px; color: rgba(255,255,255,0.3); white-space: nowrap; }
        .dt-select {
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px; padding: 7px 12px; font-size: 13px; font-weight: 600;
          color: rgba(255,255,255,0.85); font-family: var(--font-sans), sans-serif;
          outline: none; cursor: pointer; transition: border-color 0.15s;
          min-width: 120px;
        }
        .dt-select:focus { border-color: rgba(179,0,0,0.5); }
        .dt-select option { background: #1a1a1a; }

        /* ── Summary ── */
        .dt-summary {
          display: flex; align-items: center; gap: 24px; flex-wrap: wrap;
          padding: 16px 20px; border-radius: 12px;
          background: rgba(179,0,0,0.04); border: 1px solid rgba(179,0,0,0.12);
        }
        .dt-summary-name {
          font-size: 20px; font-weight: 700; color: #fff; letter-spacing: 0.04em;
        }
        .dt-summary-fullname { font-size: 14px; font-weight: 400; color: rgba(255,255,255,0.4); letter-spacing: 0; }
        .dt-summary-stats { display: flex; gap: 28px; margin-left: auto; }
        .dt-stat { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
        .dt-stat-val { font-size: 22px; font-weight: 300; color: rgba(255,255,255,0.8); letter-spacing: -0.02em; line-height: 1; }
        .dt-stat-val--score { color: #B30000; }
        .dt-stat-val--pct  { color: rgba(255,255,255,0.5); }
        .dt-stat-lbl { font-size: 10px; color: rgba(255,255,255,0.25); letter-spacing: 0.04em; text-align: right; }

        /* ── Matrix table ── */
        .dt-matrix-wrap {
          overflow: auto; border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.015);
          scrollbar-width: thin; scrollbar-color: rgba(179,0,0,0.15) transparent;
          max-height: 420px;
        }
        .dt-matrix-wrap::-webkit-scrollbar { width: 4px; height: 4px; }
        .dt-matrix-wrap::-webkit-scrollbar-thumb { background: rgba(179,0,0,0.15); border-radius: 4px; }

        .dt-matrix { border-collapse: collapse; width: 100%; }

        /* ── Dept simplified result ── */
        .dt-dept-result {
          display: flex; flex-direction: column; align-items: center; gap: 10px;
          padding: 48px 32px; border-radius: 14px;
          background: rgba(179,0,0,0.04); border: 1px solid rgba(179,0,0,0.12);
          text-align: center;
        }
        .dt-dept-avg-label { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.3); }
        .dt-dept-avg-score { font-size: 64px; font-weight: 200; letter-spacing: -0.04em; color: #B30000; line-height: 1; }
        .dt-dept-avg-max { font-size: 22px; font-weight: 300; color: rgba(255,255,255,0.2); }
        .dt-dept-avg-pct { font-size: 14px; color: rgba(255,255,255,0.35); }
        .dt-dept-count { font-size: 12px; color: rgba(255,255,255,0.2); font-style: italic; margin-top: 4px; }

        [data-theme="light"] .dt-dept-result { background: #fff; border-color: rgba(0,0,0,0.08); }
        [data-theme="light"] .dt-dept-avg-label { color: rgba(0,0,0,0.35); }
        [data-theme="light"] .dt-dept-avg-max { color: rgba(0,0,0,0.25); }
        [data-theme="light"] .dt-dept-avg-pct { color: rgba(0,0,0,0.4); }
        [data-theme="light"] .dt-dept-count { color: rgba(0,0,0,0.3); }

        .dt-th {
          padding: 8px 12px; text-align: center;
          font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
          color: rgba(255,255,255,0.25); border-bottom: 1px solid rgba(255,255,255,0.06);
          white-space: nowrap; position: sticky; top: 0; background: #0e0e0e; z-index: 1;
        }
        .th-evaluator { text-align: left; min-width: 80px; position: sticky; left: 0; z-index: 2; }
        .th-criterion { min-width: 60px; }
        .th-total { min-width: 80px; }

        .dt-col-label { display: block; }
        .dt-col-weight { display: block; color: rgba(255,255,255,0.2); font-size: 9px; font-weight: 400; margin-top: 1px; }

        .dt-tr { border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.1s; }
        .dt-tr:hover { background: rgba(255,255,255,0.02); }

        .dt-td { padding: 10px 12px; vertical-align: middle; text-align: center; }
        .td-evaluator {
          text-align: left; white-space: nowrap;
          position: sticky; left: 0; background: #0e0e0e;
          border-right: 1px solid rgba(255,255,255,0.05);
          z-index: 1;
        }
        .dt-tr:hover .td-evaluator { background: #111; }
        [data-theme="light"] .dt-tr:hover .td-evaluator { background: #eeeeef; }
        .dt-eval-name { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.6); letter-spacing: 0.04em; }

        .dt-score {
          display: inline-block; font-size: 13px; font-weight: 600;
          padding: 2px 6px; border-radius: 5px;
        }
        .dt-score--hi  { color: #4ade80; background: rgba(74,222,128,0.08); }
        .dt-score--mid { color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.05); }
        .dt-score--lo  { color: #f87171; background: rgba(248,113,113,0.08); }
        .dt-score-empty { color: rgba(255,255,255,0.15); font-size: 12px; }

        .td-total { border-left: 1px solid rgba(255,255,255,0.05); }
        .dt-total-val { font-size: 13px; font-weight: 600; color: rgba(179,0,0,0.9); }

        /* Average footer row */
        .dt-avg-row { border-top: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.02); }
        .dt-avg-label {
          padding: 8px 12px; font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
          text-transform: uppercase; color: rgba(255,255,255,0.3);
          text-align: left; white-space: nowrap;
          position: sticky; left: 0; background: rgba(20,20,20,0.95);
          border-right: 1px solid rgba(255,255,255,0.05);
        }
        .dt-avg-cell { }
        .dt-avg-val { font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.5); }
        .dt-avg-total { padding: 8px 12px; text-align: center; border-left: 1px solid rgba(255,255,255,0.05); }
        .dt-avg-total-val { font-size: 14px; font-weight: 700; color: #B30000; }

        /* ── Light mode ───────────────────────────────── */
        [data-theme="light"] .dt-empty { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .dt-period { color: rgba(0,0,0,0.4); }
        [data-theme="light"] .dt-sub { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .dt-selector-label { color: rgba(0,0,0,0.35); }
        [data-theme="light"] .dt-select { background: rgba(0,0,0,0.04); border-color: rgba(0,0,0,0.1); color: rgba(0,0,0,0.8); }
        [data-theme="light"] .dt-select option { background: #fff; color: #1a1a1a; }
        [data-theme="light"] .dt-summary { background: #fff; border-color: rgba(0,0,0,0.08); }
        [data-theme="light"] .dt-summary-name { color: #1a1a1a; }
        [data-theme="light"] .dt-summary-fullname { color: rgba(0,0,0,0.4); }
        [data-theme="light"] .dt-stat-val { color: rgba(0,0,0,0.7); }
        [data-theme="light"] .dt-stat-lbl { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .dt-matrix-wrap { border-color: rgba(0,0,0,0.08); }
        [data-theme="light"] .dt-th { background: rgba(0,0,0,0.03); color: rgba(0,0,0,0.4); border-bottom-color: rgba(0,0,0,0.07); }
        [data-theme="light"] .th-evaluator { background: #f7f7f8; }
        [data-theme="light"] .dt-col-weight { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .dt-tr { border-bottom-color: rgba(0,0,0,0.05); }
        [data-theme="light"] .td-evaluator { background: #f7f7f8; }
        [data-theme="light"] .dt-eval-name { color: rgba(0,0,0,0.6); }
        [data-theme="light"] .dt-score--mid { color: rgba(0,0,0,0.7); background: rgba(0,0,0,0.05); }
        [data-theme="light"] .dt-score-empty { color: rgba(0,0,0,0.2); }
        [data-theme="light"] .td-total { border-left-color: rgba(0,0,0,0.07); }
        [data-theme="light"] .dt-avg-row { border-top-color: rgba(0,0,0,0.09); background: rgba(0,0,0,0.025); }
        [data-theme="light"] .dt-avg-label { background: #f7f7f8; color: rgba(0,0,0,0.35); }
        [data-theme="light"] .dt-avg-val { color: rgba(0,0,0,0.5); }
        [data-theme="light"] .dt-avg-total { border-left-color: rgba(0,0,0,0.07); }
      `}</style>
    </div>
  )
}
