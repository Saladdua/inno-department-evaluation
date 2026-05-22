"use client";

import { Suspense, useState, useTransition, useEffect, useRef } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

const LOGO_URL = process.env.NEXT_PUBLIC_COMPANY_LOGO_URL ?? "";

/* ── Kinetic grid ──────────────────────────────────────────── */
function KineticGrid() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const cv = canvas;
    const ctx = cv.getContext("2d")!;
    let animId: number;
    const mouse = { x: -9999, y: -9999, down: false };

    const COLS = 22, ROWS = 14;
    const SPRING = 0.055, DAMP = 0.74;
    const R = 240, STR = 1.35;

    interface Pt { hx: number; hy: number; x: number; y: number; vx: number; vy: number }
    interface RedDot { x: number; y: number; vx: number; vy: number; r: number; a: number }
    let pts: Pt[] = [];
    let reds: RedDot[] = [];

    function build(w: number, h: number) {
      pts = [];
      for (let r = 0; r <= ROWS; r++)
        for (let c = 0; c <= COLS; c++) {
          const hx = (c / COLS) * w, hy = (r / ROWS) * h;
          pts.push({ hx, hy, x: hx, y: hy, vx: 0, vy: 0 });
        }
    }

    function buildReds(w: number, h: number) {
      reds = Array.from({ length: 32 }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.55,
        vy: (Math.random() - 0.5) * 0.55,
        r: Math.random() * 2.2 + 0.7,
        a: Math.random() * 0.38 + 0.1,
      }));
    }

    function resize() {
      cv.width = window.innerWidth;
      cv.height = window.innerHeight;
      build(cv.width, cv.height);
      buildReds(cv.width, cv.height);
    }
    resize();

    const onMove  = (e: MouseEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    const onDown  = () => { mouse.down = true; };
    const onUp    = () => { mouse.down = false; };
    const onTouch = (e: TouchEvent) => {
      mouse.x = e.touches[0].clientX;
      mouse.y = e.touches[0].clientY;
      mouse.down = true;
    };
    const onTEnd = () => { mouse.down = false; };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup",   onUp);
    window.addEventListener("touchmove", onTouch, { passive: true });
    window.addEventListener("touchend",  onTEnd);
    window.addEventListener("resize",    resize);

    function tick() {
      ctx.clearRect(0, 0, cv.width, cv.height);

      // flying red particles
      ctx.save();
      for (const p of reds) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = cv.width;
        if (p.x > cv.width) p.x = 0;
        if (p.y < 0) p.y = cv.height;
        if (p.y > cv.height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.shadowBlur = 10;
        ctx.shadowColor = `rgba(179,0,0,${p.a * 0.7})`;
        ctx.fillStyle = `rgba(179,0,0,${p.a})`;
        ctx.fill();
      }
      ctx.restore();

      const str = mouse.down ? STR * 2.6 : STR;

      for (const p of pts) {
        const dx = mouse.x - p.x, dy = mouse.y - p.y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (d < R && d > 0) {
          const f = (1 - d / R) * str;
          p.vx += (dx / d) * f;
          p.vy += (dy / d) * f;
        }
        p.vx += (p.hx - p.x) * SPRING;
        p.vy += (p.hy - p.y) * SPRING;
        p.vx *= DAMP; p.vy *= DAMP;
        p.x  += p.vx; p.y  += p.vy;
      }

      const W = COLS + 1;
      ctx.lineWidth = 0.75;

      for (let r = 0; r <= ROWS; r++) {
        ctx.beginPath();
        for (let c = 0; c <= COLS; c++) {
          const p = pts[r * W + c];
          c === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = "rgba(0,0,0,0.07)";
        ctx.stroke();
      }
      for (let c = 0; c <= COLS; c++) {
        ctx.beginPath();
        for (let r = 0; r <= ROWS; r++) {
          const p = pts[r * W + c];
          r === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = "rgba(0,0,0,0.07)";
        ctx.stroke();
      }

      for (const p of pts) {
        const dx = p.x - p.hx, dy = p.y - p.hy;
        const disp = Math.sqrt(dx * dx + dy * dy);
        const a = 0.07 + Math.min(disp / 30, 0.48);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,0,0,${a})`;
        ctx.fill();
      }

      animId = requestAnimationFrame(tick);
    }
    tick();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup",   onUp);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("touchend",  onTEnd);
      window.removeEventListener("resize",    resize);
    };
  }, []);

  return <canvas ref={ref} className="kg-canvas" aria-hidden="true" />;
}

/* ── Login form ────────────────────────────────────────────── */
function LoginForm() {
  const searchParams   = useSearchParams();
  const callbackUrl    = searchParams.get("callbackUrl") ?? "/dashboard";
  const isAccessDenied = searchParams.get("error") === "AccessDenied";

  const isDev = process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN === "true";
  const [devEmail, setDevEmail] = useState("");
  const [isPending, start]      = useTransition();

  const signInGoogle = () => start(() => signIn("google", { callbackUrl }));
  const signInDev    = (e: React.FormEvent) => {
    e.preventDefault();
    if (!devEmail.trim()) return;
    start(() => signIn("dev-credentials", { email: devEmail.trim(), callbackUrl }));
  };

  return (
    <div className="login-root">
      <KineticGrid />

      <main className="login-shell">
        {/* ── Left panel ── */}
        <aside className="brand-panel">
          <div className="brand-vert" aria-hidden="true">INNO JSC</div>

          <div className="brand-top">
            <div className="brand-mark">
              {LOGO_URL
                ? <img src={LOGO_URL} alt="Logo" className="brand-logo" />
                : <><span className="brand-dot" /><span className="brand-name">INNO</span></>
              }
            </div>
          </div>

          <div className="brand-body">
            <p className="brand-eyebrow">Hệ thống nội bộ</p>
            <h1 className="brand-headline">
              Đánh giá<br />Phòng ban
            </h1>
            <div className="brand-rule" aria-hidden="true" />
            <p className="brand-sub">
              Nền tảng đánh giá nội bộ chuyên nghiệp<br />dành riêng cho doanh nghiệp.
            </p>

          </div>

        </aside>

        {/* ── Right panel ── */}
        <section className="form-panel">
          <div className="form-card">
            <header className="form-header">
              <h2 className="form-title">Đăng nhập</h2>
              <p className="form-desc">Sử dụng tài khoản Google công ty để tiếp tục.</p>
            </header>

            {isAccessDenied && (
              <div className="form-error" role="alert">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M8 5v3.5M8 11h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Email này chưa được cấp quyền truy cập. Vui lòng liên hệ quản trị viên.
              </div>
            )}

            <div className="form-body">
              <button className="google-btn" onClick={signInGoogle} disabled={isPending}>
                {isPending
                  ? <span className="btn-spinner" />
                  : <>
                      <svg width="18" height="18" viewBox="0 0 18 18">
                        <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
                        <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                        <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                      </svg>
                      Đăng nhập với Google
                    </>
                }
              </button>
            </div>

            {isDev && (
              <div className="dev-section">
                <div className="dev-divider"><span className="dev-divider-label">DEV ONLY</span></div>
                <form onSubmit={signInDev} className="dev-form">
                  <input
                    className="dev-input" type="email"
                    placeholder="Email tài khoản cần test…"
                    value={devEmail} onChange={e => setDevEmail(e.target.value)}
                    disabled={isPending}
                  />
                  <button type="submit" className="dev-btn" disabled={isPending || !devEmail.trim()}>
                    Vào
                  </button>
                </form>
              </div>
            )}

            <footer className="form-foot">
              Chỉ tài khoản được quản trị viên cấp phép mới có thể truy cập.
            </footer>
          </div>
        </section>
      </main>

      <style>{css}</style>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}

/* ── CSS ───────────────────────────────────────────────────── */
const css = `
@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Be+Vietnam+Pro:wght@300;400;500;600;700&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ── Root ── */
.login-root {
  position: relative; min-height: 100dvh;
  background: #F7F5F1;
  display: flex; align-items: stretch; overflow: hidden;
  font-family: 'Be Vietnam Pro', sans-serif;
}

/* ── Kinetic canvas ── */
.kg-canvas { position: fixed; inset: 0; z-index: 0; pointer-events: none; }

/* ── Shell ── */
.login-shell {
  position: relative; z-index: 1;
  display: flex; width: 100%; min-height: 100dvh;
}

/* ── Left — brand panel ── */
.brand-panel {
  display: none; flex-direction: column; justify-content: space-between;
  padding: 56px 60px 56px 72px;
  flex: 1; position: relative;
  background: linear-gradient(140deg, rgba(179,0,0,0.055) 0%, transparent 55%);
}
@media (min-width: 900px) { .brand-panel { display: flex; } }

/* rotated side label */
.brand-vert {
  position: absolute; left: 20px; top: 50%;
  transform: translateY(-50%) rotate(-90deg);
  font-size: 9px; font-weight: 600; letter-spacing: 0.22em;
  text-transform: uppercase; color: rgba(0,0,0,0.2);
  white-space: nowrap; user-select: none;
}

.brand-top { animation: fadeUp 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.05s both; }
.brand-logo { height: 60px; max-width: 260px; object-fit: contain; }
.brand-mark { display: flex; align-items: center; gap: 13px; }
.brand-dot {
  display: block; width: 14px; height: 14px; border-radius: 50%;
  background: #B30000;
  box-shadow: 0 0 12px rgba(179,0,0,0.65), 0 0 28px rgba(179,0,0,0.28);
}
.brand-name {
  font-size: 18px; font-weight: 700; letter-spacing: 0.28em;
  color: #0E0E0E; text-transform: uppercase;
}

/* body — vertically centred */
.brand-body {
  flex: 1; display: flex; flex-direction: column; justify-content: center;
  padding: 20px 0;
}

.brand-eyebrow {
  font-size: 11px; font-weight: 600; letter-spacing: 0.22em;
  text-transform: uppercase; color: #B30000;
  margin-bottom: 16px;
  animation: fadeUp 0.55s cubic-bezier(0.34,1.3,0.64,1) 0.18s both;
}

.brand-headline {
  font-family: 'DM Serif Display', Georgia, serif;
  font-size: clamp(48px, 5.8vw, 76px);
  font-weight: 400; line-height: 1.04;
  color: #0E0E0E; letter-spacing: -0.025em;
  animation: fadeUp 0.6s cubic-bezier(0.34,1.2,0.64,1) 0.26s both;
}

/* short red rule */
.brand-rule {
  width: 60px; height: 3px; background: #B30000; border-radius: 2px;
  margin: 28px 0 22px;
  box-shadow: 0 0 10px rgba(179,0,0,0.55);
  animation: ruleExpand 0.45s cubic-bezier(0.34,1.56,0.64,1) 0.48s both;
  transform-origin: left;
}
@keyframes ruleExpand { from { transform: scaleX(0); } to { transform: scaleX(1); } }

.brand-sub {
  font-size: 15px; line-height: 1.72; color: rgba(0,0,0,0.42);
  max-width: 360px;
  animation: fadeUp 0.5s ease 0.42s both;
}



/* ── Right — form panel ── */
.form-panel {
  display: flex; align-items: center; justify-content: center;
  padding: 40px 32px; flex: 0 0 100%;
}
@media (min-width: 900px) { .form-panel { flex: 0 0 530px; } }

.form-card {
  width: 100%; max-width: 450px;
  background: #fff;
  border: 1px solid rgba(0,0,0,0.08);
  border-top: 2px solid #B30000;
  border-radius: 22px; padding: 52px 48px;
  box-shadow:
    0 1px 3px rgba(0,0,0,0.04),
    0 6px 20px rgba(0,0,0,0.07),
    0 20px 48px rgba(0,0,0,0.06),
    0 -2px 16px rgba(179,0,0,0.06);
  animation: cardUp 0.5s cubic-bezier(0.34,1.4,0.64,1) 0.1s both;
}
@keyframes cardUp {
  from { opacity: 0; transform: translateY(22px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

.form-header { margin-bottom: 36px; }
.form-title {
  font-size: 30px; font-weight: 700;
  color: #0E0E0E; letter-spacing: -0.025em;
  margin-bottom: 8px;
}
.form-desc { font-size: 14px; color: rgba(0,0,0,0.42); line-height: 1.55; }

/* ── Error ── */
.form-error {
  display: flex; align-items: flex-start; gap: 8px;
  font-size: 13px; color: #B30000;
  background: rgba(179,0,0,0.05); border: 1px solid rgba(179,0,0,0.15);
  border-radius: 9px; padding: 11px 14px; margin-bottom: 20px;
  animation: shake 0.28s cubic-bezier(0.36,0.07,0.19,0.97);
}
@keyframes shake {
  0%,100% { transform: translateX(0); }
  20% { transform: translateX(-5px); } 60% { transform: translateX(5px); }
  40% { transform: translateX(-3px); } 80% { transform: translateX(3px); }
}

/* ── Google button ── */
.form-body { display: flex; flex-direction: column; }
.google-btn {
  width: 100%; padding: 14px 20px;
  display: flex; align-items: center; justify-content: center; gap: 10px;
  background: #0E0E0E; border: none; border-radius: 11px;
  color: #fff; font-size: 14px; font-weight: 600; letter-spacing: 0.01em;
  cursor: pointer; font-family: inherit;
  box-shadow: 0 2px 8px rgba(0,0,0,0.14);
  transition: background 0.14s, transform 0.12s, box-shadow 0.14s;
}
.google-btn:hover:not(:disabled) {
  background: #1c1c1c; transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(0,0,0,0.18);
}
.google-btn:active:not(:disabled) { transform: translateY(0); background: #111; }
.google-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-spinner {
  display: block; width: 18px; height: 18px;
  border: 2px solid rgba(255,255,255,0.25); border-top-color: #fff;
  border-radius: 50%; animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Dev login ── */
.dev-section { margin-top: 20px; }
.dev-divider { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.dev-divider::before, .dev-divider::after {
  content: ''; flex: 1; height: 1px; background: rgba(180,130,0,0.22);
}
.dev-divider-label {
  font-size: 10px; font-weight: 700; letter-spacing: 0.12em;
  color: rgba(140,90,0,0.55); font-family: monospace;
  padding: 2px 7px; border: 1px solid rgba(180,130,0,0.25); border-radius: 4px;
}
.dev-form { display: flex; gap: 8px; }
.dev-input {
  flex: 1; padding: 9px 12px;
  background: rgba(251,191,36,0.04); border: 1px solid rgba(180,130,0,0.2);
  border-radius: 8px; font-size: 13px; color: #0E0E0E;
  font-family: inherit; outline: none; transition: border-color 0.14s;
}
.dev-input::placeholder { color: rgba(0,0,0,0.25); }
.dev-input:focus { border-color: rgba(180,130,0,0.5); }
.dev-btn {
  padding: 9px 14px; border-radius: 8px;
  border: 1px solid rgba(180,130,0,0.3);
  background: rgba(251,191,36,0.08); color: rgba(100,65,0,0.85);
  font-size: 12px; font-weight: 600; font-family: inherit;
  cursor: pointer; white-space: nowrap; transition: background 0.14s;
}
.dev-btn:hover:not(:disabled) { background: rgba(251,191,36,0.16); }
.dev-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.form-foot {
  margin-top: 26px; text-align: center;
  font-size: 12px; color: rgba(0,0,0,0.28);
}

/* ── Shared fade-up ── */
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;
