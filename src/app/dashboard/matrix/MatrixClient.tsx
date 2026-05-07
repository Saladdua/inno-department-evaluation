'use client'

import { useState, useTransition, useMemo } from 'react'
import { Trash2, Info } from 'lucide-react'

export interface Department {
  id: string
  name: string
  code: string | null
  display_order: number
}

export interface MatrixEntry {
  evaluator_id: string
  target_id: string
  selected_by: string | null
}

type Role = 'super_admin' | 'leadership' | 'department'

function deptLabel(d: Department) {
  return d.code ?? d.name
}

export default function MatrixClient({
  initialDepts,
  initialEntries,
  periodId,
  periodLabel,
  role,
  myDeptId,
  myUserId,
}: {
  initialDepts: Department[]
  initialEntries: MatrixEntry[]
  periodId: string | null
  periodLabel: string
  role: Role
  myDeptId: string | null
  myUserId: string | null
}) {
  const [entries, setEntries] = useState<MatrixEntry[]>(initialEntries)
  const [isPending, startTransition] = useTransition()
  const [confirmClear, setConfirmClear] = useState(false)

  const canManageAll = role === 'super_admin' || role === 'leadership'
  const depts = initialDepts

  // Index map: deptId → position in ordered array
  const deptIndex = useMemo(
    () => new Map(depts.map((d, i) => [d.id, i])),
    [depts]
  )

  const entrySet = useMemo(
    () => new Set(entries.map(e => `${e.evaluator_id}:${e.target_id}`)),
    [entries]
  )

  function hasEntry(evaluatorId: string, targetId: string) {
    return entrySet.has(`${evaluatorId}:${targetId}`)
  }

  // Upper triangle: row (evaluator) index must be strictly less than col (target) index
  function isUpperTriangle(rowId: string, colId: string): boolean {
    const ri = deptIndex.get(rowId) ?? -1
    const ci = deptIndex.get(colId) ?? -1
    return ri < ci
  }

  function canInteractCell(rowId: string, colId: string): boolean {
    if (!periodId) return false
    if (rowId === colId) return false
    if (!isUpperTriangle(rowId, colId)) return false
    if (canManageAll) return true
    return role === 'department' && myDeptId === rowId
  }

  function toggle(evaluatorId: string, targetId: string) {
    if (!periodId) return
    const active = hasEntry(evaluatorId, targetId)
    const action = active ? 'remove' : 'add'

    if (action === 'add') {
      setEntries(prev => [
        ...prev,
        { evaluator_id: evaluatorId, target_id: targetId, selected_by: myUserId },
      ])
    } else {
      setEntries(prev => prev.filter(
        e => !(e.evaluator_id === evaluatorId && e.target_id === targetId)
      ))
    }

    startTransition(async () => {
      const res = await fetch('/api/matrix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_id: periodId, evaluator_id: evaluatorId, target_id: targetId, action }),
      })
      if (res.ok) {
        const data = await res.json()
        setEntries(data.entries)
      }
    })
  }

  function clearAll() {
    if (!periodId) return
    setConfirmClear(false)
    setEntries([])
    startTransition(async () => {
      await fetch('/api/matrix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_id: periodId, action: 'clear' }),
      })
    })
  }

  // Count how many depts each evaluator is evaluating
  const evaluatingCount = useMemo(() => {
    const map: Record<string, number> = {}
    depts.forEach(d => { map[d.id] = 0 })
    entries.forEach(e => { map[e.evaluator_id] = (map[e.evaluator_id] ?? 0) + 1 })
    return map
  }, [entries, depts])

  const totalLinks = useMemo(() => entries.length, [entries])

  // My row: depts I'm evaluating (I'm evaluator)
  const myEvaluating = useMemo(
    () => entries.filter(e => e.evaluator_id === myDeptId),
    [entries, myDeptId]
  )
  // My col: depts that chose me (I'm target)
  const chosenByOthers = useMemo(
    () => entries.filter(e => e.target_id === myDeptId),
    [entries, myDeptId]
  )

  const myRowIndex = myDeptId ? (deptIndex.get(myDeptId) ?? -1) : -1
  const isLastDept = myRowIndex === depts.length - 1

  if (!periodId) {
    return (
      <div className="mx-empty">
        <Info size={18} />
        <span>Chưa có kỳ đánh giá. Vui lòng tạo kỳ đánh giá trước.</span>
      </div>
    )
  }

  return (
    <div className="mx-root">

      {/* ── Header ── */}
      <div className="mx-header">
        <div className="mx-header-left">
          <span className="mx-period">{periodLabel}</span>
          <span className="mx-stat">{totalLinks} lượt chọn</span>
        </div>
        {canManageAll && (
          <div className="mx-header-right">
            {confirmClear ? (
              <>
                <span className="mx-confirm-text">Xoá toàn bộ ma trận?</span>
                <button className="mx-btn mx-btn--danger" onClick={clearAll} disabled={isPending}>Xác nhận</button>
                <button className="mx-btn mx-btn--ghost" onClick={() => setConfirmClear(false)}>Huỷ</button>
              </>
            ) : (
              <button className="mx-btn mx-btn--ghost" onClick={() => setConfirmClear(true)}>
                <Trash2 size={13} /> Xoá tất cả
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Role hint ── */}
      {role === 'department' && myDeptId && (
        <div className="mx-hint">
          <span className="mx-hint-dept">{depts.find(d => d.id === myDeptId) ? deptLabel(depts.find(d => d.id === myDeptId)!) : ''}</span>
          {isLastDept ? (
            <span className="mx-hint-text"> — phòng ban của bạn không thể chọn đánh giá. Bạn sẽ được các phòng ban khác chọn.</span>
          ) : (
            <span className="mx-hint-text"> — tick chọn các phòng ban phía dưới bạn trong ma trận để đánh giá.</span>
          )}
        </div>
      )}

      {/* ── Body ── */}
      <div className={`mx-body${(canManageAll || (role === 'department' && !!myDeptId)) ? ' mx-body--split' : ''}`}>

        {/* Matrix grid */}
        <div className="mx-grid-wrap">
          <table className="mx-table">
            <thead>
              <tr>
                <th className="mx-corner" />
                {depts.map(d => (
                  <th key={d.id} className="mx-col-head">
                    <span className="mx-col-label">{deptLabel(d)}</span>
                  </th>
                ))}
                <th className="mx-count-head">
                  <span className="mx-col-label">#</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {depts.map((row, ri) => {
                const isMyRow = row.id === myDeptId
                return (
                  <tr key={row.id} className={`mx-row ${isMyRow ? 'mx-row--mine' : ''}`}>
                    <td className="mx-row-head">
                      <span className={`mx-row-label ${isMyRow ? 'mx-row-label--mine' : ''}`}>
                        {deptLabel(row)}
                      </span>
                    </td>
                    {depts.map((col, ci) => {
                      const isDiag = ri === ci
                      const isLower = ci < ri
                      const checked = hasEntry(row.id, col.id)
                      const interactive = canInteractCell(row.id, col.id)

                      if (isDiag) {
                        return <td key={col.id} className="mx-cell mx-cell--diag" />
                      }
                      if (isLower) {
                        return <td key={col.id} className="mx-cell mx-cell--blocked" />
                      }

                      return (
                        <td
                          key={col.id}
                          className={`mx-cell ${checked ? 'mx-cell--on' : ''} ${interactive ? 'mx-cell--interactive' : ''}`}
                          onClick={() => interactive && toggle(row.id, col.id)}
                          title={
                            interactive
                              ? checked
                                ? `Bỏ chọn: ${deptLabel(row)} → ${deptLabel(col)}`
                                : `Chọn: ${deptLabel(row)} → ${deptLabel(col)}`
                              : undefined
                          }
                        >
                          {checked && <span className="mx-dot" />}
                        </td>
                      )
                    })}
                    <td className="mx-count-cell">
                      {(evaluatingCount[row.id] ?? 0) > 0 && (
                        <span className="mx-count">{evaluatingCount[row.id]}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* ── Chart panel (admin/leadership) ── */}
        {canManageAll && (
          <div className="mx-chart-panel">
            <div className="mx-chart-header">
              <span className="mx-chart-title">Số phòng đang đánh giá</span>
              <span className="mx-chart-sub">Tối đa {depts.length - 1}</span>
            </div>
            <div className="mx-chart-content">
              <div className="mx-chart-y-labels">
                <span className="mx-chart-y-val">{depts.length - 1}</span>
                <span className="mx-chart-y-val">{Math.round((depts.length - 1) / 2)}</span>
                <span className="mx-chart-y-val">0</span>
              </div>
              <div className="mx-chart-bars-wrap">
                {depts.map(d => {
                  const count = evaluatingCount[d.id] ?? 0
                  const maxCount = Math.max(depts.length - 1, 1)
                  const pct = (count / maxCount) * 100
                  return (
                    <div key={d.id} className="mx-bar-col">
                      <span className="mx-bar-num">{count > 0 ? count : ''}</span>
                      <div className="mx-bar-track">
                        <div style={{ flex: 100 - pct, minHeight: 0 }} />
                        <div className="mx-bar-fill" style={{ flex: Math.max(pct, count > 0 ? 2 : 0) }} />
                      </div>
                      <span className="mx-bar-lbl">{deptLabel(d)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Summary panel (department) ── */}
        {role === 'department' && myDeptId && (
          <div className="mx-summary-panel">
            {!isLastDept && (
              <div className="mx-summary-section">
                <span className="mx-summary-title">Bạn đang đánh giá ({myEvaluating.length})</span>
                <div className="mx-tag-list">
                  {myEvaluating.length === 0 ? (
                    <span className="mx-tag-empty">Chưa chọn phòng ban nào</span>
                  ) : myEvaluating.map(e => {
                    const d = depts.find(d => d.id === e.target_id)
                    return d ? <span key={e.target_id} className="mx-tag mx-tag--active">{deptLabel(d)}</span> : null
                  })}
                </div>
              </div>
            )}
            <div className="mx-summary-section">
              <span className="mx-summary-title">Phòng ban chọn bạn ({chosenByOthers.length})</span>
              <div className="mx-tag-list">
                {chosenByOthers.length === 0 ? (
                  <span className="mx-tag-empty">Chưa có phòng ban nào chọn</span>
                ) : chosenByOthers.map(e => {
                  const d = depts.find(d => d.id === e.evaluator_id)
                  return d ? <span key={e.evaluator_id} className="mx-tag mx-tag--required">{deptLabel(d)}</span> : null
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .mx-root { display: flex; flex-direction: column; gap: 20px; font-family: var(--font-sans), sans-serif; }

        .mx-empty {
          display: flex; align-items: center; gap: 10px;
          color: rgba(255,255,255,0.25); font-size: 13px; font-style: italic; padding: 48px 0;
        }

        /* Header */
        .mx-header {
          display: flex; align-items: center; justify-content: space-between; gap: 16px;
          animation: mxFadeUp 0.35s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        @keyframes mxFadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .mx-header-left { display: flex; align-items: center; gap: 12px; }
        .mx-period { font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.4); }
        .mx-stat { font-size: 12px; color: rgba(179,0,0,0.8); background: rgba(179,0,0,0.08); border: 1px solid rgba(179,0,0,0.18); padding: 2px 10px; border-radius: 20px; }
        .mx-header-right { display: flex; align-items: center; gap: 8px; }
        .mx-confirm-text { font-size: 12px; color: rgba(255,100,100,0.8); font-style: italic; }
        .mx-btn {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 5px 12px; border-radius: 7px; border: none;
          font-size: 12px; cursor: pointer; font-family: var(--font-sans), sans-serif;
          transition: background 0.15s, transform 0.15s;
        }
        .mx-btn:hover:not(:disabled) { transform: translateY(-1px); }
        .mx-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .mx-btn--ghost { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.45); }
        .mx-btn--ghost:hover { background: rgba(255,255,255,0.09); color: rgba(255,255,255,0.7); }
        .mx-btn--danger { background: rgba(255,50,50,0.15); color: rgba(255,100,100,0.9); border: 1px solid rgba(255,50,50,0.2); }
        .mx-btn--danger:hover { background: rgba(255,50,50,0.22); }

        /* Hint */
        .mx-hint {
          font-size: 12.5px; color: rgba(255,255,255,0.35); font-style: italic;
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05);
          border-left: 3px solid rgba(179,0,0,0.4); border-radius: 8px;
          padding: 10px 14px; animation: mxFadeUp 0.4s 0.05s both;
        }
        .mx-hint-dept { color: #B30000; font-style: normal; font-weight: 600; }

        /* Body layout */
        .mx-body { display: flex; flex-direction: column; gap: 20px; }
        .mx-body--split { flex-direction: row; align-items: stretch; }

        /* Grid */
        .mx-grid-wrap {
          flex: 0 0 auto;
          overflow-x: auto; overflow-y: visible;
          border-radius: 12px; border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.015);
          box-shadow: 0 4px 24px rgba(0,0,0,0.3);
          scrollbar-width: thin; scrollbar-color: rgba(179,0,0,0.2) transparent;
          animation: mxFadeUp 0.45s 0.08s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        .mx-grid-wrap::-webkit-scrollbar { width: 4px; height: 4px; }
        .mx-grid-wrap::-webkit-scrollbar-thumb { background: rgba(179,0,0,0.2); border-radius: 4px; }
        .mx-table { border-collapse: collapse; }

        .mx-corner {
          position: sticky; left: 0; top: 0; z-index: 3;
          background: #0e0e0e; width: 80px; min-width: 80px;
          border-right: 1px solid rgba(255,255,255,0.06);
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .mx-col-head {
          position: sticky; top: 0; z-index: 2; background: #0e0e0e; padding: 0;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          text-align: center; min-width: 44px;
        }
        .mx-count-head {
          position: sticky; top: 0; right: 0; z-index: 3; background: #0e0e0e; padding: 0;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          border-left: 1px solid rgba(255,255,255,0.06);
          text-align: center; min-width: 36px;
        }
        .mx-col-label {
          display: block; padding: 10px 4px; writing-mode: vertical-rl;
          transform: rotate(180deg); font-size: 10px; font-weight: 600;
          color: rgba(255,255,255,0.3); letter-spacing: 0.06em; white-space: nowrap;
        }

        .mx-row-head {
          position: sticky; left: 0; z-index: 1; background: #0e0e0e;
          padding: 0 12px 0 14px; border-right: 1px solid rgba(255,255,255,0.06);
          width: 80px; min-width: 80px;
        }
        .mx-row-label { display: block; font-size: 11px; font-weight: 500; color: rgba(255,255,255,0.3); white-space: nowrap; letter-spacing: 0.04em; }
        .mx-row-label--mine { color: #B30000; font-weight: 700; }

        .mx-row { border-top: 1px solid rgba(255,255,255,0.04); transition: background 0.1s; }
        .mx-row:hover .mx-row-head { background: #111; }
        .mx-row--mine { background: rgba(179,0,0,0.03); }
        .mx-row--mine .mx-row-head { background: rgba(179,0,0,0.06); }

        .mx-cell { width: 44px; height: 38px; text-align: center; vertical-align: middle; padding: 0; position: relative; transition: background 0.1s; }
        .mx-cell--diag { background: rgba(255,255,255,0.03); }
        .mx-cell--diag::after { content: ''; position: absolute; inset: 6px; border-radius: 4px; background: rgba(255,255,255,0.04); }
        .mx-cell--blocked {
          background: repeating-linear-gradient(
            -45deg,
            rgba(255,255,255,0.015) 0px,
            rgba(255,255,255,0.015) 2px,
            transparent 2px,
            transparent 8px
          );
          cursor: not-allowed;
        }
        .mx-cell--interactive { cursor: pointer; }
        .mx-cell--interactive:hover { background: rgba(179,0,0,0.06); }
        .mx-cell--on { background: rgba(179,0,0,0.08); }
        .mx-cell--on.mx-cell--interactive:hover { background: rgba(179,0,0,0.14); }

        .mx-dot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: #B30000; box-shadow: 0 0 6px rgba(179,0,0,0.6); }

        .mx-count-cell {
          position: sticky; right: 0; z-index: 1; background: #0e0e0e;
          text-align: center; border-left: 1px solid rgba(255,255,255,0.06); padding: 0 8px;
        }
        .mx-count { display: inline-block; font-size: 11px; font-weight: 600; color: rgba(179,0,0,0.8); }

        /* Chart panel */
        .mx-chart-panel {
          flex: 1; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05);
          border-radius: 12px; padding: 20px 24px;
          display: flex; flex-direction: column; gap: 16px;
          animation: mxFadeUp 0.45s 0.12s both; min-width: 0;
        }
        .mx-chart-header { display: flex; align-items: baseline; justify-content: space-between; }
        .mx-chart-title { font-size: 12px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: rgba(255,255,255,0.4); font-family: monospace; }
        .mx-chart-sub { font-size: 11px; color: rgba(179,0,0,0.7); font-family: monospace; font-weight: 600; }
        .mx-chart-content { flex: 1; display: flex; gap: 12px; min-height: 0; }
        .mx-chart-y-labels { display: flex; flex-direction: column; justify-content: space-between; padding-bottom: 28px; padding-top: 24px; flex-shrink: 0; }
        .mx-chart-y-val { font-size: 11px; color: rgba(255,255,255,0.2); font-family: monospace; text-align: right; line-height: 1; }
        .mx-chart-bars-wrap { flex: 1; display: flex; align-items: stretch; gap: 10px; min-width: 0; }
        .mx-bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 0; }
        .mx-bar-num { font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.6); height: 20px; line-height: 20px; font-family: monospace; }
        .mx-bar-track { flex: 1; width: 100%; background: rgba(255,255,255,0.05); border-radius: 6px; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }
        .mx-bar-fill { background: linear-gradient(to top, #B30000, rgba(220,50,50,0.6)); border-radius: 4px 4px 0 0; box-shadow: 0 -4px 14px rgba(179,0,0,0.3); }
        .mx-bar-lbl { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.35); text-align: center; letter-spacing: 0.04em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; font-family: monospace; }

        /* Summary panel */
        .mx-summary-panel {
          flex: 1; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05);
          border-radius: 12px; padding: 20px 24px;
          display: flex; flex-direction: column; gap: 20px;
          animation: mxFadeUp 0.45s 0.12s both; min-width: 0;
        }
        .mx-summary-section { display: flex; flex-direction: column; gap: 10px; }
        .mx-summary-title { font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.35); font-family: monospace; }
        .mx-tag-list { display: flex; flex-wrap: wrap; gap: 6px; }
        .mx-tag-empty { font-size: 12px; color: rgba(255,255,255,0.2); font-style: italic; }
        .mx-tag { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 500; }
        .mx-tag--active { background: rgba(179,0,0,0.12); color: rgba(255,120,120,0.9); border: 1px solid rgba(179,0,0,0.25); }
        .mx-tag--required { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.4); border: 1px solid rgba(255,255,255,0.1); }

        /* ── Light mode ── */
        [data-theme="light"] .mx-period { color: rgba(0,0,0,0.4); }
        [data-theme="light"] .mx-btn--ghost { background: rgba(0,0,0,0.05); color: rgba(0,0,0,0.5); }
        [data-theme="light"] .mx-hint { color: rgba(0,0,0,0.4); background: rgba(0,0,0,0.02); border-color: rgba(0,0,0,0.06); }
        [data-theme="light"] .mx-grid-wrap { background: #fff; border-color: rgba(0,0,0,0.08); }
        [data-theme="light"] .mx-corner { background: #f5f5f5; border-right-color: rgba(0,0,0,0.07); border-bottom-color: rgba(0,0,0,0.07); }
        [data-theme="light"] .mx-col-head { background: #f5f5f5; border-bottom-color: rgba(0,0,0,0.07); }
        [data-theme="light"] .mx-count-head { background: #f5f5f5; border-color: rgba(0,0,0,0.07); }
        [data-theme="light"] .mx-col-label { color: rgba(0,0,0,0.4); }
        [data-theme="light"] .mx-row-head { background: #fff; border-right-color: rgba(0,0,0,0.06); }
        [data-theme="light"] .mx-row:hover .mx-row-head { background: #f9f9f9; }
        [data-theme="light"] .mx-row--mine .mx-row-head { background: rgba(179,0,0,0.04); }
        [data-theme="light"] .mx-row-label { color: rgba(0,0,0,0.4); }
        [data-theme="light"] .mx-row { border-top-color: rgba(0,0,0,0.05); }
        [data-theme="light"] .mx-cell--diag { background: rgba(0,0,0,0.03); }
        [data-theme="light"] .mx-cell--blocked {
          background: repeating-linear-gradient(
            -45deg,
            rgba(0,0,0,0.03) 0px, rgba(0,0,0,0.03) 2px,
            transparent 2px, transparent 8px
          );
        }
        [data-theme="light"] .mx-count-cell { background: #f5f5f5; border-left-color: rgba(0,0,0,0.07); }
        [data-theme="light"] .mx-chart-panel { background: rgba(0,0,0,0.02); border-color: rgba(0,0,0,0.07); }
        [data-theme="light"] .mx-chart-title { color: rgba(0,0,0,0.45); }
        [data-theme="light"] .mx-chart-y-val { color: rgba(0,0,0,0.25); }
        [data-theme="light"] .mx-bar-track { background: rgba(0,0,0,0.08); }
        [data-theme="light"] .mx-bar-lbl { color: rgba(0,0,0,0.4); }
        [data-theme="light"] .mx-bar-num { color: rgba(0,0,0,0.6); }
        [data-theme="light"] .mx-summary-panel { background: rgba(0,0,0,0.02); border-color: rgba(0,0,0,0.07); }
        [data-theme="light"] .mx-summary-title { color: rgba(0,0,0,0.4); }
        [data-theme="light"] .mx-tag-empty { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .mx-tag--required { background: rgba(0,0,0,0.05); color: rgba(0,0,0,0.45); border-color: rgba(0,0,0,0.1); }
        [data-theme="light"] .mx-empty { color: rgba(0,0,0,0.3); }
      `}</style>
    </div>
  )
}
