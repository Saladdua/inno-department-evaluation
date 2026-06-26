'use client'

import { useState, useTransition, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Clock, Circle, ChevronRight, ChevronLeft, Send, Pencil, Menu, Save, X as XIcon, AlertTriangle } from 'lucide-react'

export interface Criterion {
  id: string
  code: string | null
  name: string
  weight: number
  input_type: 'manual' | 'auto'
  auto_source: string | null
  display_order: number
  region?: string | null
}

export interface AutoScoreRow {
  dept_id: string
  criteria_id: string
  raw_score: number | null
}

export interface Department {
  id: string
  name: string
  code: string | null
  region?: string | null
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
  periodStatus: 'draft' | 'open' | 'closed'
  criteria: Criterion[]
  depts: Department[]
  matrix: MatrixEntry[]
  initialEvaluations: EvaluationRow[]
  initialScores: ScoreRow[]
  role: Role
  myDeptId: string | null
  isLeader?: boolean
  myRegion?: string | null
  autoScores?: AutoScoreRow[]
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
  periodStatus,
  criteria,
  depts,
  matrix,
  initialEvaluations,
  initialScores,
  role,
  myDeptId,
  isLeader = false,
  autoScores = [],
}: Props) {
  const router = useRouter()
  const canManageAll = role === 'super_admin' || role === 'leadership'

  const [regionFilter, setRegionFilter] = useState<'Miền Bắc' | 'Miền Nam'>('Miền Bắc')

  const filteredCriteria = useMemo(() => {
    if (role !== 'super_admin') return criteria
    return criteria.filter(c => (c.region ?? 'Miền Bắc') === regionFilter)
  }, [criteria, regionFilter, role])

  const displayCriteria = filteredCriteria
  const scoreableCriteria = role === 'super_admin'
    ? filteredCriteria
    : filteredCriteria.filter(c => c.input_type !== 'auto' && (isLeader || c.auto_source !== 'leader'))

  function canScoreCriterion(c: Criterion): boolean {
    return scoreableCriteria.some(s => s.id === c.id)
  }

  const evaluatorIds = useMemo(() => {
    return [...new Set(matrix.map(e => e.evaluator_id))]
  }, [matrix])

  const filteredEvaluatorIds = useMemo(() => {
    if (role !== 'super_admin') return evaluatorIds
    return evaluatorIds.filter(id => {
      const dept = depts.find(d => d.id === id)
      return (dept?.region ?? 'Miền Bắc') === regionFilter
    })
  }, [evaluatorIds, regionFilter, role, depts])

  const autoScoreMap = useMemo(() => {
    const map: Record<string, number> = {}
    autoScores.forEach(s => {
      if (s.raw_score != null) map[`${s.dept_id}:${s.criteria_id}`] = s.raw_score
    })
    return map
  }, [autoScores])

  const [mobileShowList, setMobileShowList] = useState(true)

  const [selectedEvaluatorId, setSelectedEvaluatorId] = useState<string>(() => {
    if (canManageAll && role === 'super_admin') {
      const northFirst = evaluatorIds.find(id => {
        const d = depts.find(dd => dd.id === id)
        return (d?.region ?? 'Miền Bắc') === 'Miền Bắc'
      })
      return northFirst ?? evaluatorIds[0] ?? ''
    }
    return canManageAll ? (evaluatorIds[0] ?? '') : (myDeptId ?? '')
  })
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
  const [overMaxId, setOverMaxId] = useState<string | null>(null)
  const [isEditingMode, setIsEditingMode] = useState(true)
  const [pendingSubmitCheck, setPendingSubmitCheck] = useState<string[] | null>(null)
  const [hasPendingChanges, setHasPendingChanges] = useState(false)
  const [showNavWarning, setShowNavWarning] = useState(false)
  const [pendingNavHref, setPendingNavHref] = useState<string | null>(null)
  const pendingNavAfterSaveRef = useRef<string | null>(null)

  // Warn on browser close/refresh when there are unsaved score changes
  useEffect(() => {
    if (!hasPendingChanges) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasPendingChanges])

  // Intercept in-app navigation links when there are unsaved changes
  useEffect(() => {
    if (!hasPendingChanges) return
    function handleLinkClick(e: MouseEvent) {
      const link = (e.target as Element).closest('a[href]')
      if (!link) return
      const href = (link as HTMLAnchorElement).getAttribute('href')
      if (!href || href.startsWith('#')) return
      try {
        const url = new URL(href, window.location.href)
        if (url.pathname === window.location.pathname) return
      } catch { return }
      e.preventDefault()
      e.stopPropagation()
      setPendingNavHref(href)
      setShowNavWarning(true)
    }
    document.addEventListener('click', handleLinkClick, true)
    return () => document.removeEventListener('click', handleLinkClick, true)
  }, [hasPendingChanges])

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

  function handleRegionChange(r: 'Miền Bắc' | 'Miền Nam') {
    const newFirst = evaluatorIds.find(id => {
      const dept = depts.find(d => d.id === id)
      return (dept?.region ?? 'Miền Bắc') === r
    }) ?? ''
    setRegionFilter(r)
    setSelectedEvaluatorId(newFirst)
    setSelectedTargetId(null)
    setDraftScores({})
    setSaveStatus('idle')
  }

  function buildDraftFromEval(evaluatorId: string, targetId: string): Record<string, DraftScore> {
    const draft: Record<string, DraftScore> = {}
    displayCriteria.forEach(c => { draft[c.id] = { raw_score: '', note: '' } })
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
    // Auto criteria always show the pre-calculated value from auto_scores
    displayCriteria.forEach(c => {
      if (c.input_type === 'auto') {
        const autoScore = autoScoreMap[`${targetId}:${c.id}`]
        if (autoScore != null) {
          draft[c.id] = { raw_score: String(autoScore), note: draft[c.id]?.note ?? '' }
        }
      }
    })
    return draft
  }

  function selectAssignment(targetId: string) {
    setSelectedTargetId(targetId)
    setDraftScores(buildDraftFromEval(selectedEvaluatorId, targetId))
    setSaveStatus('idle')
    setHasPendingChanges(false)
    const ev = getEval(selectedEvaluatorId, targetId)
    setIsEditingMode(ev?.status !== 'submitted')
    setMobileShowList(false)
  }

  function handleScoreChange(criteriaId: string, field: 'raw_score' | 'note', value: string) {
    let v = value
    if (field === 'raw_score' && value !== '') {
      const num = Number(value)
      if (!isNaN(num) && num > 100) {
        setOverMaxId(criteriaId)
        v = ''
      } else {
        if (overMaxId === criteriaId) setOverMaxId(null)
      }
    }
    setDraftScores(prev => ({
      ...prev,
      [criteriaId]: { ...prev[criteriaId], [field]: v },
    }))
    if (saveStatus === 'saved') setSaveStatus('idle')
    setHasPendingChanges(true)
  }

  function handleScoreBlur(criteriaId: string, value: string) {
    if (value === '') return
    const num = Number(value)
    if (!isNaN(num) && num < 1) {
      setDraftScores(prev => ({
        ...prev,
        [criteriaId]: { ...prev[criteriaId], raw_score: '1' },
      }))
    }
  }

  const totalScore = useMemo(() => {
    const totalWeight = scoreableCriteria.reduce((sum, c) => sum + Number(c.weight), 0)
    const weightedSum = scoreableCriteria.reduce((sum, c) => {
      const raw = parseFloat(draftScores[c.id]?.raw_score ?? '')
      return isNaN(raw) ? sum : sum + raw * Number(c.weight)
    }, 0)
    return totalWeight > 0 ? weightedSum / totalWeight : 0
  }, [draftScores, scoreableCriteria])

  const allScored = useMemo(() => {
    return scoreableCriteria.length > 0 && scoreableCriteria.every(c => {
      const v = draftScores[c.id]?.raw_score ?? ''
      if (v === '') return false
      const n = parseFloat(v)
      return !isNaN(n) && n >= 1 && n <= 100
    })
  }, [draftScores, scoreableCriteria])

  const hasAnyScore = useMemo(() => {
    return scoreableCriteria.some(c => {
      const v = draftScores[c.id]?.raw_score ?? ''
      return v !== '' && !isNaN(parseFloat(v))
    })
  }, [draftScores, scoreableCriteria])

  // Assignments (excluding current) that have never been drafted — block submit-all until these are done
  const notReadyAssignments = useMemo(() => {
    if (!selectedTargetId) return []
    return assignments
      .filter(a => a.target_id !== selectedTargetId)
      .filter(a => !getEval(a.evaluator_id, a.target_id))
      .map(a => getDeptName(depts, a.target_id))
  }, [assignments, selectedTargetId, evalByPair, depts]) // eslint-disable-line react-hooks/exhaustive-deps

  function buildPayload() {
    return scoreableCriteria.map(c => ({
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
        setHasPendingChanges(false)
        if (submit) setIsEditingMode(false)
        if (pendingNavAfterSaveRef.current) {
          const href = pendingNavAfterSaveRef.current
          pendingNavAfterSaveRef.current = null
          router.push(href)
        }
      } catch {
        setSaveStatus('error')
        pendingNavAfterSaveRef.current = null
      }
    })
  }

  function submitAll() {
    if (!selectedTargetId || !selectedEvaluatorId) return
    setSaveStatus('saving')

    startTransition(async () => {
      try {
        // Submit current form first
        const currentPayload = buildPayload()
        const res = await fetch('/api/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            period_id: periodId,
            evaluator_id: selectedEvaluatorId,
            target_id: selectedTargetId,
            scores: currentPayload,
            submit: true,
          }),
        })
        if (!res.ok) { setSaveStatus('error'); return }
        const { evaluation: currentEval } = await res.json() as { evaluation: EvaluationRow }
        setEvaluations(prev => {
          const idx = prev.findIndex(e => e.evaluator_id === currentEval.evaluator_id && e.target_id === currentEval.target_id)
          const next = [...prev]
          if (idx >= 0) next[idx] = currentEval; else next.push(currentEval)
          return next
        })
        setScoresMap(prev => ({
          ...prev,
          [currentEval.id]: currentPayload.map(s => ({ evaluation_id: currentEval.id, criteria_id: s.criteria_id, raw_score: s.raw_score, note: s.note })),
        }))

        // Submit all other drafted evaluations
        const otherDrafts = assignments
          .filter(a => a.target_id !== selectedTargetId)
          .filter(a => getEval(a.evaluator_id, a.target_id)?.status === 'draft')

        for (const a of otherDrafts) {
          const ev = getEval(a.evaluator_id, a.target_id)!
          const existingScores = scoresMap[ev.id] ?? []
          const payload = scoreableCriteria.map(c => {
            const s = existingScores.find(es => es.criteria_id === c.id)
            return { criteria_id: c.id, raw_score: s?.raw_score ?? null, note: s?.note ?? null, weight: Number(c.weight) }
          })
          const r = await fetch('/api/evaluate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ period_id: periodId, evaluator_id: a.evaluator_id, target_id: a.target_id, scores: payload, submit: true }),
          })
          if (!r.ok) { setSaveStatus('error'); return }
          const { evaluation: ne } = await r.json() as { evaluation: EvaluationRow }
          setEvaluations(prev => {
            const idx = prev.findIndex(e => e.evaluator_id === ne.evaluator_id && e.target_id === ne.target_id)
            const next = [...prev]
            if (idx >= 0) next[idx] = ne; else next.push(ne)
            return next
          })
        }

        setSaveStatus('saved')
        setHasPendingChanges(false)
        setIsEditingMode(false)
      } catch {
        setSaveStatus('error')
      }
    })
  }

  const selectedEval = selectedTargetId ? getEval(selectedEvaluatorId, selectedTargetId) : null
  const isSubmitted = selectedEval?.status === 'submitted'
  const canEdit = role === 'super_admin' || periodStatus !== 'closed'

  // Empty states
  if (matrix.length === 0) {
    return (
      <div className="ev-empty">
        <Circle size={16} />
        <span>Chưa có cặp đánh giá nào trong kỳ này. Vui lòng cấu hình ma trận trước.</span>
      </div>
    )
  }
  if (scoreableCriteria.length === 0 && criteria.length === 0) {
    return (
      <div className="ev-empty">
        <Circle size={16} />
        <span>Chưa có tiêu chí nào trong kỳ này.</span>
      </div>
    )
  }

  const submittedCount = assignments.filter(a => getEval(a.evaluator_id, a.target_id)?.status === 'submitted').length

  return (
    <div className={`ev-root${mobileShowList ? ' ev-root--list' : ' ev-root--form'}`}>

      {/* ── Left panel ── */}
      <div className="ev-left">
        <div className="ev-period">{periodLabel}</div>

        {role === 'super_admin' && (
          <div className="ev-region-tabs">
            {(['Miền Bắc', 'Miền Nam'] as const).map(r => (
              <button
                key={r}
                className={`ev-region-tab ${regionFilter === r ? 'ev-region-tab--active' : ''}`}
                onClick={() => handleRegionChange(r)}
              >
                {r}
              </button>
            ))}
          </div>
        )}

        {isLeader && (
          <div className="ev-field">
            <span className="ev-field-label">Đánh giá với tư cách</span>
            <span className="ev-leader-badge">Ban lãnh đạo</span>
          </div>
        )}

        {canManageAll && !isLeader && filteredEvaluatorIds.length > 0 && (
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
              {filteredEvaluatorIds.map(id => (
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
            {submittedCount}/{assignments.length} đã đánh giá
          </span>
          <div className="ev-progress-bar">
            <div
              className="ev-progress-fill"
              style={{ width: assignments.length > 0 ? `${(submittedCount / assignments.length) * 100}%` : '0%' }}
            />
          </div>
          {selectedTargetId && (
            <button
              className="ev-mobile-close-list"
              onClick={() => setMobileShowList(false)}
            >
              Xem phiếu đang chọn <ChevronRight size={13} />
            </button>
          )}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="ev-right">
        {!selectedTargetId ? (
          <div className="ev-placeholder">
            <ChevronRight size={20} className="ev-ph-arrow" />
            <span>Chọn một phòng ban bên trái để bắt đầu đánh giá</span>
            <button className="ev-mobile-open-list" onClick={() => setMobileShowList(true)}>
              <Menu size={14} /> Chọn phòng ban
            </button>
          </div>
        ) : (
          <div className="ev-form">

            {/* Form header */}
            <div className="ev-form-header">
              <button
                className="ev-back-btn"
                onClick={() => setMobileShowList(true)}
                aria-label="Quay lại danh sách"
              >
                <ChevronLeft size={15} /> Danh sách
              </button>
              <div className="ev-form-route">
                <span className="ev-from">
                  {isLeader ? 'BLĐ' : getDeptLabel(depts, selectedEvaluatorId)}
                </span>
                <span className="ev-arrow">→</span>
                <span className="ev-to">{getDeptName(depts, selectedTargetId)}</span>
              </div>
              <div className="ev-badges">
                {isSubmitted && (
                  <span className="ev-badge ev-badge--submitted">
                    <CheckCircle2 size={11} /> Đã đánh giá
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
                    <th className="ev-th th-score">Điểm (0–100)</th>
                  </tr>
                </thead>
                <tbody>
                  {displayCriteria.map(c => {
                    const isAuto = c.input_type === 'auto'
                    const scoreable = canScoreCriterion(c)
                    const draft = draftScores[c.id] ?? { raw_score: '', note: '' }
                    const rawVal = parseFloat(draft.raw_score)
                    const weighted = !isNaN(rawVal) ? rawVal * Number(c.weight) : null
                    const isInvalid = scoreable && !isAuto && draft.raw_score !== '' && (isNaN(rawVal) || rawVal < 1 || rawVal > 100)

                    return (
                      <tr key={c.id} className={`ev-tr ${isAuto ? 'ev-tr--auto' : ''} ${!scoreable && !isAuto ? 'ev-tr--readonly' : ''}`}>
                        <td className="ev-td td-code">{c.code ?? '—'}</td>
                        <td className="ev-td td-name">
                          {c.name}
                          {isAuto && <span className="ev-auto-badge">Tự động</span>}
                          {!scoreable && !isAuto && <span className="ev-na-badge">Ban lãnh đạo đánh giá</span>}
                        </td>
                        <td className="ev-td td-score" style={{ position: 'relative' }}>
                          {scoreable ? (
                            <>
                              <input
                                type="number"
                                min="1"
                                max="100"
                                step="1"
                                value={draft.raw_score}
                                onChange={e => handleScoreChange(c.id, 'raw_score', e.target.value)}
                                onBlur={e => handleScoreBlur(c.id, e.target.value)}
                                disabled={isAuto || !canEdit || isPending || !isEditingMode}
                                className={`ev-score-input ${isInvalid ? 'ev-score-input--invalid' : ''} ${isAuto ? 'ev-score-input--auto' : ''} ${overMaxId === c.id ? 'ev-score-input--over-max' : ''}`}
                                placeholder="—"
                              />
                              {overMaxId === c.id && (
                                <span className="ev-over-max-tip">Điểm phải từ 1–100</span>
                              )}
                            </>
                          ) : (
                            <span className="ev-weighted-empty">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="ev-tfoot">
                    <td colSpan={2} className="ev-tfoot-label">Tổng điểm</td>
                    <td className="ev-tfoot-val">
                      <span className={`ev-total ${hasAnyScore ? 'ev-total--active' : ''}`}>
                        {hasAnyScore ? Math.round(totalScore) : '—'}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Actions */}
            {canEdit ? (
              <div className="ev-actions">
                <span className={`ev-save-msg ${hasPendingChanges && saveStatus !== 'saving' ? 'ev-save-msg--pending' : saveStatus === 'saved' ? 'ev-save-msg--ok' : saveStatus === 'error' ? 'ev-save-msg--err' : ''}`}>
                  {saveStatus === 'saving' && 'Đang lưu…'}
                  {saveStatus === 'saved' && !hasPendingChanges && 'Đã lưu'}
                  {saveStatus === 'error' && 'Lỗi — thử lại'}
                  {hasPendingChanges && saveStatus !== 'saving' && saveStatus !== 'error' && 'Chưa lưu'}
                </span>
                <button
                  className="ev-btn ev-btn--ghost"
                  onClick={() => setIsEditingMode(true)}
                  disabled={isEditingMode || isPending}
                >
                  <Pencil size={13} /> Chỉnh sửa
                </button>
                <button
                  className="ev-btn ev-btn--draft"
                  onClick={() => save(false)}
                  disabled={isPending || !isEditingMode}
                  title="Lưu bản nháp, chưa nộp chính thức"
                >
                  <Save size={13} /> Lưu
                </button>
                <button
                  className={`ev-btn ev-btn--primary${!isPending && allScored && isEditingMode && notReadyAssignments.length > 0 ? ' ev-btn--submit-blocked' : ''}`}
                  onClick={() => {
                    if (notReadyAssignments.length > 0) {
                      setPendingSubmitCheck(notReadyAssignments)
                    } else {
                      submitAll()
                    }
                  }}
                  disabled={isPending || !allScored || !isEditingMode}
                  title={
                    !isEditingMode ? 'Nhấn Chỉnh sửa để chỉnh lại'
                    : !allScored ? 'Nhập đầy đủ điểm (1–100) trước khi nộp'
                    : notReadyAssignments.length > 0 ? `Còn ${notReadyAssignments.length} phòng ban chưa được lưu`
                    : undefined
                  }
                >
                  <Send size={13} /> Nộp đánh giá
                </button>
              </div>
            ) : (
              <div className="ev-read-only-msg">
                Kỳ đánh giá đã kết thúc — không thể chỉnh sửa.
              </div>
            )}

          </div>
        )}
      </div>

      {/* ── Unsaved changes nav warning ── */}
      {showNavWarning && (
        <div className="ev-check-overlay" onClick={() => setShowNavWarning(false)}>
          <div className="ev-check-modal" onClick={e => e.stopPropagation()}>
            <div className="ev-check-header">
              <AlertTriangle size={16} className="ev-check-icon" />
              <span className="ev-check-title">Bạn có thay đổi chưa lưu</span>
            </div>
            <p className="ev-check-desc">
              Điểm bạn vừa nhập chưa được lưu. Nhấn <strong>Lưu rồi rời</strong> để lưu trước khi chuyển trang.
            </p>
            <div className="ev-check-actions">
              <button
                className="ev-btn ev-btn--draft"
                disabled={isPending}
                onClick={() => {
                  if (pendingNavHref) pendingNavAfterSaveRef.current = pendingNavHref
                  setShowNavWarning(false)
                  save(false)
                }}
              >
                <Save size={13} /> Lưu rồi rời
              </button>
              <button className="ev-btn ev-btn--ghost" onClick={() => setShowNavWarning(false)}>
                <XIcon size={13} /> Ở lại
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Incomplete assignments popup ── */}
      {pendingSubmitCheck && (
        <div className="ev-check-overlay" onClick={() => setPendingSubmitCheck(null)}>
          <div className="ev-check-modal" onClick={e => e.stopPropagation()}>
            <div className="ev-check-header">
              <AlertTriangle size={16} className="ev-check-icon" />
              <span className="ev-check-title">Chưa thể nộp đánh giá</span>
            </div>
            <p className="ev-check-desc">
              Vui lòng lưu nháp tất cả các phòng ban trước khi nộp. Còn {pendingSubmitCheck.length} phòng ban chưa được lưu:
            </p>
            <ul className="ev-check-list">
              {pendingSubmitCheck.map((name, i) => <li key={i}>{name}</li>)}
            </ul>
            <div className="ev-check-actions">
              <button className="ev-btn ev-btn--ghost" onClick={() => setPendingSubmitCheck(null)}>
                <XIcon size={13} /> Đóng
              </button>
            </div>
          </div>
        </div>
      )}

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

        /* ── Region tabs (admin) ── */
        .ev-region-tabs { display: flex; gap: 3px; padding: 10px 12px 4px; }
        .ev-region-tab {
          flex: 1; padding: 5px 0; border-radius: 7px;
          border: 1px solid rgba(255,255,255,0.1); background: transparent;
          color: rgba(255,255,255,0.35); font-size: 11px; font-weight: 600;
          letter-spacing: 0.04em; font-family: var(--font-sans), sans-serif;
          cursor: pointer; transition: background 0.12s, color 0.12s, border-color 0.12s;
        }
        .ev-region-tab:hover { color: rgba(255,255,255,0.6); background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.15); }
        .ev-region-tab--active { background: rgba(179,0,0,0.15); color: rgba(255,180,180,0.95); border-color: rgba(179,0,0,0.3); }
        [data-theme="light"] .ev-region-tab { color: rgba(0,0,0,0.4); border-color: rgba(0,0,0,0.1); background: transparent; }
        [data-theme="light"] .ev-region-tab:hover { color: rgba(0,0,0,0.65); background: rgba(0,0,0,0.05); border-color: rgba(0,0,0,0.18); }
        [data-theme="light"] .ev-region-tab--active { background: rgba(179,0,0,0.1); color: #B30000; border-color: rgba(179,0,0,0.25); }

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

        .ev-leader-badge {
          display: inline-flex; align-items: center;
          padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600;
          background: rgba(251,191,36,0.1); color: #fbbf24;
          border: 1px solid rgba(251,191,36,0.2); letter-spacing: 0.04em;
        }

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
        .ev-score-input--auto { opacity: 0.6; cursor: not-allowed; background: rgba(251,191,36,0.05); border-color: rgba(251,191,36,0.15); }
        .ev-score-input--over-max { border-color: rgba(255,160,0,0.6); background: rgba(255,140,0,0.05); animation: evShake 0.25s ease; }
        @keyframes evShake { 0%,100% { transform:translateX(0); } 25% { transform:translateX(-3px); } 75% { transform:translateX(3px); } }
        .ev-over-max-tip { position:absolute; top:100%; left:0; margin-top:3px; background:rgba(30,20,0,0.95); border:1px solid rgba(255,160,0,0.4); color:rgba(255,200,80,0.95); font-size:11px; padding:4px 8px; border-radius:6px; white-space:nowrap; z-index:10; pointer-events:none; }
        .ev-score-input::-webkit-inner-spin-button { opacity: 0.5; }

        .ev-tr--auto { background: rgba(251,191,36,0.02); }
        .ev-tr--readonly { opacity: 0.55; }
        .ev-na-badge {
          display: inline-flex; align-items: center;
          margin-left: 7px;
          padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;
          background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.35);
          border: 1px solid rgba(255,255,255,0.1); letter-spacing: 0.04em;
          vertical-align: middle;
        }
        [data-theme="light"] .ev-na-badge {
          background: rgba(99,102,241,0.08); color: rgba(79,70,229,0.75);
          border-color: rgba(99,102,241,0.2);
        }
        .ev-auto-badge {
          display: inline-flex; align-items: center;
          margin-left: 7px;
          padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;
          background: rgba(251,191,36,0.1); color: rgba(251,191,36,0.8);
          border: 1px solid rgba(251,191,36,0.15); letter-spacing: 0.04em;
          vertical-align: middle;
        }

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
        .ev-save-msg--pending {
          color: rgba(251,191,36,0.9); font-style: normal; font-weight: 600;
          animation: evPulse 1.8s ease-in-out infinite;
        }
        @keyframes evPulse { 0%,100% { opacity:0.9; } 50% { opacity:0.45; } }

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

        .ev-btn--submit-blocked {
          opacity: 0.45;
          cursor: not-allowed;
          box-shadow: none;
        }
        .ev-btn--submit-blocked:hover { transform: none !important; box-shadow: none !important; }

        .ev-btn--draft {
          background: rgba(251,191,36,0.1);
          color: rgba(251,191,36,0.85);
          border: 1px solid rgba(251,191,36,0.2);
        }
        .ev-btn--draft:hover:not(:disabled) { background: rgba(251,191,36,0.17); color: #fbbf24; }

        .ev-btn--primary {
          background: #B30000;
          color: #fff;
          box-shadow: 0 4px 20px rgba(179,0,0,0.3);
        }
        .ev-btn--primary:hover:not(:disabled) {
          background: #cc0000;
          box-shadow: 0 6px 28px rgba(179,0,0,0.45);
        }

        /* ── Incomplete check popup ── */
        .ev-check-overlay {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(0,0,0,0.55); backdrop-filter: blur(3px);
          display: flex; align-items: center; justify-content: center;
        }
        .ev-check-modal {
          background: #1a1a1a; border: 1px solid rgba(255,255,255,0.1);
          border-radius: 14px; padding: 24px 28px; max-width: 380px; width: 90%;
          box-shadow: 0 24px 60px rgba(0,0,0,0.6);
          display: flex; flex-direction: column; gap: 14px;
        }
        .ev-check-header { display: flex; align-items: center; gap: 10px; }
        .ev-check-icon { color: #fbbf24; flex-shrink: 0; }
        .ev-check-title { font-size: 15px; font-weight: 600; color: #fff; }
        .ev-check-desc { margin: 0; font-size: 13px; color: rgba(255,255,255,0.55); }
        .ev-check-list {
          margin: 0; padding: 10px 14px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px; list-style: none; display: flex; flex-direction: column; gap: 4px;
          max-height: 180px; overflow-y: auto;
        }
        .ev-check-list li { font-size: 13px; color: rgba(255,255,255,0.75); padding: 2px 0; }
        .ev-check-list li::before { content: "·  "; color: rgba(179,0,0,0.7); font-weight: 700; }
        .ev-check-actions { display: flex; gap: 8px; justify-content: flex-end; }
        [data-theme="light"] .ev-check-modal {
          background: #fff; border-color: rgba(0,0,0,0.1);
          box-shadow: 0 24px 60px rgba(0,0,0,0.15);
        }
        [data-theme="light"] .ev-check-title { color: #1a1a1a; }
        [data-theme="light"] .ev-check-desc { color: rgba(0,0,0,0.5); }
        [data-theme="light"] .ev-check-list { background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.08); }
        [data-theme="light"] .ev-check-list li { color: rgba(0,0,0,0.75); }
        [data-theme="light"] .ev-btn--draft { background: rgba(180,130,0,0.08); color: #92680a; border-color: rgba(180,130,0,0.2); }

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
        [data-theme="light"] .ev-save-msg--pending { color: #a07800; }
        [data-theme="light"] .ev-btn--ghost { background: rgba(0,0,0,0.05); border-color: rgba(0,0,0,0.1); color: rgba(0,0,0,0.6); }
        [data-theme="light"] .ev-read-only-msg { background: rgba(0,0,0,0.02); border-color: rgba(0,0,0,0.08); color: rgba(0,0,0,0.4); }

        /* ── Back / open-list buttons (hidden on desktop) ── */
        .ev-back-btn, .ev-mobile-open-list, .ev-mobile-close-list { display: none; }

        /* ── Mobile layout ── */
        @media (max-width: 768px) {
          .ev-root { flex-direction: column; height: auto; }

          /* Left panel: full width, shown/hidden via root class */
          .ev-left { width: 100%; border-radius: 12px; max-height: none; }
          .ev-right { margin-left: 0; margin-top: 12px; min-height: 0; }

          /* When showing the list, hide the right panel */
          .ev-root--list .ev-right { display: none; }
          /* When showing the form, hide the left panel */
          .ev-root--form .ev-left { display: none; }
          /* Also hide right margin when form is showing */
          .ev-root--form .ev-right { margin-top: 0; }

          /* Back button inside form header */
          .ev-back-btn {
            display: inline-flex; align-items: center; gap: 4px;
            padding: 5px 10px; border-radius: 7px; border: 1px solid rgba(255,255,255,0.1);
            background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.5);
            font-size: 12px; font-weight: 600; cursor: pointer;
            font-family: var(--font-sans), sans-serif;
            transition: background 0.15s, color 0.15s;
            flex-shrink: 0;
          }
          .ev-back-btn:hover { background: rgba(255,255,255,0.09); color: rgba(255,255,255,0.8); }
          [data-theme="light"] .ev-back-btn { border-color: rgba(0,0,0,0.1); background: rgba(0,0,0,0.04); color: rgba(0,0,0,0.55); }
          [data-theme="light"] .ev-back-btn:hover { background: rgba(0,0,0,0.08); color: rgba(0,0,0,0.8); }

          /* "Xem phiếu" button at list footer */
          .ev-mobile-close-list {
            display: inline-flex; align-items: center; justify-content: center; gap: 5px;
            width: 100%; margin-top: 8px;
            padding: 8px 12px; border-radius: 8px;
            border: 1px solid rgba(179,0,0,0.25); background: rgba(179,0,0,0.08);
            color: rgba(255,130,130,0.9); font-size: 12.5px; font-weight: 600;
            cursor: pointer; font-family: var(--font-sans), sans-serif;
            transition: background 0.15s;
          }
          .ev-mobile-close-list:hover { background: rgba(179,0,0,0.14); }
          [data-theme="light"] .ev-mobile-close-list { border-color: rgba(179,0,0,0.2); background: rgba(179,0,0,0.06); color: #B30000; }

          /* "Chọn phòng ban" button in placeholder */
          .ev-mobile-open-list {
            display: inline-flex; align-items: center; gap: 6px;
            margin-top: 8px; padding: 9px 18px; border-radius: 9px;
            border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.06);
            color: rgba(255,255,255,0.65); font-size: 13px; font-weight: 600;
            cursor: pointer; font-family: var(--font-sans), sans-serif;
            transition: background 0.15s, color 0.15s;
          }
          .ev-mobile-open-list:hover { background: rgba(255,255,255,0.1); color: #fff; }
          [data-theme="light"] .ev-mobile-open-list { border-color: rgba(0,0,0,0.12); background: rgba(0,0,0,0.04); color: rgba(0,0,0,0.6); }

          .ev-form-header { flex-wrap: wrap; gap: 8px; }
          .ev-actions { flex-wrap: wrap; }
          .ev-btn { flex: 1; justify-content: center; }
        }
      `}</style>
    </div>
  )
}
