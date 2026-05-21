"use client";

import { Suspense, useState, useTransition, useEffect, useRef } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

const LOGO_URL = process.env.NEXT_PUBLIC_COMPANY_LOGO_URL ?? "";

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const error = searchParams.get("error");
  const isAccessDenied = error === "AccessDenied";

  const isDev = process.env.NODE_ENV === 'development';
  const [devEmail, setDevEmail] = useState('');
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

  function handleGoogleSignIn() {
    startTransition(() => {
      signIn("google", { callbackUrl });
    });
  }

  function handleDevSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!devEmail.trim()) return;
    startTransition(() => {
      signIn("dev-credentials", { email: devEmail.trim(), callbackUrl });
    });
  }

  return (
    <div className="login-root">
      <canvas ref={canvasRef} className="particle-canvas" aria-hidden="true" />

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

        {/* Right panel — login */}
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
                Sử dụng tài khoản Google công ty để tiếp tục.
              </p>
            </header>

            {isAccessDenied && (
              <div className="form-error" role="alert">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="7" stroke="#ff4444" strokeWidth="1.5" />
                  <path d="M8 5v3.5M8 11h.01" stroke="#ff4444" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                Email này chưa được cấp quyền truy cập. Vui lòng liên hệ quản trị viên.
              </div>
            )}

            <div className="form-body">
              <button
                className="google-btn"
                onClick={handleGoogleSignIn}
                disabled={isPending}
              >
                {isPending ? (
                  <span className="btn-spinner" aria-label="Đang chuyển hướng…" />
                ) : (
                  <>
                    <svg className="google-icon" width="18" height="18" viewBox="0 0 18 18">
                      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
                      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                    </svg>
                    Đăng nhập với Google
                  </>
                )}
              </button>
            </div>

            {isDev && (
              <div className="dev-section">
                <div className="dev-divider">
                  <span className="dev-divider-label">DEV ONLY</span>
                </div>
                <form onSubmit={handleDevSignIn} className="dev-form">
                  <input
                    className="dev-input"
                    type="email"
                    placeholder="Email tài khoản cần test…"
                    value={devEmail}
                    onChange={e => setDevEmail(e.target.value)}
                    disabled={isPending}
                  />
                  <button type="submit" className="dev-btn" disabled={isPending || !devEmail.trim()}>
                    Đăng nhập
                  </button>
                </form>
              </div>
            )}

            <footer className="form-foot">
              <span>Chỉ tài khoản được quản trị viên cấp phép mới có thể truy cập.</span>
            </footer>
          </div>
        </section>
      </main>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .particle-canvas {
          position: fixed; inset: 0;
          pointer-events: none; z-index: 1;
        }

        .login-root {
          position: relative; min-height: 100dvh;
          background: #080808;
          display: flex; align-items: stretch; overflow: hidden;
          font-family: var(--font-sans), sans-serif;
        }

        /* ── Background ── */
        .bg-layer { position: fixed; inset: 0; pointer-events: none; z-index: 0; }
        .bg-orb { position: absolute; border-radius: 50%; filter: blur(120px); opacity: 0.18; }
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
        @keyframes drift1 { from { transform: translate(0,0) scale(1); } to { transform: translate(60px,80px) scale(1.1); } }
        @keyframes drift2 { from { transform: translate(0,0) scale(1); } to { transform: translate(-40px,-60px) scale(1.08); } }
        .bg-grid {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(179,0,0,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(179,0,0,0.04) 1px, transparent 1px);
          background-size: 48px 48px;
        }

        /* ── Shell ── */
        .login-shell { position: relative; z-index: 2; display: flex; width: 100%; min-height: 100dvh; }

        /* ── Brand panel ── */
        .brand-panel {
          display: none; flex-direction: column; justify-content: space-between;
          padding: 56px 52px; flex: 1;
          border-right: 1px solid rgba(179,0,0,0.12);
          background: linear-gradient(160deg, rgba(179,0,0,0.06) 0%, transparent 60%);
        }
        @media (min-width: 900px) { .brand-panel { display: flex; } }

        .brand-logo { height: 48px; max-width: 220px; object-fit: contain; }
        .brand-mark {
          display: flex; align-items: center; gap: 10px;
          animation: fadeSlideUp 0.7s cubic-bezier(0.34,1.56,0.64,1) 0.1s both;
        }
        @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
        .brand-dot { display: block; width: 10px; height: 10px; border-radius: 50%; background: #B30000; box-shadow: 0 0 12px rgba(179,0,0,0.8); }
        .brand-name { font-size: 15px; font-weight: 700; letter-spacing: 0.25em; color: #fff; text-transform: uppercase; }

        .brand-body { margin-top: auto; margin-bottom: auto; }
        .brand-headline {
          font-size: clamp(36px,4.5vw,64px); font-weight: 400; line-height: 1.1;
          color: #fff; letter-spacing: -0.02em;
          animation: fadeSlideUp 0.7s cubic-bezier(0.34,1.56,0.64,1) 0.25s both;
        }
        .brand-headline em {
          font-style: italic; color: #B30000;
          text-shadow: 0 0 40px rgba(179,0,0,0.4);
          animation: glowPulse 3s ease-in-out 1s infinite;
        }
        @keyframes glowPulse {
          0%,100% { text-shadow: 0 0 40px rgba(179,0,0,0.4); }
          50%      { text-shadow: 0 0 70px rgba(179,0,0,0.65), 0 0 20px rgba(255,80,80,0.3); }
        }
        .brand-sub {
          margin-top: 24px; font-size: 15px; line-height: 1.7;
          color: rgba(255,255,255,0.4); max-width: 320px; font-style: italic;
          animation: fadeSlideUp 0.6s ease 0.45s both;
        }
        .brand-footer { animation: fadeSlideUp 0.5s ease 0.6s both; }
        .brand-version { font-size: 11px; letter-spacing: 0.12em; color: rgba(255,255,255,0.2); text-transform: uppercase; font-family: monospace; }

        /* ── Form panel ── */
        .form-panel {
          display: flex; align-items: center; justify-content: center;
          padding: 32px 24px; flex: 0 0 100%;
        }
        @media (min-width: 900px) { .form-panel { flex: 0 0 480px; } }

        .form-card {
          width: 100%; max-width: 400px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
          border-radius: 20px; padding: 40px 36px;
          box-shadow:
            0 0 0 1px rgba(179,0,0,0.06),
            0 8px 40px rgba(0,0,0,0.6),
            0 2px 8px rgba(0,0,0,0.4),
            inset 0 1px 0 rgba(255,255,255,0.05);
          animation: cardIn 0.5s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        @keyframes cardIn { from { opacity: 0; transform: translateY(24px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }

        .form-header { margin-bottom: 32px; display: flex; flex-direction: column; gap: 8px; }
        .form-logo { margin-bottom: 8px; }
        .form-title { font-size: 26px; font-weight: 400; color: #fff; letter-spacing: -0.02em; }
        .form-desc { font-size: 13px; color: rgba(255,255,255,0.38); line-height: 1.5; font-style: italic; }

        /* ── Error ── */
        .form-error {
          display: flex; align-items: flex-start; gap: 8px;
          font-size: 13px; color: #ff6666;
          background: rgba(255,50,50,0.08); border: 1px solid rgba(255,50,50,0.15);
          border-radius: 8px; padding: 10px 14px; margin-bottom: 20px;
          animation: shake 0.3s cubic-bezier(0.36,0.07,0.19,0.97);
        }
        .form-error svg { flex-shrink: 0; margin-top: 1px; }
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }

        /* ── Google button ── */
        .form-body { display: flex; flex-direction: column; }
        .google-btn {
          width: 100%; padding: 13px 20px;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          background: #fff; border: none; border-radius: 10px;
          color: #1a1a1a; font-size: 14px; font-weight: 600; letter-spacing: 0.01em;
          cursor: pointer; font-family: inherit;
          box-shadow: 0 2px 12px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.3);
          transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
        }
        .google-btn:hover:not(:disabled) {
          background: #f5f5f5; transform: translateY(-1px);
          box-shadow: 0 6px 24px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.3);
        }
        .google-btn:active:not(:disabled) { transform: translateY(0); background: #ebebeb; }
        .google-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .google-icon { flex-shrink: 0; }

        .btn-spinner {
          display: block; width: 18px; height: 18px;
          border: 2px solid rgba(26,26,26,0.25); border-top-color: #1a1a1a;
          border-radius: 50%; animation: spin 0.6s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── Dev login ── */
        .dev-section { margin-top: 20px; }
        .dev-divider {
          display: flex; align-items: center; gap: 10px; margin-bottom: 12px;
        }
        .dev-divider::before, .dev-divider::after {
          content: ''; flex: 1; height: 1px;
          background: rgba(251,191,36,0.2);
        }
        .dev-divider-label {
          font-size: 10px; font-weight: 700; letter-spacing: 0.12em;
          color: rgba(251,191,36,0.5); font-family: monospace;
          padding: 2px 6px; border: 1px solid rgba(251,191,36,0.2);
          border-radius: 4px;
        }
        .dev-form { display: flex; gap: 8px; }
        .dev-input {
          flex: 1; padding: 9px 12px;
          background: rgba(251,191,36,0.05); border: 1px solid rgba(251,191,36,0.2);
          border-radius: 8px; font-size: 13px; color: rgba(255,255,255,0.7);
          font-family: inherit; outline: none;
          transition: border-color 0.15s;
        }
        .dev-input::placeholder { color: rgba(255,255,255,0.2); }
        .dev-input:focus { border-color: rgba(251,191,36,0.45); }
        .dev-btn {
          padding: 9px 14px; border-radius: 8px; border: 1px solid rgba(251,191,36,0.3);
          background: rgba(251,191,36,0.1); color: rgba(251,191,36,0.8);
          font-size: 12px; font-weight: 600; font-family: inherit;
          cursor: pointer; white-space: nowrap;
          transition: background 0.15s, color 0.15s;
        }
        .dev-btn:hover:not(:disabled) { background: rgba(251,191,36,0.18); color: #fbbf24; }
        .dev-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .form-foot {
          margin-top: 24px; text-align: center;
          font-size: 12px; color: rgba(255,255,255,0.2); font-style: italic;
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
