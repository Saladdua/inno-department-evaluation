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
  const searchParams = useSearchParams();
  const callbackUrl  = searchParams.get("callbackUrl") ?? "/dashboard";

  const isDev = process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN === "true";

  // ── State ──
  type Step = "email" | "otp";
  const [step,           setStep]           = useState<Step>("email");
  const [email,          setEmail]          = useState("");
  const [digits,         setDigits]         = useState(["", "", "", "", "", ""]);
  const [isLoading,      setIsLoading]      = useState(false);
  const [error,          setError]          = useState("");
  const [countdown,      setCountdown]      = useState(0);   // seconds until OTP expiry
  const [resendCooldown, setResendCooldown] = useState(0);   // seconds until resend allowed
  const digitRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Dev bypass
  const [devEmail,    setDevEmail]    = useState("");
  const [showDev,     setShowDev]     = useState(false);
  const [, startDev]                  = useTransition();

  // ── Timers ──
  useEffect(() => {
    if (step !== "otp" || countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [step, countdown]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const countdownStr = countdown > 0
    ? `${String(Math.floor(countdown / 60)).padStart(2, "0")}:${String(countdown % 60).padStart(2, "0")}`
    : "00:00";

  // ── Send OTP ──
  async function doSendOtp(targetEmail: string) {
    setIsLoading(true);
    setError("");
    try {
      const res  = await fetch("/api/auth/send-otp", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: targetEmail }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Đã có lỗi xảy ra."); return; }
      setStep("otp");
      setDigits(["", "", "", "", "", ""]);
      setCountdown(600);
      setResendCooldown(60);
      setTimeout(() => digitRefs.current[0]?.focus(), 60);
    } catch {
      setError("Không thể kết nối máy chủ. Vui lòng thử lại.");
    } finally {
      setIsLoading(false);
    }
  }

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const em = email.toLowerCase().trim();
    if (!em) return;
    doSendOtp(em);
  };

  const handleResend = () => {
    if (resendCooldown > 0 || isLoading) return;
    doSendOtp(email.toLowerCase().trim());
  };

  // ── Digit inputs ──
  const handleDigitChange = (idx: number, val: string) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next  = [...digits];
    next[idx]   = digit;
    setDigits(next);
    if (digit && idx < 5) digitRefs.current[idx + 1]?.focus();
  };

  const handleDigitKey = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      digitRefs.current[idx - 1]?.focus();
    }
    if (e.key === "ArrowLeft"  && idx > 0) digitRefs.current[idx - 1]?.focus();
    if (e.key === "ArrowRight" && idx < 5) digitRefs.current[idx + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const next = Array.from({ length: 6 }, (_, i) => text[i] ?? "");
    setDigits(next);
    const focusIdx = Math.min(text.length, 5);
    digitRefs.current[focusIdx]?.focus();
  };

  // ── Verify OTP ──
  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = digits.join("");
    if (code.length !== 6) return;
    setIsLoading(true);
    setError("");
    const result = await signIn("otp-credentials", { email, code, redirect: false });
    setIsLoading(false);
    if (result?.ok) {
      window.location.href = callbackUrl;
    } else {
      setError("Mã OTP không đúng hoặc đã hết hạn.");
      setDigits(["", "", "", "", "", ""]);
      setTimeout(() => digitRefs.current[0]?.focus(), 30);
    }
  };

  const signInDev = (e: React.FormEvent) => {
    e.preventDefault();
    if (!devEmail.trim()) return;
    startDev(() => { void signIn("dev-credentials", { email: devEmail.trim(), callbackUrl }); });
  };

  // ── Render ──
  return (
    <div className="login-root">
      <KineticGrid />

      <main className="login-shell">
        {/* ── Left panel ── */}
        <aside className="brand-panel">
          <button type="button" className="brand-vert" onClick={() => setShowDev(s => !s)} aria-hidden="true" tabIndex={-1}>INNO JSC</button>

          <div className="brand-top">
            <div className="brand-mark">
              {LOGO_URL
                ? <img src={LOGO_URL} alt="Logo" className="brand-logo" />
                : <><span className="brand-dot" /><span className="brand-name">INNO</span></>
              }
            </div>
          </div>

          <div className="brand-body">
            <p className="brand-eyebrow">Hệ thống</p>
            <h1 className="brand-headline">
              Đánh giá<br />Phòng ban
            </h1>
            <div className="brand-rule" aria-hidden="true" />
          </div>
        </aside>

        {/* ── Right panel ── */}
        <section className="form-panel">
          <div className="form-card">

            {/* ── Step: email ── */}
            {step === "email" && (
              <>
                <header className="form-header">
                  <h2 className="form-title">Đăng nhập</h2>
                  <p className="form-desc">Nhập email công ty để nhận mã xác thực.</p>
                </header>

                {error && (
                  <div className="form-error" role="alert">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M8 5v3.5M8 11h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    {error}
                  </div>
                )}

                <form onSubmit={handleEmailSubmit} className="form-body">
                  <label className="field-label" htmlFor="email-input">Email</label>
                  <input
                    id="email-input"
                    className="text-input"
                    type="email"
                    placeholder="ten@innojsc.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    disabled={isLoading}
                    autoComplete="email"
                    autoFocus
                    required
                  />
                  <button
                    type="submit"
                    className="primary-btn"
                    disabled={isLoading || !email.trim()}
                  >
                    {isLoading
                      ? <span className="btn-spinner" />
                      : <>
                          Gửi mã OTP
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ marginLeft: 4 }}>
                            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </>
                    }
                  </button>
                </form>

                {isDev && showDev && (
                  <div className="dev-section">
                    <div className="dev-divider"><span className="dev-divider-label">DEV ONLY</span></div>
                    <form onSubmit={signInDev} className="dev-form">
                      <input
                        className="dev-input" type="email"
                        placeholder="Email tài khoản cần test…"
                        value={devEmail} onChange={e => setDevEmail(e.target.value)}
                        disabled={isLoading}
                      />
                      <button type="submit" className="dev-btn" disabled={isLoading || !devEmail.trim()}>
                        Vào
                      </button>
                    </form>
                  </div>
                )}

              </>
            )}

            {/* ── Step: OTP ── */}
            {step === "otp" && (
              <>
                <header className="form-header">
                  <h2 className="form-title">Xác nhận OTP</h2>
                  <p className="form-desc">
                    Mã 6 chữ số đã được gửi tới<br />
                    <strong style={{ color: "#0E0E0E" }}>{email}</strong>
                  </p>
                </header>

                {error && (
                  <div className="form-error" role="alert">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M8 5v3.5M8 11h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    {error}
                  </div>
                )}

                <form onSubmit={handleOtpSubmit} className="form-body">
                  <div className="digit-row" onPaste={handlePaste}>
                    {digits.map((d, i) => (
                      <input
                        key={i}
                        ref={el => { digitRefs.current[i] = el; }}
                        className={`digit-input${d ? " digit-filled" : ""}`}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={d}
                        onChange={e => handleDigitChange(i, e.target.value)}
                        onKeyDown={e => handleDigitKey(i, e)}
                        disabled={isLoading}
                        aria-label={`Chữ số ${i + 1}`}
                        autoComplete="one-time-code"
                      />
                    ))}
                  </div>

                  <div className="otp-meta">
                    <span className={`countdown${countdown <= 60 ? " countdown-warn" : ""}`}>
                      {countdown > 0
                        ? <>Mã hết hạn sau <strong>{countdownStr}</strong></>
                        : <span style={{ color: "#B30000" }}>Mã đã hết hạn</span>
                      }
                    </span>
                    <button
                      type="button"
                      className="resend-btn"
                      onClick={handleResend}
                      disabled={resendCooldown > 0 || isLoading}
                    >
                      {resendCooldown > 0 ? `Gửi lại (${resendCooldown}s)` : "Gửi lại mã"}
                    </button>
                  </div>

                  <button
                    type="submit"
                    className="primary-btn"
                    disabled={isLoading || digits.join("").length !== 6 || countdown === 0}
                  >
                    {isLoading ? <span className="btn-spinner" /> : "Xác nhận"}
                  </button>
                </form>

                <button className="back-btn" onClick={() => { setStep("email"); setError(""); }} disabled={isLoading}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M13 8H3M7 4L3 8l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Quay lại
                </button>
              </>
            )}

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
  border: none; background: transparent; padding: 0; cursor: default;
  font-family: inherit;
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
  font-size: 16px; font-weight: 600; letter-spacing: 0.22em;
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
  position: relative;
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

.form-header { margin-bottom: 32px; }
.form-title {
  font-size: 30px; font-weight: 700;
  color: #0E0E0E; letter-spacing: -0.025em;
  margin-bottom: 8px;
}
.form-desc { font-size: 14px; color: rgba(0,0,0,0.42); line-height: 1.6; }

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

/* ── Form body ── */
.form-body { display: flex; flex-direction: column; gap: 14px; }

.field-label {
  font-size: 12px; font-weight: 600; letter-spacing: 0.06em;
  text-transform: uppercase; color: rgba(0,0,0,0.45);
  margin-bottom: -6px;
}

.text-input {
  width: 100%; padding: 13px 16px;
  background: #fafafa; border: 1.5px solid rgba(0,0,0,0.12);
  border-radius: 11px; font-size: 15px; color: #0E0E0E;
  font-family: inherit; outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.text-input::placeholder { color: rgba(0,0,0,0.22); }
.text-input:focus {
  border-color: #B30000;
  box-shadow: 0 0 0 3px rgba(179,0,0,0.08);
}
.text-input:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Primary button ── */
.primary-btn {
  width: 100%; padding: 14px 20px; margin-top: 4px;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  background: #0E0E0E; border: none; border-radius: 11px;
  color: #fff; font-size: 14px; font-weight: 600; letter-spacing: 0.01em;
  cursor: pointer; font-family: inherit;
  box-shadow: 0 2px 8px rgba(0,0,0,0.14);
  transition: background 0.14s, transform 0.12s, box-shadow 0.14s;
}
.primary-btn:hover:not(:disabled) {
  background: #1c1c1c; transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(0,0,0,0.18);
}
.primary-btn:active:not(:disabled) { transform: translateY(0); background: #111; }
.primary-btn:disabled { opacity: 0.45; cursor: not-allowed; }

.btn-spinner {
  display: block; width: 18px; height: 18px;
  border: 2px solid rgba(255,255,255,0.25); border-top-color: #fff;
  border-radius: 50%; animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── OTP digit row ── */
.digit-row {
  display: flex; gap: 10px; justify-content: center;
  margin: 4px 0 2px;
}
.digit-input {
  width: 52px; height: 60px;
  text-align: center; font-size: 26px; font-weight: 700; color: #0E0E0E;
  background: #fafafa; border: 1.5px solid rgba(0,0,0,0.12);
  border-radius: 11px; outline: none; caret-color: #B30000;
  font-family: 'Be Vietnam Pro', monospace;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.1s;
}
.digit-input:focus {
  border-color: #B30000;
  box-shadow: 0 0 0 3px rgba(179,0,0,0.08);
  transform: translateY(-1px);
}
.digit-input.digit-filled { border-color: rgba(0,0,0,0.22); background: #fff; }
.digit-input:disabled { opacity: 0.45; cursor: not-allowed; }

/* ── OTP meta row ── */
.otp-meta {
  display: flex; align-items: center; justify-content: space-between;
  margin: 2px 0;
}
.countdown {
  font-size: 12.5px; color: rgba(0,0,0,0.38);
}
.countdown strong { color: rgba(0,0,0,0.6); }
.countdown-warn strong { color: #B30000; }

.resend-btn {
  font-size: 12.5px; font-weight: 600; color: #B30000;
  background: none; border: none; cursor: pointer;
  padding: 2px 0; font-family: inherit;
  text-decoration: underline; text-underline-offset: 2px;
  transition: opacity 0.14s;
}
.resend-btn:disabled { opacity: 0.35; cursor: default; text-decoration: none; }

/* ── Back button ── */
.back-btn {
  display: flex; align-items: center; gap: 6px;
  margin-top: 20px; padding: 0;
  background: none; border: none; cursor: pointer;
  font-size: 13px; font-weight: 500; color: rgba(0,0,0,0.4);
  font-family: inherit;
  transition: color 0.14s;
}
.back-btn:hover:not(:disabled) { color: rgba(0,0,0,0.7); }
.back-btn:disabled { opacity: 0.4; cursor: not-allowed; }

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


/* ── Shared fade-up ── */
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;
