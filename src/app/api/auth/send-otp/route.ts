import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   Number(process.env.SMTP_PORT ?? 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

const FROM = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? 'noreply@innojsc.com'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const email = typeof body?.email === 'string' ? body.email.toLowerCase().trim() : ''
  if (!email) return NextResponse.json({ error: 'Email không hợp lệ.' }, { status: 400 })

  const supabase = createServiceClient()

  // Check email exists in system
  const { data: user } = await supabase
    .from('users')
    .select('id, name')
    .eq('email', email)
    .maybeSingle()
  if (!user) {
    return NextResponse.json({ error: 'Email này không có trong hệ thống.' }, { status: 404 })
  }

  // Rate-limit: 1 request per 60 s per email
  const cooldownSince = new Date(Date.now() - 60_000).toISOString()
  const { data: recent } = await supabase
    .from('otp_codes')
    .select('created_at')
    .eq('email', email)
    .eq('used', false)
    .gt('created_at', cooldownSince)
    .limit(1)
    .maybeSingle()

  if (recent) {
    const waitSecs = Math.ceil(
      (new Date(recent.created_at).getTime() + 60_000 - Date.now()) / 1000,
    )
    return NextResponse.json(
      { error: `Vui lòng chờ ${waitSecs} giây trước khi gửi lại.` },
      { status: 429 },
    )
  }

  // Generate 6-digit code, expire in 10 min
  const code      = String(Math.floor(100_000 + Math.random() * 900_000))
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString()

  const { error: dbErr } = await supabase
    .from('otp_codes')
    .insert({ email, code, expires_at: expiresAt })
  if (dbErr) return NextResponse.json({ error: 'Lỗi hệ thống.' }, { status: 500 })

  // Dev fallback: log to console when SMTP is not configured
  if (!process.env.SMTP_HOST) {
    console.log(`\n[OTP] ${email} → ${code}\n`)
    return NextResponse.json({ success: true })
  }

  try {
    await transporter.sendMail({
      from:    `"INNO JSC" <${FROM}>`,
      to:      email,
      subject: `${code} — Mã đăng nhập INNO JSC`,
      html: `
<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08)">
        <tr>
          <td style="background:#B30000;padding:24px 40px">
            <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.7)">INNO JSC</p>
            <p style="margin:4px 0 0;font-size:18px;font-weight:700;color:#ffffff">Hệ thống Đánh giá Phòng ban</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px 28px">
            <p style="margin:0 0 8px;font-size:14px;color:#555">Xin chào <strong style="color:#111">${user.name}</strong>,</p>
            <p style="margin:0 0 28px;font-size:14px;color:#555;line-height:1.6">
              Mã OTP đăng nhập của bạn là:
            </p>
            <div style="text-align:center;padding:20px;background:#f8f8f8;border-radius:10px;border:1px solid #eee;margin-bottom:28px">
              <span style="font-size:44px;font-weight:700;letter-spacing:18px;color:#0E0E0E;font-family:monospace">${code}</span>
            </div>
            <p style="margin:0 0 6px;font-size:13px;color:#888;line-height:1.6">
              Mã có hiệu lực trong <strong style="color:#555">10 phút</strong>.
            </p>
            <p style="margin:0;font-size:13px;color:#aaa;line-height:1.6">
              Nếu bạn không yêu cầu mã này, hãy bỏ qua email này.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 40px 24px;border-top:1px solid #f0f0f0">
            <p style="margin:0;font-size:11px;color:#bbb">INNO JSC · Hệ thống nội bộ</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    })
  } catch (err) {
    console.error('[send-otp] SMTP error:', err)
    return NextResponse.json({ error: 'Không thể gửi email. Vui lòng thử lại.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
