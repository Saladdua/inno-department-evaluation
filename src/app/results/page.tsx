'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function useKineticGrid(ref: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let W = window.innerWidth, H = window.innerHeight
    let mx = W / 2, my = H / 2
    canvas.width = W; canvas.height = H

    const GAP = 38, RADIUS = 130, PUSH = 18, LERP = 0.08
    type Dot = { ox: number; oy: number; x: number; y: number }
    let grid: Dot[] = []

    function build() {
      grid = []
      const cols = Math.ceil(W / GAP) + 2
      const rows = Math.ceil(H / GAP) + 2
      for (let r = 0; r <= rows; r++)
        for (let c = 0; c <= cols; c++)
          grid.push({ ox: c * GAP, oy: r * GAP, x: c * GAP, y: r * GAP })
    }
    build()

    let raf: number
    function tick() {
      ctx.clearRect(0, 0, W, H)
      for (const d of grid) {
        const dx = d.ox - mx, dy = d.oy - my
        const dist = Math.sqrt(dx * dx + dy * dy)
        let tx = d.ox, ty = d.oy
        if (dist < RADIUS && dist > 0) {
          const str = (1 - dist / RADIUS) * PUSH
          tx = d.ox + (dx / dist) * str
          ty = d.oy + (dy / dist) * str
        }
        d.x += (tx - d.x) * LERP
        d.y += (ty - d.y) * LERP
        const cdx = d.x - mx, cdy = d.y - my
        const prox = Math.max(0, 1 - Math.sqrt(cdx * cdx + cdy * cdy) / RADIUS)
        const alpha = 0.06 + prox * 0.22
        const r = 1.0 + prox * 1.4
        ctx.beginPath()
        ctx.arc(d.x, d.y, r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(179,0,0,${alpha.toFixed(3)})`
        ctx.fill()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const onMove = (e: MouseEvent) => { mx = e.clientX; my = e.clientY }
    const onResize = () => { W = window.innerWidth; H = window.innerHeight; canvas.width = W; canvas.height = H; build() }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('resize', onResize)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('mousemove', onMove); window.removeEventListener('resize', onResize) }
  }, [ref])
}

function useConfetti(ref: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let W = window.innerWidth, H = window.innerHeight
    canvas.width = W; canvas.height = H

    const COLORS = ['#B30000','#FF4500','#FFD700','#FFA500','#FF6B6B','#FF8C42','#C8A84B','#E63946']
    type Piece = { x: number; y: number; w: number; h: number; color: string; vx: number; vy: number; angle: number; spin: number; alpha: number; shape: 'rect' | 'circle' }

    function spawn(): Piece {
      return {
        x: Math.random() * W,
        y: -20,
        w: Math.random() * 8 + 4,
        h: Math.random() * 14 + 6,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        vx: (Math.random() - 0.5) * 1.8,
        vy: Math.random() * 2 + 1.2,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.12,
        alpha: Math.random() * 0.55 + 0.35,
        shape: Math.random() > 0.4 ? 'rect' : 'circle',
      }
    }

    const pieces: Piece[] = Array.from({ length: 60 }, spawn)

    let raf: number
    function tick() {
      ctx.clearRect(0, 0, W, H)
      for (const p of pieces) {
        p.x += p.vx; p.y += p.vy; p.angle += p.spin
        if (p.y > H + 20) { Object.assign(p, spawn(), { y: -20 }) }
        ctx.save()
        ctx.globalAlpha = p.alpha
        ctx.translate(p.x, p.y)
        ctx.rotate(p.angle)
        ctx.fillStyle = p.color
        if (p.shape === 'circle') {
          ctx.beginPath(); ctx.ellipse(0, 0, p.w / 2, p.h / 2, 0, 0, Math.PI * 2); ctx.fill()
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        }
        ctx.restore()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const onResize = () => { W = window.innerWidth; H = window.innerHeight; canvas.width = W; canvas.height = H }
    window.addEventListener('resize', onResize)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize) }
  }, [ref])
}

const LOGO_URL = process.env.NEXT_PUBLIC_COMPANY_LOGO_URL ?? ''

interface PeriodOption { id: string; quarter: number; year: number; status: string }
interface DeptResult {
  id: string; name: string; code: string | null; region: string | null
  rank: number; avgScore: number | null
}

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }
const MEDAL_GRADIENT: Record<number, string> = {
  1: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
  2: 'linear-gradient(135deg, #C8C8C8 0%, #A0A0A0 100%)',
  3: 'linear-gradient(135deg, #CD7F32 0%, #B8651A 100%)',
}
const MEDAL_SHADOW: Record<number, string> = {
  1: '0 8px 40px rgba(255,180,0,0.3)',
  2: '0 8px 40px rgba(150,150,150,0.25)',
  3: '0 8px 40px rgba(180,100,30,0.25)',
}
const BLOCK_H: Record<number, number> = { 1: 110, 2: 80, 3: 60 }

function fmt(n: number | null) { return n == null ? '—' : n.toFixed(2) }
function pct(score: number | null, max = 100) {
  if (score == null || max === 0) return 0
  return Math.min(100, (score / max) * 100)
}

function PublicResultsPage() {
  const router = useRouter()
  const params = useSearchParams()
  const gridRef     = useRef<HTMLCanvasElement>(null)
  const confettiRef = useRef<HTMLCanvasElement>(null)
  useKineticGrid(gridRef)
  useConfetti(confettiRef)
  const yearParam    = params.get('year')
  const quarterParam = params.get('quarter')

  const [periods,    setPeriods]    = useState<PeriodOption[]>([])
  const [results,    setResults]    = useState<DeptResult[]>([])
  const [loading,    setLoading]    = useState(true)
  const [region,     setRegion]     = useState<'Miền Bắc' | 'Miền Nam'>('Miền Bắc')
  const [barVisible, setBarVisible] = useState(false)

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

  const activeQuarter = quarterParam ? Number(quarterParam) : (quartersForYear[0] ?? null)

  const activePeriod = useMemo(() =>
    periods.find(p => p.year === activeYear && p.quarter === activeQuarter) ?? null,
    [periods, activeYear, activeQuarter])

  useEffect(() => {
    if (!activePeriod) { setResults([]); setLoading(false); return }
    setLoading(true)
    setBarVisible(false)
    fetch(`/api/public/results?periodId=${activePeriod.id}`)
      .then(r => r.json())
      .then(data => setResults(data ?? []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }, [activePeriod?.id])

  useEffect(() => {
    if (!loading && results.length > 0) {
      requestAnimationFrame(() => requestAnimationFrame(() => setBarVisible(true)))
    }
  }, [loading, results])

  const displayResults = useMemo(() => {
    const filtered = results.filter(r => (r.region ?? 'Miền Bắc') === region)
    // Re-rank within region
    let rank = 1
    filtered
      .filter(r => r.avgScore != null)
      .sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0))
      .forEach(r => { r.rank = rank++ })
    return filtered.sort((a, b) => {
      if (a.avgScore != null && b.avgScore != null) return a.rank - b.rank
      if (a.avgScore != null) return -1
      if (b.avgScore != null) return 1
      return a.name.localeCompare(b.name)
    })
  }, [results, region])

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
      <canvas ref={gridRef}     className="pr-canvas pr-canvas--grid"     aria-hidden="true" />
      <canvas ref={confettiRef} className="pr-canvas pr-canvas--confetti" aria-hidden="true" />
      <div className="pr-blob pr-blob--1" aria-hidden="true" />
      <div className="pr-blob pr-blob--2" aria-hidden="true" />

      {/* ── Header ── */}
      <header className="pr-header">
        <div className="pr-header-top">
          <div className="pr-brand">
            {LOGO_URL
              ? <img src={LOGO_URL} alt="Logo" className="pr-logo" />
              : <span className="pr-brand-name">INNO JSC</span>}
          </div>
          <div className="pr-filters">
            {years.length > 0 && (
              <div className="pr-select-wrap">
                <select className="pr-select" value={activeYear}
                  onChange={e => router.push(`/results?year=${e.target.value}`)}>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <svg className="pr-select-icon" width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            )}
            {quartersForYear.length > 0 && (
              <div className="pr-select-wrap">
                <select className="pr-select" value={activeQuarter ?? ''}
                  onChange={e => router.push(`/results?year=${activeYear}&quarter=${e.target.value}`)}>
                  {[1,2,3,4].map(q => {
                    const exists = quartersForYear.includes(q)
                    return <option key={q} value={q} disabled={!exists}>Quý {q}</option>
                  })}
                </select>
                <svg className="pr-select-icon" width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
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
        </div>

        <div className="pr-hero">
          <div className="pr-hero-eyebrow">Kết quả chính thức</div>
          <h1 className="pr-hero-title">Đánh giá Phòng ban</h1>
          <div className="pr-hero-meta">
            <span className="pr-period-chip">{periodLabel}</span>
            {ranked.length > 0 && (
              <span className="pr-count-chip">{ranked.length} phòng ban</span>
            )}
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      {loading ? (
        <div className="pr-loading">
          <div className="pr-spinner" />
          <span>Đang tải kết quả…</span>
        </div>
      ) : displayResults.length === 0 ? (
        <div className="pr-empty">
          <div className="pr-empty-icon">📊</div>
          <p>Chưa có kết quả nào trong kỳ này.</p>
        </div>
      ) : (
        <div className="pr-body">

          {/* ── Podium ── */}
          {ranked.length >= 1 && (
            <section className="pr-podium-section">
              <div className="pr-section-label">🏆 Bảng vinh danh</div>
              <div className="pr-podium">
                {([1, 0, 2] as const).map(idx => {
                  const r = ranked[idx]
                  const place = idx + 1
                  if (!r) return <div key={idx} className="pr-podium-slot pr-podium-slot--empty" />
                  return (
                    <div key={r.id} className={`pr-podium-slot pr-podium-slot--${place}`}>
                      <div className="pr-pm-card" style={{ boxShadow: MEDAL_SHADOW[place] }}>
                        <div className="pr-pm-medal-badge" style={{ background: MEDAL_GRADIENT[place] }}>{place}</div>
                        <div className="pr-pm-emoji">{MEDAL[place]}</div>
                        <div className="pr-pm-name">{r.name}</div>
                        <div className="pr-pm-score">{fmt(r.avgScore)}</div>
                        <div className="pr-pm-score-label">điểm</div>
                      </div>
                      <div className="pr-pm-block" style={{ height: BLOCK_H[place], background: MEDAL_GRADIENT[place] }}>
                        <span className="pr-pm-place">{place}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* ── Rankings list ── */}
          {tableRows.length > 0 && (
            <section className="pr-list-section">
              {ranked.length > 3 && <div className="pr-section-label">📋 Bảng xếp hạng</div>}
              <div className="pr-list">
                {tableRows.map((r, i) => (
                  <div key={r.id}
                    className={`pr-row${r.avgScore == null ? ' pr-row--unranked' : ''}`}
                    style={{ animationDelay: `${0.08 + i * 0.06}s` } as React.CSSProperties}>
                    <div className="pr-row-rank-wrap">
                      <span className="pr-row-rank">{r.avgScore != null ? r.rank : '—'}</span>
                    </div>
                    <div className="pr-row-mid">
                      <span className="pr-row-name">{r.name}</span>
                      <div className="pr-bar-track">
                        <div className="pr-bar-fill" style={{
                          width: barVisible ? `${pct(r.avgScore).toFixed(1)}%` : '0%',
                          transitionDelay: `${0.12 + i * 0.06}s`,
                        }} />
                      </div>
                    </div>
                    <div className="pr-row-score-col">
                      <span className="pr-row-score">{fmt(r.avgScore)}</span>
                      <span className="pr-row-score-label">/ 100</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <footer className="pr-footer">
        <span className="pr-footer-brand">INNO JSC</span>
        <span className="pr-footer-sep">·</span>
        <span>Hệ thống Đánh giá Phòng ban</span>
        <span className="pr-footer-sep">·</span>
        <span>{periodLabel}</span>
      </footer>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #f0f2f5 !important; color: #1a1a1a !important; }
        body { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; min-height: 100dvh; }

        .pr-root {
          position: relative; min-height: 100dvh;
          display: flex; flex-direction: column;
          padding: 36px 56px 56px;
          gap: 40px;
        }

        .pr-canvas { position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; }
        .pr-canvas--grid     { z-index: 0; opacity: 0.6; }
        .pr-canvas--confetti { z-index: 1; opacity: 1; }

        .pr-blob { position: fixed; border-radius: 50%; pointer-events: none; z-index: 0; filter: blur(90px); }
        .pr-blob--1 { width: 600px; height: 600px; background: radial-gradient(circle, rgba(179,0,0,0.1) 0%, transparent 70%); top: -200px; right: -150px; }
        .pr-blob--2 { width: 500px; height: 500px; background: radial-gradient(circle, rgba(255,100,0,0.07) 0%, transparent 70%); bottom: -120px; left: -100px; }

        /* ── Header ── */
        .pr-header { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 28px; }
        .pr-header-top { display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
        .pr-logo { height: 44px; max-width: 180px; object-fit: contain; }
        .pr-brand-name { font-size: 16px; font-weight: 800; letter-spacing: 0.2em; color: #B30000; text-transform: uppercase; }

        .pr-filters { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .pr-select-wrap { position: relative; display: flex; align-items: center; }
        .pr-select {
          appearance: none; -webkit-appearance: none;
          background: #fff; border: 1.5px solid rgba(0,0,0,0.12);
          border-radius: 10px; padding: 8px 36px 8px 14px;
          font-size: 13px; font-weight: 700; letter-spacing: 0.03em;
          color: #1a1a1a; cursor: pointer; outline: none;
          font-family: 'Plus Jakarta Sans', sans-serif;
          box-shadow: 0 1px 4px rgba(0,0,0,0.06);
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .pr-select:hover { border-color: rgba(179,0,0,0.4); }
        .pr-select:focus { border-color: #B30000; box-shadow: 0 0 0 3px rgba(179,0,0,0.1); }
        .pr-select option:disabled { color: rgba(0,0,0,0.25); }
        .pr-select-icon { position: absolute; right: 12px; pointer-events: none; color: rgba(0,0,0,0.35); }

        .pr-region-tabs { display: flex; gap: 4px; background: rgba(0,0,0,0.05); padding: 3px; border-radius: 10px; }
        .pr-region-tab { padding: 6px 16px; border-radius: 7px; border: none; cursor: pointer; font-size: 12px; font-weight: 600; background: transparent; color: rgba(0,0,0,0.45); font-family: 'Plus Jakarta Sans', sans-serif; transition: background 0.15s, color 0.15s; }
        .pr-region-tab--active { background: #fff; color: #B30000; box-shadow: 0 2px 8px rgba(0,0,0,0.1); font-weight: 700; }

        .pr-hero { }
        .pr-hero-eyebrow { font-size: 12px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #B30000; margin-bottom: 8px; }
        .pr-hero-title {
          font-size: clamp(32px, 5vw, 56px); font-weight: 900;
          letter-spacing: -0.03em; line-height: 1.15;
          padding-bottom: 0.08em;
          background: linear-gradient(130deg, #0f0f0f 30%, #B30000 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }
        .pr-hero-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
        .pr-period-chip { display: inline-flex; align-items: center; padding: 5px 14px; border-radius: 20px; font-size: 13px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; background: #B30000; color: #fff; box-shadow: 0 4px 16px rgba(179,0,0,0.3); }
        .pr-count-chip { display: inline-flex; align-items: center; padding: 5px 14px; border-radius: 20px; font-size: 13px; font-weight: 500; background: rgba(0,0,0,0.06); color: rgba(0,0,0,0.45); border: 1px solid rgba(0,0,0,0.08); }

        /* ── Loading / Empty ── */
        .pr-loading { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 100px 20px; color: rgba(0,0,0,0.35); font-size: 15px; position: relative; z-index: 1; }
        .pr-spinner { width: 36px; height: 36px; border-radius: 50%; border: 3px solid rgba(179,0,0,0.15); border-top-color: #B30000; animation: prSpin 0.7s linear infinite; }
        @keyframes prSpin { to { transform: rotate(360deg); } }
        .pr-empty { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 100px 20px; text-align: center; color: rgba(0,0,0,0.35); font-size: 15px; position: relative; z-index: 1; }
        .pr-empty-icon { font-size: 48px; }

        /* ── Body ── */
        .pr-body { display: flex; flex-direction: column; gap: 48px; position: relative; z-index: 1; }
        .pr-section-label { font-size: 14px; font-weight: 700; letter-spacing: 0.04em; color: rgba(0,0,0,0.45); margin-bottom: 20px; }

        /* ── Podium ── */
        .pr-podium { display: flex; align-items: flex-end; gap: 24px; }
        .pr-podium-slot { display: flex; flex-direction: column; align-items: center; flex: 1; }
        .pr-podium-slot--empty { min-height: 60px; }
        .pr-podium-slot--1 { order: 2; }
        .pr-podium-slot--2 { order: 1; }
        .pr-podium-slot--3 { order: 3; }

        .pr-pm-card {
          width: 100%; background: #fff; border-radius: 20px;
          padding: 24px 20px 18px; display: flex; flex-direction: column; align-items: center; gap: 6px;
          position: relative; margin-bottom: -4px; border: 1px solid rgba(0,0,0,0.06);
          animation: prPopIn 0.55s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        .pr-podium-slot--1 .pr-pm-card { animation-delay: 0.08s; }
        .pr-podium-slot--2 .pr-pm-card { animation-delay: 0.18s; }
        .pr-podium-slot--3 .pr-pm-card { animation-delay: 0.24s; }
        @keyframes prPopIn {
          0%   { opacity: 0; transform: translateY(32px) scale(0.88); }
          60%  { opacity: 1; transform: translateY(-6px) scale(1.03); }
          100% { opacity: 1; transform: translateY(0)    scale(1); }
        }

        .pr-pm-medal-badge { position: absolute; top: -16px; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 900; color: #fff; box-shadow: 0 4px 14px rgba(0,0,0,0.25); }
        .pr-pm-emoji { font-size: 36px; line-height: 1; margin-top: 8px; }
        .pr-pm-name { font-size: 15px; font-weight: 800; color: #0f0f0f; text-align: center; line-height: 1.3; margin-top: 2px; }
        .pr-pm-score { font-size: 30px; font-weight: 200; letter-spacing: -0.04em; color: #B30000; line-height: 1; margin-top: 6px; }
        .pr-podium-slot--1 .pr-pm-score { font-size: 40px; }
        .pr-pm-score-label { font-size: 11px; color: rgba(0,0,0,0.3); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }

        .pr-pm-block { width: 100%; border-radius: 12px 12px 0 0; display: flex; align-items: center; justify-content: center; box-shadow: inset 0 2px 0 rgba(255,255,255,0.3); }
        .pr-pm-place { font-size: 22px; font-weight: 900; color: rgba(255,255,255,0.55); }

        /* ── Rankings list ── */
        .pr-list { display: flex; flex-direction: column; gap: 10px; }
        .pr-row {
          display: flex; align-items: center; gap: 20px;
          padding: 18px 24px; border-radius: 16px;
          background: #fff; border: 1px solid rgba(0,0,0,0.06);
          box-shadow: 0 1px 4px rgba(0,0,0,0.04);
          animation: prFadeUp 0.4s ease both;
          transition: box-shadow 0.15s, transform 0.15s;
        }
        .pr-row:hover { box-shadow: 0 6px 24px rgba(0,0,0,0.09); transform: translateY(-2px); }
        .pr-row--unranked { opacity: 0.45; }
        @keyframes prFadeUp {
          from { opacity: 0; transform: translateY(20px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }

        .pr-row-rank-wrap { width: 44px; height: 44px; border-radius: 12px; flex-shrink: 0; background: rgba(0,0,0,0.04); display: flex; align-items: center; justify-content: center; }
        .pr-row-rank { font-size: 16px; font-weight: 900; color: rgba(0,0,0,0.35); }

        .pr-row-mid { flex: 1; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
        .pr-row-name { font-size: 16px; font-weight: 700; color: #0f0f0f; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .pr-bar-track { height: 7px; background: rgba(0,0,0,0.07); border-radius: 99px; overflow: hidden; }
        .pr-bar-fill { height: 100%; background: linear-gradient(90deg, #B30000 0%, #ff4500 100%); border-radius: 99px; transition: width 1.1s cubic-bezier(0.22,1,0.36,1); box-shadow: 0 0 10px rgba(179,0,0,0.35); }

        .pr-row-score-col { display: flex; flex-direction: column; align-items: flex-end; flex-shrink: 0; min-width: 80px; }
        .pr-row-score { font-size: 24px; font-weight: 200; letter-spacing: -0.03em; color: #B30000; line-height: 1; }
        .pr-row-score-label { font-size: 11px; color: rgba(0,0,0,0.25); font-weight: 500; }

        /* ── Footer ── */
        .pr-footer { margin-top: auto; padding-top: 28px; display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap; font-size: 13px; color: rgba(0,0,0,0.3); position: relative; z-index: 1; border-top: 1px solid rgba(0,0,0,0.07); }
        .pr-footer-brand { font-weight: 800; color: #B30000; letter-spacing: 0.06em; }
        .pr-footer-sep { color: rgba(0,0,0,0.15); }

        @media (max-width: 768px) {
          .pr-root { padding: 24px 20px 40px; gap: 28px; }
          .pr-podium { gap: 12px; }
          .pr-pm-card { padding: 18px 12px 14px; }
          .pr-pm-score { font-size: 22px; }
          .pr-podium-slot--1 .pr-pm-score { font-size: 28px; }
          .pr-row { padding: 14px 16px; gap: 14px; }
          .pr-row-name { font-size: 14px; }
          .pr-row-score { font-size: 20px; }
        }
      `}</style>
    </div>
  )
}

export default function PublicResultsPageWrapper() {
  return <Suspense><PublicResultsPage /></Suspense>
}
