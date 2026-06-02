'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { ChevronDown } from 'lucide-react'

const LOGO_URL = process.env.NEXT_PUBLIC_COMPANY_LOGO_URL ?? ''

interface PeriodOption { id: string; quarter: number; year: number; status: string }
interface DeptResult {
  id: string; name: string; code: string | null; region: string | null
  rank: number; avgScore: number | null
}

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

function fmt(n: number | null) { return n == null ? '—' : n.toFixed(2) }
function pct(score: number | null, max = 100) {
  if (score == null || max === 0) return 0
  return Math.min(100, (score / max) * 100)
}

function PublicResultsPage() {
  const router = useRouter()
  const params = useSearchParams()
  const yearParam    = params.get('year')
  const quarterParam = params.get('quarter')

  const [periods,  setPeriods]  = useState<PeriodOption[]>([])
  const [results,  setResults]  = useState<DeptResult[]>([])
  const [loading,  setLoading]  = useState(true)
  const [region,   setRegion]   = useState<'Miền Bắc' | 'Miền Nam'>('Miền Bắc')

  useEffect(() => {
    fetch('/api/public/results?periods=true')
      .then(r => r.json())
      .then(data => setPeriods(data ?? []))
      .catch(() => {})
  }, [])

  const years = useMemo(() =>
    [...new Set(periods.map(p => p.year))].sort((a, b) => b - a), [periods])

  const activeYear = yearParam ? Number(yearParam) : (years[0] ?? new Date().getFullYear())

  const quartersForYear = useMemo(() =>
    periods.filter(p => p.year === activeYear).map(p => p.quarter).sort((a, b) => a - b),
    [periods, activeYear])

  const activeQuarter = quarterParam
    ? Number(quarterParam)
    : (quartersForYear[0] ?? null)

  const activePeriod = useMemo(() =>
    periods.find(p => p.year === activeYear && p.quarter === activeQuarter) ?? null,
    [periods, activeYear, activeQuarter])

  useEffect(() => {
    if (!activePeriod) { setResults([]); setLoading(false); return }
    setLoading(true)
    fetch(`/api/public/results?periodId=${activePeriod.id}`)
      .then(r => r.json())
      .then(data => setResults(data ?? []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }, [activePeriod?.id])

  const displayResults = useMemo(() =>
    results.filter(r => (r.region ?? 'Miền Bắc') === region),
    [results, region])

  const ranked   = displayResults.filter(r => r.avgScore != null)
  const unranked = displayResults.filter(r => r.avgScore == null)
  const tableRows = [...ranked.filter(r => r.rank > 3), ...unranked]
  const regions = [...new Set(results.map(r => r.region ?? 'Miền Bắc'))]
  const hasRegions = regions.length > 1

  const periodLabel = activePeriod
    ? `Quý ${activePeriod.quarter} · ${activePeriod.year}`
    : activeYear ? `Năm ${activeYear}` : '—'

  return (
    <div className="pr-root">
      <header className="pr-header">
        <div className="pr-brand">
          {LOGO_URL
            ? <img src={LOGO_URL} alt="Logo" className="pr-logo" />
            : <span className="pr-brand-name">INNO JSC</span>}
        </div>
        <div className="pr-header-center">
          <h1 className="pr-title">Kết quả Đánh giá Phòng ban</h1>
          <span className="pr-period-badge">{periodLabel}</span>
        </div>
      </header>

      <div className="pr-controls">
        {years.length > 0 && (
          <div className="pr-select-wrap">
            <select className="pr-select" value={activeYear}
              onChange={e => router.push(`/results?year=${e.target.value}`)}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <ChevronDown size={12} className="pr-select-icon" />
          </div>
        )}
        {quartersForYear.length > 0 && (
          <div className="pr-select-wrap">
            <select className="pr-select" value={activeQuarter ?? ''}
              onChange={e => router.push(`/results?year=${activeYear}&quarter=${e.target.value}`)}>
              {quartersForYear.map(q => <option key={q} value={q}>Quý {q}</option>)}
            </select>
            <ChevronDown size={12} className="pr-select-icon" />
          </div>
        )}
        {hasRegions && (
          <div className="pr-region-tabs">
            {(['Miền Bắc', 'Miền Nam'] as const).map(r => (
              <button key={r}
                className={`pr-region-tab${region === r ? ' pr-region-tab--active' : ''}`}
                onClick={() => setRegion(r)}>{r}</button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="pr-loading">Đang tải…</div>
      ) : displayResults.length === 0 ? (
        <div className="pr-empty">Chưa có kết quả nào trong kỳ này.</div>
      ) : (
        <div className="pr-body">
          {ranked.length >= 1 && (
            <div className="pr-podium-section">
              <div className="pr-section-label">Top Phòng Ban</div>
              <div className="pr-podium">
                {([1, 0, 2] as const).map(idx => {
                  const r = ranked[idx]
                  const place = idx + 1
                  if (!r) return <div key={idx} className="pr-podium-slot pr-podium-slot--empty" />
                  const blockH: Record<number, number> = { 1: 88, 2: 64, 3: 52 }
                  const colors: Record<number, string> = { 1: '#C8A84B', 2: '#9EB5C8', 3: '#C8956C' }
                  const color = colors[place]
                  return (
                    <div key={r.id} className={`pr-podium-slot pr-podium-slot--${place}`}>
                      <div className="pr-pm-card" style={{ '--mc': color } as React.CSSProperties}>
                        <div className="pr-pm-medal">{MEDAL[place]}</div>
                        <span className="pr-pm-code">{r.code ?? r.name}</span>
                        <span className="pr-pm-score" style={{ color }}>{fmt(r.avgScore)}</span>
                      </div>
                      <div className="pr-pm-block" style={{ height: blockH[place], borderColor: color, boxShadow: `0 4px 32px ${color}22` }}>
                        <span className="pr-pm-num" style={{ color }}>{MEDAL[place]}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {tableRows.length > 0 && (
            <div className="pr-list-section">
              {ranked.length > 3 && <div className="pr-section-label">Bảng Xếp Hạng</div>}
              <div className="pr-list">
                {tableRows.map((r, i) => (
                  <div key={r.id} className={`pr-row${r.avgScore == null ? ' pr-row--unranked' : ''}`}
                    style={{ animationDelay: `${0.04 + i * 0.03}s` } as React.CSSProperties}>
                    <span className="pr-row-rank">{r.avgScore != null ? r.rank : '—'}</span>
                    <div className="pr-row-mid">
                      <span className="pr-row-code">{r.code ?? r.name}</span>
                      <div className="pr-bar-track">
                        <div className="pr-bar-fill" style={{ width: `${pct(r.avgScore).toFixed(1)}%` }} />
                      </div>
                    </div>
                    <span className="pr-row-score">{fmt(r.avgScore)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <footer className="pr-footer">
        INNO JSC · Hệ thống Đánh giá Phòng ban · {periodLabel}
      </footer>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0a0a0a; color: #fff; font-family: system-ui, -apple-system, sans-serif; }
        .pr-root { min-height: 100dvh; display: flex; flex-direction: column; max-width: 860px; margin: 0 auto; padding: 28px 20px; gap: 24px; }

        .pr-header { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
        .pr-logo { height: 40px; max-width: 160px; object-fit: contain; }
        .pr-brand-name { font-size: 14px; font-weight: 700; letter-spacing: 0.2em; color: #fff; text-transform: uppercase; }
        .pr-header-center { display: flex; flex-direction: column; gap: 4px; }
        .pr-title { font-size: 20px; font-weight: 700; color: #fff; letter-spacing: -0.01em; }
        .pr-period-badge { display: inline-flex; padding: 2px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; background: rgba(179,0,0,0.15); color: rgba(179,0,0,0.9); border: 1px solid rgba(179,0,0,0.25); align-self: flex-start; }

        .pr-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .pr-select-wrap { position: relative; display: flex; align-items: center; }
        .pr-select { appearance: none; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 6px 28px 6px 12px; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.7); cursor: pointer; outline: none; font-family: inherit; }
        .pr-select option { background: #1a1a1a; }
        .pr-select-icon { position: absolute; right: 8px; pointer-events: none; color: rgba(255,255,255,0.35); }
        .pr-region-tabs { display: flex; gap: 2px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 3px; }
        .pr-region-tab { padding: 4px 12px; border-radius: 6px; border: none; cursor: pointer; font-size: 11px; font-weight: 600; background: transparent; color: rgba(255,255,255,0.4); font-family: inherit; transition: background 0.15s, color 0.15s; }
        .pr-region-tab--active { background: #B30000; color: #fff; box-shadow: 0 2px 8px rgba(179,0,0,0.35); }

        .pr-loading { padding: 60px; text-align: center; color: rgba(255,255,255,0.3); font-style: italic; }
        .pr-empty   { padding: 60px; text-align: center; color: rgba(255,255,255,0.25); font-style: italic; }
        .pr-body { display: flex; flex-direction: column; gap: 24px; }
        .pr-section-label { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,0.25); margin-bottom: 12px; }

        /* Podium */
        .pr-podium-section {}
        .pr-podium { display: flex; align-items: flex-end; justify-content: center; gap: 12px; }
        .pr-podium-slot { display: flex; flex-direction: column; align-items: center; gap: 0; flex: 1; max-width: 200px; }
        .pr-podium-slot--empty { min-height: 52px; }
        .pr-pm-card { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 14px 12px 10px; width: 100%; }
        .pr-pm-medal { font-size: 28px; line-height: 1; }
        .pr-pm-code { font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.85); letter-spacing: 0.04em; text-align: center; }
        .pr-pm-score { font-size: 18px; font-weight: 300; letter-spacing: -0.02em; }
        .pr-pm-block { width: 100%; border-radius: 8px 8px 0 0; border: 1px solid; border-bottom: none; background: rgba(255,255,255,0.02); display: flex; align-items: center; justify-content: center; }
        .pr-pm-num { font-size: 22px; }

        /* List */
        .pr-list { display: flex; flex-direction: column; gap: 0; border-radius: 12px; border: 1px solid rgba(255,255,255,0.06); overflow: hidden; background: rgba(255,255,255,0.015); }
        .pr-row { display: flex; align-items: center; gap: 14px; padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.04); animation: prFadeUp 0.4s ease both; }
        .pr-row:last-child { border-bottom: none; }
        .pr-row--unranked { opacity: 0.5; }
        @keyframes prFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .pr-row-rank { width: 28px; text-align: center; font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.4); flex-shrink: 0; }
        .pr-row-mid { flex: 1; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
        .pr-row-code { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.8); letter-spacing: 0.03em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .pr-bar-track { height: 3px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; }
        .pr-bar-fill { height: 100%; background: #B30000; border-radius: 2px; transition: width 0.6s cubic-bezier(0.34,1.56,0.64,1); }
        .pr-row-score { font-size: 15px; font-weight: 700; color: #B30000; min-width: 48px; text-align: right; flex-shrink: 0; }

        .pr-footer { margin-top: auto; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.05); font-size: 11px; color: rgba(255,255,255,0.2); text-align: center; letter-spacing: 0.03em; }
      `}</style>
    </div>
  )
}

export default function PublicResultsPageWrapper() {
  return <Suspense><PublicResultsPage /></Suspense>
}
