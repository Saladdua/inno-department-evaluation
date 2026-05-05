'use client'

import { useState, useTransition, useMemo } from 'react'
import { CheckCircle2, Clock, Circle, ChevronRight, Send, Save } from 'lucide-react'

export interface Criterion {
  id: string
  code: string | null
  name: string
  weight: number
  input_type: 'manual' | 'auto'
  display_order: number
}

export interface Department {
  id: string
  name: string
  code: string | null
}

export interface MatrixEntry {
  evaluator_id: string
  target_id: string
}

export interface EvaluationRow {
  id: string
  evaluator_id: string
  target_id: string
  status: 'draft' | 'submitted'
  total_score: number | null
}

export interface ScoreRow {
  evaluation_id: string
  criteria_id: string
  raw_score: number | null
  note: string | null
}

type Role = 'super_admin' | 'leadership' | 'department'

interface DraftScore {
  raw_score: string
  note: string
}

interface Props {
  periodId: string
  periodLabel: string
  criteria: Criterion[]
  depts: Department[]
  matrix: MatrixEntry[]
  initialEvaluations: EvaluationRow[]
  initialScores: ScoreRow[]
  role: Role
  myDeptId: string | null
}

function getDeptName(depts: Department[], id: string) {
  return depts.find(d => d.id === id)?.name ?? id
}

function getDeptLabel(depts: Department[], id: string) {
  const d = depts.find(d => d.id === id)
  return d ? (d.code ?? d.name) : id
}

export default function EvaluateClient({
  periodId,
  periodLabel,
  criteria,
  depts,
  matrix,
  initialEvaluations,
  initialScores,
  role,
  myDeptId,
}: Props) {
  const canManageAll = role === 'super_admin' || role === 'leadership'

  const evaluatorIds = useMemo(() => {
    return [...new Set(matrix.map(e => e.evaluator_id))]
  }, [matrix])

  const [selectedEvaluatorId, setSelectedEvaluatorId] = useState<string>(
    canManageAll ? (evaluatorIds[0] ?? '') : (myDeptId ?? '')
  )
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null)
  const [evaluations, setEvaluations] = useState<EvaluationRow[]>(initialEvaluations)
  const [scoresMap, setScoresMap] = useState<Record<string, ScoreRow[]>>(() => {
    const map: Record<string, ScoreRow[]> = {}
    initialScores.forEach(s => {
      if (!map[s.evaluation_id]) map[s.evaluation_id] = []
      map[s.evaluation_id].push(s)
    })
    return map
  })
  const [draftScores, setDraftScores] = useState<Record<string, DraftScore>>({})
  const [isPending, startTransition] = useTransition()
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const evalByPair = useMemo(() => {
    const map: Record<string, EvaluationRow> = {}
    evaluations.forEach(e => { map[`${e.evaluator_id}:${e.target_id}`] = e })
    return map
  }, [evaluations])

  function getEval(evaluatorId: string, targetId: string): EvaluationRow | null {
    return evalByPair[`${evaluatorId}:${targetId}`] ?? null
  }

  const assignments = useMemo(
    () => matrix.filter(e => e.evaluator_id === selectedEvaluatorId),
    [matrix, selectedEvaluatorId]
  )

  function buildDraftFromEval(evaluatorId: string, targetId: string): Record<string, DraftScore> {
    const draft: Record<string, DraftScore> = {}
    criteria.forEach(c => { draft[c.id] = { raw_score: '', note: '' } })
    const ev = getEval(evaluatorId, targetId)
    if (ev) {
      const existingScores = scoresMap[ev.id] ?? []
      existingScores.forEach(s => {
        draft[s.criteria_id] = {
          raw_score: s.raw_score != null ? String(s.raw_score) : '',
          note: s.note ?? '',
        }
      })
    }
    return draft
  }

  function selectAssignment(targetId: string) {
    setSelectedTargetId(targetId)
    setDraftScores(buildDraftFromEval(selectedEvaluatorId, targetId))
    setSaveStatus('idle')
  }

  function handleScoreChange(criteriaId: string, field: 'raw_score' | 'note', value: string) {
    setDraftScores(prev => ({
      ...prev,
      [criteriaId]: { ...prev[criteriaId], [field]: value },
    }))
    if (saveStatus === 'saved') setSaveStatus('idle')
  }

  const totalScore = useMemo(() => {
    return criteria.reduce((sum, c) => {
      const raw = parseFloat(draftScores[c.id]?.raw_score ?? '')
      return isNaN(raw) ? sum : sum + raw * Number(c.weight)
    }, 0)
  }, [draftScores, criteria])

  const allScored = useMemo(() => {
    return criteria.length > 0 && criteria.every(c => {
      const v = draftScores[c.id]?.raw_score ?? ''
      if (v === '') return false
      const n = parseFloat(v)
      return !isNaN(n) && n >= 0 && n <= 10
    })
  }, [draftScores, criteria])

  const hasAnyScore = useMemo(() => {
    return criteria.some(c => {
      const v = draftScores[c.id]?.raw_score ?? ''
      return v !== '' && !isNaN(parseFloat(v))
    })
  }, [draftScores, criteria])

  function buildPayload() {
    return criteria.map(c => ({
      criteria_id: c.id,
      raw_score: draftScores[c.id]?.raw_score ? parseFloat(draftScores[c.id].raw_score) : null,
      note: draftScores[c.id]?.note || null,
      weight: Number(c.weight),
    }))
  }

  function save(submit: boolean) {
    if (!selectedTargetId || !selectedEvaluatorId) return
    setSaveStatus('saving')

    startTransition(async () => {
      try {
        const res = await fetch('/api/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            period_id: periodId,
            evaluator_id: selectedEvaluatorId,
            target_id: selectedTargetId,
            scores: buildPayload(),
            submit,
          }),
        })

        if (!res.ok) {
          setSaveStatus('error')
          return
        }

        const data = await res.json()
        const newEval = data.evaluation as EvaluationRow
        const payload = buildPayload()

        setEvaluations(prev => {
          const idx = prev.findIndex(e => e.evaluator_id === newEval.evaluator_id && e.target_id === newEval.target_id)
          if (idx >= 0) {
            const updated = [...prev]
            updated[idx] = newEval
            return updated
          }
          return [...prev, newEval]
        })

        setScoresMap(prev => ({
          ...prev,
          [newEval.id]: payload.map(s => ({
            evaluation_id: newEval.id,
            criteria_id: s.criteria_id,
            raw_score: s.raw_score,
            note: s.note,
          })),
        }))

        setSaveStatus('saved')
      } catch {
        setSaveStatus('error')
      }
    })
  }

  const selectedEval = selectedTargetId ? getEval(selectedEvaluatorId, selectedTargetId) : null
  const isSubmitted = selectedEval?.status === 'submitted'
  const canEdit = canManageAll || !isSubmitted

  // Empty states
  if (matrix.length === 0) {
    return (
      <div className="ev-empty">
        <Circle size={16} />
        <span>Chưa có cặp đánh giá nào trong kỳ này. Vui lòng cấu hình ma trận trước.</span>
      </div>
    )
  }
  if (criteria.length === 0) {
    return (
      <div className="ev-empty">
        <Circle size={16} />
        <span>Chưa có tiêu chí nào trong kỳ này. Vui lòng thêm tiêu chí trước.</span>
      </div>
    )
  }

  const submittedCount = assignments.filter(a => getEval(a.evaluator_id, a.target_id)?.status === 'submitted').length

  return (
    <div className="ev-root">

      {/* ── Left panel ── */}
      <div className="ev-left">
        <div className="ev-period">{periodLabel}</div>

        {canManageAll && evaluatorIds.length > 0 && (
          <div className="ev-field">
            <span className="ev-field-label">Phòng ban đánh giá</span>
            <select
              className="ev-select"
              value={selectedEvaluatorId}
              onChange={e => {
                setSelectedEvaluatorId(e.target.value)
                setSelectedTargetId(null)
                setDraftScores({})
                setSaveStatus('idle')
              }}
            >
              {evaluatorIds.map(id => (
                <option key={id} value={id}>{getDeptName(depts, id)}</option>
              ))}
            </select>
          </div>
        )}

        <div className="ev-divider" />

        <div className="ev-list">
          {assignments.length === 0 ? (
            <span className="ev-list-empty">Không có phòng ban nào cần đánh giá</span>
          ) : (
            assignments.map(a => {
              const ev = getEval(a.evaluator_id, a.target_id)
              const status = ev?.status ?? null
              const isActive = selectedTargetId === a.target_id

              return (
                <button
                  key={a.target_id}
                  className={`ev-item ${isActive ? 'ev-item--active' : ''}`}
                  onClick={() => selectAssignment(a.target_id)}
                >
                  <span className="ev-item-icon">
                    {status === 'submitted' ? (
                      <CheckCircle2 size={14} className="icon-submitted" />
                    ) : status === 'draft' ? (
                      <Clock size={14} className="icon-draft" />
                    ) : (
                      <Circle size={14} className="icon-none" />
                    )}
                  </span>
                  <span className="ev-item-name">{getDeptName(depts, a.target_id)}</span>
                  {ev?.total_score != null && status === 'submitted' && (
                    <span className="ev-item-score">{Number(ev.total_score).toFixed(1)}</span>
                  )}
                  <ChevronRight size={11} className="ev-item-arrow" />
                </button>
              )
            })
          )}
        </div>

        <div className="ev-left-footer">
          <span className="ev-stat-text">
            {submittedCount}/{assignments.length} đã nộp
          </span>
          <div className="ev-progress-bar">
            <div
              className="ev-progress-fill"
              style={{ width: assignments.length > 0 ? `${(submittedCount / assignments.length) * 100}%` : '0%' }}
            />
          </div>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="ev-right">
        {!selectedTargetId ? (
          <div className="ev-placeholder">
            <ChevronRight size={20} className="ev-ph-arrow" />
            <span>Chọn một phòng ban bên trái để bắt đầu đánh giá</span>
          </div>
        ) : (
          <div className="ev-form">

            {/* Form header */}
            <div className="ev-form-header">
              <div className="ev-form-route">
                <span className="ev-from">{getDeptLabel(depts, selectedEvaluatorId)}</span>
                <span className="ev-arrow">→</span>
                <span className="ev-to">{getDeptName(depts, selectedTargetId)}</span>
              </div>
              <div className="ev-badges">
                {isSubmitted && (
                  <span className="ev-badge ev-badge--submitted">
                    <CheckCircle2 size={11} /> Đã nộp
                  </span>
                )}
                {!isSubmitted && selectedEval?.status === 'draft' && (
                  <span className="ev-badge ev-badge--draft">
                    <Clock size={11} /> Nháp
                  </span>
                )}
              </div>
            </div>

            {/* Criteria table */}
            <div className="ev-table-wrap">
              <table className="ev-table">
                <thead>
                  <tr>
                    <th className="ev-th th-code">Mã</th>
                    <th className="ev-th th-name">Tiêu chí</th>
                    <th className="ev-th th-weight">Hệ số</th>
                    <th className="ev-th th-score">Điểm (0–10)</th>
                    <th className="ev-th th-weighted">Quy đổi</th>
                  </tr>
                </thead>
                <tbody>
                  {criteria.map(c => {
                    const draft = draftScores[c.id] ?? { raw_score: '', note: '' }
                    const rawVal = parseFloat(draft.raw_score)
                    const weighted = !isNaN(rawVal) ? rawVal * Number(c.weight) : null
                    const isInvalid = draft.raw_score !== '' && (isNaN(rawVal) || rawVal < 0 || rawVal > 10)

                    return (
                      <tr key={c.id} className="ev-tr">
                        <td className="ev-td td-code">{c.code ?? '—'}</td>
                        <td className="ev-td td-name">{c.name}</td>
                        <td className="ev-td td-weight">×{Number(c.weight)}</td>
                        <td className="ev-td td-score">
                          <input
                            type="number"
                            min="0"
                            max="10"
                            step="0.5"
                            value={draft.raw_score}
                            onChange={e => handleScoreChange(c.id, 'raw_score', e.target.value)}
                            disabled={!canEdit || isPending}
                            className={`ev-score-input ${isInvalid ? 'ev-score-input--invalid' : ''}`}
                            placeholder="—"
                          />
                        </td>
                        <td className="ev-td td-weighted">
                          {weighted != null
                            ? <span className="ev-weighted-val">{weighted.toFixed(2)}</span>
                            : <span className="ev-weighted-empty">—</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="ev-tfoot">
                    <td colSpan={4} className="ev-tfoot-label">Tổng điểm quy đổi</td>
                    <td className="ev-tfoot-val">
                      <span className={`ev-total ${hasAnyScore ? 'ev-total--active' : ''}`}>
                        {hasAnyScore ? totalScore.toFixed(2) : '—'}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Actions */}
            {canEdit ? (
              <div className="ev-actions">
                <span className={`ev-save-msg ${saveStatus === 'saved' ? 'ev-save-msg--ok' : ''} ${saveStatus === 'error' ? 'ev-save-msg--err' : ''}`}>
                  {saveStatus === 'saving' && 'Đang lưu…'}
                  {saveStatus === 'saved' && 'Đã lưu'}
                  {saveStatus === 'error' && 'Lỗi — thử lại'}
                </span>
                <button
                  className="ev-btn ev-btn--ghost"
                  onClick={() => save(false)}
                  disabled={isPending}
                >
                  <Save size={13} /> Lưu nháp
                </button>
                <button
                  className="ev-btn ev-btn--primary"
                  onClick={() => save(true)}
                  disabled={isPending || !allScored}
                  title={!allScored ? 'Nhập đầy đủ điểm (0–10) trước khi nộp' : undefined}
                >
                  <Send size={13} /> Nộp đánh giá
                </button>
              </div>
            ) : (
              <div className="ev-read-only-msg">
                Đánh giá đã được nộp. Liên hệ quản trị viên nếu cần chỉnh sửa.
              </div>
            )}

          </div>
        )}
      </div>

      <style>{`
        .ev-root {
          display: flex;
          height: 100%;
          gap: 0;
          font-family: var(--font-sans), sans-serif;
          animation: evFadeIn 0.3s ease both;
        }
        @keyframes evFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

        .ev-empty {
          display: flex; align-items: center; gap: 10px;
          color: rgba(255,255,255,0.25); font-size: 13px; font-style: italic; padding: 48px 0;
        }

        /* ── Left panel ── */
        .ev-left {
          width: 256px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          background: rgba(255,255,255,0.015);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 14px;
          overflow: hidden;
        }

        .ev-period {
          padding: 14px 16px 10px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.3);
        }

        .ev-field {
          padding: 0 12px 10px;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .ev-field-label {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.3);
        }
        .ev-select {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          padding: 7px 10px;
          font-size: 12px;
          color: rgba(255,255,255,0.8);
          font-family: var(--font-sans), sans-serif;
          outline: none;
          cursor: pointer;
          transition: border-color 0.15s;
        }
        .ev-select:focus { border-color: rgba(179,0,0,0.5); }
        .ev-select option { background: #1a1a1a; color: #fff; }

        .ev-divider { height: 1px; background: rgba(255,255,255,0.05); margin: 0 12px; flex-shrink: 0; }

        .ev-list {
          flex: 1;
          overflow-y: auto;
          padding: 6px 0;
          scrollbar-width: thin;
          scrollbar-color: rgba(179,0,0,0.15) transparent;
        }
        .ev-list::-webkit-scrollbar { width: 3px; }
        .ev-list::-webkit-scrollbar-thumb { background: rgba(179,0,0,0.15); border-radius: 3px; }

        .ev-list-empty {
          display: block;
          padding: 16px;
          font-size: 12px;
          color: rgba(255,255,255,0.2);
          font-style: italic;
          text-align: center;
        }

        .ev-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 9px 12px;
          background: none;
          border: none;
          cursor: pointer;
          text-align: left;
          color: rgba(255,255,255,0.5);
          font-size: 12.5px;
          font-family: var(--font-sans), sans-serif;
          transition: background 0.12s, color 0.12s;
        }
        .ev-item:hover { background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.8); }
        .ev-item--active { background: rgba(179,0,0,0.1); color: #fff; }
        .ev-item--active:hover { background: rgba(179,0,0,0.14); }

        .ev-item-icon { flex-shrink: 0; display: flex; align-items: center; }
        .icon-submitted { color: #4ade80; }
        .icon-draft { color: #fbbf24; }
        .icon-none { color: rgba(255,255,255,0.2); }

        .ev-item-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ev-item-score {
          font-size: 11px; font-weight: 700; color: rgba(179,0,0,0.9);
          background: rgba(179,0,0,0.1); border-radius: 4px; padding: 1px 5px; flex-shrink: 0;
        }
        .ev-item-arrow { color: rgba(255,255,255,0.2); flex-shrink: 0; }
        .ev-item--active .ev-item-arrow { color: rgba(179,0,0,0.5); }

        .ev-left-footer {
          padding: 10px 12px 12px;
          border-top: 1px solid rgba(255,255,255,0.05);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .ev-stat-text { font-size: 11px; color: rgba(255,255,255,0.3); letter-spacing: 0.04em; }
        .ev-progress-bar { height: 3px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; }
        .ev-progress-fill { height: 100%; background: #B30000; border-radius: 2px; transition: width 0.4s ease; box-shadow: 0 0 6px rgba(179,0,0,0.4); }

        /* ── Right panel ── */
        .ev-right {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
          margin-left: 16px;
        }

        .ev-placeholder {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          color: rgba(255,255,255,0.2);
          font-size: 13px;
          font-style: italic;
        }
        .ev-ph-arrow { color: rgba(179,0,0,0.3); }

        .ev-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
          height: 100%;
        }

        /* Form header */
        .ev-form-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-shrink: 0;
        }
        .ev-form-route {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .ev-from {
          font-size: 12px;
          font-weight: 700;
          color: rgba(255,255,255,0.35);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .ev-arrow { color: rgba(255,255,255,0.2); font-size: 14px; }
        .ev-to {
          font-size: 16px;
          font-weight: 400;
          color: #fff;
          letter-spacing: -0.01em;
        }
        .ev-badges { display: flex; gap: 6px; }
        .ev-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 10px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 500;
        }
        .ev-badge--submitted {
          background: rgba(74,222,128,0.1);
          color: #4ade80;
          border: 1px solid rgba(74,222,128,0.2);
        }
        .ev-badge--draft {
          background: rgba(251,191,36,0.08);
          color: #fbbf24;
          border: 1px solid rgba(251,191,36,0.18);
        }

        /* Table */
        .ev-table-wrap {
          flex: 1;
          overflow: auto;
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 12px;
          background: rgba(255,255,255,0.015);
          scrollbar-width: thin;
          scrollbar-color: rgba(179,0,0,0.15) transparent;
        }
        .ev-table-wrap::-webkit-scrollbar { width: 4px; height: 4px; }
        .ev-table-wrap::-webkit-scrollbar-thumb { background: rgba(179,0,0,0.15); border-radius: 4px; }

        .ev-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: auto;
        }

        .ev-th {
          padding: 10px 14px;
          text-align: left;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.3);
          border-bottom: 1px solid rgba(255,255,255,0.06);
          white-space: nowrap;
          position: sticky;
          top: 0;
          background: #0e0e0e;
          z-index: 1;
        }
        .th-code { width: 64px; }
        .th-weight { width: 72px; text-align: center; }
        .th-score { width: 120px; text-align: center; }
        .th-weighted { width: 100px; text-align: right; }

        .ev-tr {
          border-bottom: 1px solid rgba(255,255,255,0.04);
          transition: background 0.1s;
        }
        .ev-tr:hover { background: rgba(255,255,255,0.02); }
        .ev-tr:last-child { border-bottom: none; }

        .ev-td {
          padding: 10px 14px;
          font-size: 13px;
          color: rgba(255,255,255,0.7);
          vertical-align: middle;
        }
        .td-code { color: rgba(179,0,0,0.7); font-size: 11px; font-weight: 600; font-family: monospace; }
        .td-name { font-size: 13px; }
        .td-weight { text-align: center; color: rgba(255,255,255,0.4); font-size: 12px; }
        .td-score { text-align: center; }
        .td-weighted { text-align: right; }

        .ev-score-input {
          width: 80px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          padding: 6px 10px;
          font-size: 13px;
          color: #fff;
          text-align: center;
          outline: none;
          font-family: var(--font-sans), sans-serif;
          transition: border-color 0.15s, background 0.15s;
        }
        .ev-score-input:focus {
          border-color: rgba(179,0,0,0.5);
          background: rgba(179,0,0,0.05);
        }
        .ev-score-input:disabled { opacity: 0.4; cursor: not-allowed; }
        .ev-score-input--invalid { border-color: rgba(255,80,80,0.5); background: rgba(255,50,50,0.05); }
        .ev-score-input::-webkit-inner-spin-button { opacity: 0.5; }

        .ev-weighted-val { color: rgba(179,0,0,0.9); font-weight: 600; font-size: 13px; }
        .ev-weighted-empty { color: rgba(255,255,255,0.2); }

        .ev-tfoot { border-top: 1px solid rgba(255,255,255,0.08); }
        .ev-tfoot-label {
          padding: 12px 14px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.3);
          text-align: right;
        }
        .ev-tfoot-val { padding: 12px 14px; text-align: right; }
        .ev-total {
          font-size: 18px;
          font-weight: 300;
          color: rgba(255,255,255,0.2);
          letter-spacing: -0.02em;
          transition: color 0.2s;
        }
        .ev-total--active { color: #B30000; text-shadow: 0 0 20px rgba(179,0,0,0.4); }

        /* Actions */
        .ev-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .ev-save-msg {
          flex: 1;
          font-size: 12px;
          color: rgba(255,255,255,0.25);
          font-style: italic;
          transition: color 0.2s;
        }
        .ev-save-msg--ok { color: #4ade80; }
        .ev-save-msg--err { color: #f87171; }

        .ev-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border-radius: 9px;
          border: none;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          font-family: var(--font-sans), sans-serif;
          transition: background 0.15s, transform 0.12s, box-shadow 0.15s;
          letter-spacing: 0.01em;
        }
        .ev-btn:hover:not(:disabled) { transform: translateY(-1px); }
        .ev-btn:active:not(:disabled) { transform: translateY(0); }
        .ev-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .ev-btn--ghost {
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.55);
          border: 1px solid rgba(255,255,255,0.1);
        }
        .ev-btn--ghost:hover:not(:disabled) { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.8); }

        .ev-btn--primary {
          background: #B30000;
          color: #fff;
          box-shadow: 0 4px 20px rgba(179,0,0,0.3);
        }
        .ev-btn--primary:hover:not(:disabled) {
          background: #cc0000;
          box-shadow: 0 6px 28px rgba(179,0,0,0.45);
        }

        .ev-read-only-msg {
          padding: 12px 16px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 10px;
          font-size: 12px;
          color: rgba(255,255,255,0.3);
          font-style: italic;
          flex-shrink: 0;
        }

        /* ── Light mode ───────────────────────────────── */
        [data-theme="light"] .ev-empty { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .ev-left { background: #fff; border-color: rgba(0,0,0,0.08); }
        [data-theme="light"] .ev-period { color: rgba(0,0,0,0.35); }
        [data-theme="light"] .ev-field-label { color: rgba(0,0,0,0.35); }
        [data-theme="light"] .ev-select { background: rgba(0,0,0,0.04); border-color: rgba(0,0,0,0.1); color: rgba(0,0,0,0.8); }
        [data-theme="light"] .ev-select option { background: #fff; color: #1a1a1a; }
        [data-theme="light"] .ev-divider { background: rgba(0,0,0,0.07); }
        [data-theme="light"] .ev-list-empty { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .ev-item { color: rgba(0,0,0,0.5); }
        [data-theme="light"] .ev-item:hover { background: rgba(0,0,0,0.04); color: rgba(0,0,0,0.8); }
        [data-theme="light"] .ev-item--active { background: rgba(179,0,0,0.09); color: #1a1a1a; }
        [data-theme="light"] .ev-item--active:hover { background: rgba(179,0,0,0.13); }
        [data-theme="light"] .icon-none { color: rgba(0,0,0,0.2); }
        [data-theme="light"] .ev-item-arrow { color: rgba(0,0,0,0.2); }
        [data-theme="light"] .ev-left-footer { border-top-color: rgba(0,0,0,0.07); }
        [data-theme="light"] .ev-stat-text { color: rgba(0,0,0,0.35); }
        [data-theme="light"] .ev-progress-bar { background: rgba(0,0,0,0.08); }
        [data-theme="light"] .ev-placeholder { color: rgba(0,0,0,0.25); }
        [data-theme="light"] .ev-from { color: rgba(0,0,0,0.35); }
        [data-theme="light"] .ev-arrow { color: rgba(0,0,0,0.2); }
        [data-theme="light"] .ev-to { color: #1a1a1a; }
        [data-theme="light"] .ev-table-wrap { border-color: rgba(0,0,0,0.08); }
        [data-theme="light"] .ev-table { border-bottom-color: rgba(0,0,0,0.07); }
        [data-theme="light"] .ev-th { background: rgba(0,0,0,0.03); color: rgba(0,0,0,0.4); border-bottom-color: rgba(0,0,0,0.07); }
        [data-theme="light"] .ev-tr { border-bottom-color: rgba(0,0,0,0.05); }
        [data-theme="light"] .ev-td { color: rgba(0,0,0,0.7); }
        [data-theme="light"] .td-weight { color: rgba(0,0,0,0.4); }
        [data-theme="light"] .ev-score-input { background: rgba(0,0,0,0.04); border-color: rgba(0,0,0,0.1); color: #1a1a1a; }
        [data-theme="light"] .ev-weighted-empty { color: rgba(0,0,0,0.2); }
        [data-theme="light"] .ev-tfoot { border-top-color: rgba(0,0,0,0.1); }
        [data-theme="light"] .ev-tfoot-label { background: rgba(0,0,0,0.02); color: rgba(0,0,0,0.5); }
        [data-theme="light"] .ev-total { color: rgba(0,0,0,0.35); }
        [data-theme="light"] .ev-actions { border-top-color: rgba(0,0,0,0.07); background: rgba(0,0,0,0.015); }
        [data-theme="light"] .ev-save-msg { color: rgba(0,0,0,0.4); }
        [data-theme="light"] .ev-btn--ghost { background: rgba(0,0,0,0.05); border-color: rgba(0,0,0,0.1); color: rgba(0,0,0,0.6); }
        [data-theme="light"] .ev-read-only-msg { background: rgba(0,0,0,0.02); border-color: rgba(0,0,0,0.08); color: rgba(0,0,0,0.4); }
      `}</style>
    </div>
  )
}
