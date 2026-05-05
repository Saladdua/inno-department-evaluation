"use client";

import { Suspense, useState, useTransition, useEffect, useRef } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

const LOGO_URL = process.env.NEXT_PUBLIC_COMPANY_LOGO_URL ?? "";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let animId: number;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();

    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      alpha: number;
    }

    const COUNT = 38;
    const particles: Particle[] = Array.from({ length: COUNT }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      size: Math.random() * 2.2 + 0.6,
      alpha: Math.random() * 0.45 + 0.1,
    }));

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(179,0,0,${p.alpha})`;
        ctx.shadowBlur = 6;
        ctx.shadowColor = `rgba(200,20,20,${p.alpha * 0.6})`;
        ctx.fill();
      }
      animId = requestAnimationFrame(tick);
    };

    window.addEventListener("resize", resize);
    tick();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (result?.error) {
        setError("Email hoặc mật khẩu không đúng.");
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    });
  }

  return (
    <div className="login-root">
      {/* Particle canvas */}
      <canvas ref={canvasRef} className="particle-canvas" aria-hidden="true" />

      {/* Ambient background */}
      <div className="bg-layer" aria-hidden="true">
        <div className="bg-orb bg-orb--1" />
        <div className="bg-orb bg-orb--2" />
        <div className="bg-grid" />
      </div>

      <main className="login-shell">
        {/* Left panel — brand identity */}
        <aside className="brand-panel">
          <div className="brand-mark">
            {LOGO_URL ? (
              <img src={LOGO_URL} alt="Company Logo" className="brand-logo" />
            ) : (
              <>
                <span className="brand-dot" />
                <span className="brand-name">INNO</span>
              </>
            )}
          </div>
          <div className="brand-body">
            <h1 className="brand-headline">
              Hệ thống
              <br />
              <em>Đánh giá</em>
              <br />
              Phòng ban
            </h1>
            <p className="brand-sub">
              Nền tảng đánh giá nội bộ chuyên nghiệp dành riêng cho doanh
              nghiệp.
            </p>
          </div>
          <div className="brand-footer">
            <span className="brand-version">v1.0 · Internal</span>
          </div>
        </aside>

        {/* Right panel — login form */}
        <section className="form-panel">
          <div className="form-card">
            <header className="form-header">
              <div className="form-logo">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <rect width="28" height="28" rx="8" fill="#B30000" />
                  <path
                    d="M8 14h12M14 8v12"
                    stroke="white"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <h2 className="form-title">Đăng nhập</h2>
              <p className="form-desc">
                Vui lòng nhập thông tin tài khoản để tiếp tục.
              </p>
            </header>

            <form onSubmit={handleSubmit} className="form-body" noValidate>
              <div className="field">
                <label htmlFor="email" className="field-label">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="field-input"
                  placeholder="ten@innojsc.com"
                  disabled={isPending}
                />
              </div>

              <div className="field">
                <label htmlFor="password" className="field-label">
                  Mật khẩu
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="field-input"
                  placeholder="••••••••"
                  disabled={isPending}
                />
              </div>

              {error && (
                <div className="form-error" role="alert">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle
                      cx="8"
                      cy="8"
                      r="7"
                      stroke="#ff4444"
                      strokeWidth="1.5"
                    />
                    <path
                      d="M8 5v3.5M8 11h.01"
                      stroke="#ff4444"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                  {error}
                </div>
              )}

              <button type="submit" className="submit-btn" disabled={isPending}>
                {isPending ? (
                  <span className="btn-spinner" aria-label="Đang đăng nhập…" />
                ) : (
                  "Đăng nhập"
                )}
              </button>
            </form>

            <footer className="form-foot">
              <span>Liên hệ quản trị viên nếu quên mật khẩu.</span>
            </footer>
          </div>
        </section>
      </main>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .particle-canvas {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 1;
        }

        .login-root {
          position: relative;
          min-height: 100dvh;
          background: #080808;
          display: flex;
          align-items: stretch;
          overflow: hidden;
          font-family: var(--font-sans), sans-serif;
        }

        /* ── Background ── */
        .bg-layer {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
        }
        .bg-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(120px);
          opacity: 0.18;
        }
        .bg-orb--1 {
          width: 640px; height: 640px;
          background: radial-gradient(circle, #B30000, transparent 70%);
          top: -160px; left: -160px;
          animation: drift1 18s ease-in-out infinite alternate;
        }
        .bg-orb--2 {
          width: 480px; height: 480px;
          background: radial-gradient(circle, #7a0000, transparent 70%);
          bottom: -120px; right: 10%;
          animation: drift2 22s ease-in-out infinite alternate;
        }
        @keyframes drift1 {
          from { transform: translate(0, 0) scale(1); }
          to   { transform: translate(60px, 80px) scale(1.1); }
        }
        @keyframes drift2 {
          from { transform: translate(0, 0) scale(1); }
          to   { transform: translate(-40px, -60px) scale(1.08); }
        }
        .bg-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(179,0,0,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(179,0,0,0.04) 1px, transparent 1px);
          background-size: 48px 48px;
        }

        /* ── Shell ── */
        .login-shell {
          position: relative;
          z-index: 2;
          display: flex;
          width: 100%;
          min-height: 100dvh;
        }

        /* ── Brand panel ── */
        .brand-panel {
          display: none;
          flex-direction: column;
          justify-content: space-between;
          padding: 56px 52px;
          flex: 1;
          border-right: 1px solid rgba(179,0,0,0.12);
          background: linear-gradient(160deg, rgba(179,0,0,0.06) 0%, transparent 60%);
        }
        @media (min-width: 900px) {
          .brand-panel { display: flex; }
        }

        .brand-logo {
          height: 48px;
          max-width: 220px;
          object-fit: contain;
        }

        .brand-mark {
          display: flex;
          align-items: center;
          gap: 10px;
          animation: fadeSlideUp 0.7s cubic-bezier(0.34,1.56,0.64,1) 0.1s both;
        }

        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .brand-dot {
          display: block;
          width: 10px; height: 10px;
          border-radius: 50%;
          background: #B30000;
          box-shadow: 0 0 12px rgba(179,0,0,0.8);
        }
        .brand-name {
          font-family: var(--font-sans), sans-serif;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.25em;
          color: #fff;
          text-transform: uppercase;
        }

        .brand-body { margin-top: auto; margin-bottom: auto; }
        .brand-headline {
          font-family: var(--font-sans), sans-serif;
          font-size: clamp(36px, 4.5vw, 64px);
          font-weight: 400;
          line-height: 1.1;
          color: #fff;
          letter-spacing: -0.02em;
          animation: fadeSlideUp 0.7s cubic-bezier(0.34,1.56,0.64,1) 0.25s both;
        }
        .brand-headline em {
          font-style: italic;
          color: #B30000;
          text-shadow: 0 0 40px rgba(179,0,0,0.4);
          animation: glowPulse 3s ease-in-out 1s infinite;
        }
        @keyframes glowPulse {
          0%, 100% { text-shadow: 0 0 40px rgba(179,0,0,0.4); }
          50%       { text-shadow: 0 0 70px rgba(179,0,0,0.65), 0 0 20px rgba(255,80,80,0.3); }
        }
        .brand-sub {
          margin-top: 24px;
          font-size: 15px;
          line-height: 1.7;
          color: rgba(255,255,255,0.4);
          max-width: 320px;
          font-family: var(--font-sans), sans-serif;
          font-style: italic;
          animation: fadeSlideUp 0.6s ease 0.45s both;
        }
        .brand-footer { animation: fadeSlideUp 0.5s ease 0.6s both; }
        .brand-version {
          font-size: 11px;
          letter-spacing: 0.12em;
          color: rgba(255,255,255,0.2);
          text-transform: uppercase;
          font-family: monospace;
        }

        /* ── Form panel ── */
        .form-panel {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 24px;
          flex: 0 0 100%;
        }
        @media (min-width: 900px) {
          .form-panel { flex: 0 0 480px; }
        }

        .form-card {
          width: 100%;
          max-width: 400px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 20px;
          padding: 40px 36px;
          box-shadow:
            0 0 0 1px rgba(179,0,0,0.06),
            0 8px 40px rgba(0,0,0,0.6),
            0 2px 8px rgba(0,0,0,0.4),
            inset 0 1px 0 rgba(255,255,255,0.05);
          animation: cardIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        .form-header {
          margin-bottom: 32px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .form-logo { margin-bottom: 8px; }
        .form-title {
          font-size: 26px;
          font-weight: 400;
          color: #fff;
          letter-spacing: -0.02em;
          font-family: var(--font-sans), sans-serif;
        }
        .form-desc {
          font-size: 13px;
          color: rgba(255,255,255,0.38);
          line-height: 1.5;
          font-family: var(--font-sans), sans-serif;
          font-style: italic;
        }

        /* ── Fields ── */
        .form-body { display: flex; flex-direction: column; gap: 20px; }
        .field { display: flex; flex-direction: column; gap: 6px; }
        .field-label {
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.5);
          font-family: monospace;
        }
        .field-input {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px;
          padding: 12px 16px;
          font-size: 14px;
          color: #fff;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
          font-family: var(--font-sans), sans-serif;
        }
        .field-input::placeholder { color: rgba(255,255,255,0.2); }
        .field-input:focus {
          border-color: rgba(179,0,0,0.6);
          background: rgba(179,0,0,0.05);
          box-shadow: 0 0 0 3px rgba(179,0,0,0.12), 0 2px 8px rgba(179,0,0,0.08);
        }
        .field-input:disabled { opacity: 0.5; cursor: not-allowed; }

        /* ── Error ── */
        .form-error {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: #ff6666;
          background: rgba(255,50,50,0.08);
          border: 1px solid rgba(255,50,50,0.15);
          border-radius: 8px;
          padding: 10px 14px;
          font-family: var(--font-sans), sans-serif;
          animation: shake 0.3s cubic-bezier(0.36, 0.07, 0.19, 0.97);
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }

        /* ── Submit ── */
        .submit-btn {
          margin-top: 4px;
          width: 100%;
          padding: 13px;
          background: #B30000;
          border: none;
          border-radius: 10px;
          color: #fff;
          font-size: 14px;
          font-weight: 600;
          letter-spacing: 0.04em;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-sans), sans-serif;
          box-shadow:
            0 4px 24px rgba(179,0,0,0.35),
            0 1px 4px rgba(0,0,0,0.3),
            inset 0 1px 0 rgba(255,255,255,0.1);
          transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
        }
        .submit-btn:hover:not(:disabled) {
          background: #cc0000;
          transform: translateY(-1px);
          box-shadow:
            0 6px 32px rgba(179,0,0,0.45),
            0 2px 8px rgba(0,0,0,0.3),
            inset 0 1px 0 rgba(255,255,255,0.12);
        }
        .submit-btn:active:not(:disabled) {
          transform: translateY(0);
          background: #990000;
        }
        .submit-btn:focus-visible {
          outline: 2px solid rgba(179,0,0,0.6);
          outline-offset: 2px;
        }
        .submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .btn-spinner {
          display: block;
          width: 18px; height: 18px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .form-foot {
          margin-top: 24px;
          text-align: center;
          font-size: 12px;
          color: rgba(255,255,255,0.2);
          font-style: italic;
          font-family: var(--font-sans), sans-serif;
        }
      `}</style>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
