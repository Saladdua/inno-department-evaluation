'use client'

import { useState, useTransition } from 'react'
import { Flag, X, Check, AlertTriangle, Clock, Inbox } from 'lucide-react'

export interface Report {
  id: string
  reason: string | null
  created_at: string
  reporter_dept_id: string
  notification_id: string
  reporter: { id: string; name: string; code: string | null } | null
  notification: { id: string; data: Record<string, string> } | null
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'Vừa xong'
  if (m < 60) return `${m} phút trước`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} giờ trước`
  const d = Math.floor(h / 24)
  return `${d} ngày trước`
}

export default function ReportsClient({ initialReports }: { initialReports: Report[] }) {
  const [reports, setReports] = useState<Report[]>(initialReports)
  const [pending, startTransition] = useTransition()
  const [actingId, setActingId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<{ id: string; action: 'dismiss' | 'approve' } | null>(null)

  function act(id: string, action: 'dismiss' | 'approve') {
    setActingId(id)
    setConfirmId(null)
    startTransition(async () => {
      const res = await fetch('/api/reports', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })
      if (res.ok) {
        setReports(prev => prev.filter(r => r.id !== id))
      }
      setActingId(null)
    })
  }

  return (
    <div className="rp-root">
      <div className="rp-page-header">
        <div className="rp-page-title-wrap">
          <Flag size={18} className="rp-page-icon" />
          <h1 className="rp-page-title">Báo cáo từ phòng ban</h1>
        </div>
        <span className="rp-count-badge">{reports.length} báo cáo</span>
      </div>

      {reports.length === 0 ? (
        <div className="rp-empty">
          <Inbox size={32} className="rp-empty-icon" />
          <span className="rp-empty-text">Không có báo cáo nào</span>
          <span className="rp-empty-sub">Khi phòng ban gửi báo cáo về lựa chọn đánh giá, chúng sẽ hiện ở đây.</span>
        </div>
      ) : (
        <div className="rp-list">
          {reports.map(report => {
            const evaluatorName = report.notification?.data?.evaluator_dept_name ?? 'Không rõ'
            const reporterName = report.reporter?.name ?? 'Không rõ'
            const reporterCode = report.reporter?.code
            const isActing = actingId === report.id && pending
            const isConfirming = confirmId?.id === report.id

            return (
              <div key={report.id} className={`rp-card ${isActing ? 'rp-card--acting' : ''}`}>
                <div className="rp-card-top">
                  <div className="rp-card-who">
                    <AlertTriangle size={13} className="rp-alert-icon" />
                    <span className="rp-reporter">
                      {reporterCode ? (
                        <><strong>{reporterCode}</strong> · {reporterName}</>
                      ) : (
                        <strong>{reporterName}</strong>
                      )}
                    </span>
                    <span className="rp-arrow">báo cáo việc</span>
                    <span className="rp-evaluator">{evaluatorName}</span>
                    <span className="rp-arrow">chọn họ để đánh giá</span>
                  </div>
                  <div className="rp-card-meta">
                    <Clock size={11} className="rp-clock" />
                    <span className="rp-time">{timeAgo(report.created_at)}</span>
                  </div>
                </div>

                {report.reason && (
                  <div className="rp-reason-wrap">
                    <span className="rp-reason-label">Lý do:</span>
                    <p className="rp-reason">{report.reason}</p>
                  </div>
                )}

                <div className="rp-card-actions">
                  {isConfirming ? (
                    <>
                      <span className="rp-confirm-text">
                        {confirmId.action === 'approve'
                          ? 'Xác nhận xoá khỏi ma trận và đóng báo cáo?'
                          : 'Đóng báo cáo mà không thay đổi ma trận?'}
                      </span>
                      <button
                        className="rp-btn rp-btn--confirm"
                        disabled={isActing}
                        onClick={() => act(confirmId.id, confirmId.action)}
                      >
                        Xác nhận
                      </button>
                      <button
                        className="rp-btn rp-btn--ghost"
                        onClick={() => setConfirmId(null)}
                      >
                        Huỷ
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="rp-btn rp-btn--approve"
                        disabled={isActing}
                        title="Xoá khỏi ma trận và đóng báo cáo"
                        onClick={() => setConfirmId({ id: report.id, action: 'approve' })}
                      >
                        <Check size={13} />
                        Xoá khỏi ma trận
                      </button>
                      <button
                        className="rp-btn rp-btn--dismiss"
                        disabled={isActing}
                        title="Đóng báo cáo, giữ nguyên ma trận"
                        onClick={() => setConfirmId({ id: report.id, action: 'dismiss' })}
                      >
                        <X size={13} />
                        Bỏ qua
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <style>{`
        .rp-root {
          display: flex; flex-direction: column; gap: 24px;
          font-family: var(--font-sans), sans-serif;
          max-width: 820px;
        }

        .rp-page-header {
          display: flex; align-items: center; justify-content: space-between;
          animation: rpFade 0.35s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        @keyframes rpFade { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }

        .rp-page-title-wrap { display: flex; align-items: center; gap: 10px; }
        .rp-page-icon { color: #B30000; }
        .rp-page-title { font-size: 15px; font-weight: 700; color: rgba(255,255,255,0.85); letter-spacing: 0.01em; }
        .rp-count-badge {
          font-size: 11px; padding: 3px 10px; border-radius: 20px;
          background: rgba(179,0,0,0.08); border: 1px solid rgba(179,0,0,0.18);
          color: rgba(255,120,100,0.8);
        }

        .rp-empty {
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          padding: 80px 0; color: rgba(255,255,255,0.2);
          animation: rpFade 0.4s 0.05s both;
        }
        .rp-empty-icon { opacity: 0.3; }
        .rp-empty-text { font-size: 14px; font-weight: 600; }
        .rp-empty-sub { font-size: 12px; color: rgba(255,255,255,0.15); text-align: center; max-width: 340px; }

        .rp-list { display: flex; flex-direction: column; gap: 12px; }

        .rp-card {
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06);
          border-radius: 12px; padding: 18px 20px;
          display: flex; flex-direction: column; gap: 14px;
          transition: opacity 0.2s;
          animation: rpFade 0.4s both;
        }
        .rp-card--acting { opacity: 0.5; pointer-events: none; }

        .rp-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
        .rp-card-who { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; flex: 1; }
        .rp-alert-icon { color: rgba(255,180,50,0.7); flex-shrink: 0; }
        .rp-reporter { font-size: 13px; color: rgba(255,255,255,0.85); }
        .rp-reporter strong { color: #fff; }
        .rp-arrow { font-size: 12px; color: rgba(255,255,255,0.3); font-style: italic; }
        .rp-evaluator { font-size: 13px; font-weight: 600; color: rgba(179,0,0,0.9); }

        .rp-card-meta { display: flex; align-items: center; gap: 5px; flex-shrink: 0; }
        .rp-clock { color: rgba(255,255,255,0.2); }
        .rp-time { font-size: 11px; color: rgba(255,255,255,0.25); white-space: nowrap; }

        .rp-reason-wrap {
          background: rgba(255,255,255,0.03); border-left: 3px solid rgba(255,180,50,0.3);
          border-radius: 0 8px 8px 0; padding: 10px 14px;
          display: flex; flex-direction: column; gap: 4px;
        }
        .rp-reason-label { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.25); }
        .rp-reason { font-size: 13px; color: rgba(255,255,255,0.65); line-height: 1.55; margin: 0; }

        .rp-card-actions { display: flex; align-items: center; gap: 8px; }
        .rp-confirm-text { font-size: 12px; color: rgba(255,200,100,0.8); font-style: italic; flex: 1; }

        .rp-btn {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 6px 14px; border-radius: 8px; border: none;
          font-size: 12px; cursor: pointer; font-family: var(--font-sans), sans-serif;
          transition: background 0.15s, transform 0.1s;
        }
        .rp-btn:hover:not(:disabled) { transform: translateY(-1px); }
        .rp-btn:disabled { opacity: 0.45; cursor: not-allowed; }

        .rp-btn--approve {
          background: rgba(40,180,80,0.12); color: rgba(80,220,120,0.9);
          border: 1px solid rgba(40,180,80,0.2);
        }
        .rp-btn--approve:hover:not(:disabled) { background: rgba(40,180,80,0.2); }

        .rp-btn--dismiss {
          background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.4);
          border: 1px solid rgba(255,255,255,0.08);
        }
        .rp-btn--dismiss:hover:not(:disabled) { background: rgba(255,255,255,0.09); color: rgba(255,255,255,0.6); }

        .rp-btn--confirm {
          background: rgba(179,0,0,0.15); color: rgba(255,100,80,0.9);
          border: 1px solid rgba(179,0,0,0.25);
        }
        .rp-btn--confirm:hover:not(:disabled) { background: rgba(179,0,0,0.25); }

        .rp-btn--ghost {
          background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.35);
          border: 1px solid rgba(255,255,255,0.07);
        }
        .rp-btn--ghost:hover:not(:disabled) { background: rgba(255,255,255,0.08); }

        /* Light mode */
        [data-theme="light"] .rp-page-title { color: rgba(0,0,0,0.85); }
        [data-theme="light"] .rp-count-badge { background: rgba(179,0,0,0.07); color: #B30000; }
        [data-theme="light"] .rp-empty { color: rgba(0,0,0,0.25); }
        [data-theme="light"] .rp-empty-sub { color: rgba(0,0,0,0.2); }
        [data-theme="light"] .rp-card { background: #fff; border-color: rgba(0,0,0,0.08); }
        [data-theme="light"] .rp-reporter { color: rgba(0,0,0,0.8); }
        [data-theme="light"] .rp-reporter strong { color: #000; }
        [data-theme="light"] .rp-arrow { color: rgba(0,0,0,0.35); }
        [data-theme="light"] .rp-time { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .rp-reason-wrap { background: rgba(0,0,0,0.03); }
        [data-theme="light"] .rp-reason-label { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .rp-reason { color: rgba(0,0,0,0.65); }
        [data-theme="light"] .rp-confirm-text { color: rgba(180,100,0,0.8); }
        [data-theme="light"] .rp-btn--dismiss { background: rgba(0,0,0,0.04); color: rgba(0,0,0,0.45); border-color: rgba(0,0,0,0.09); }
        [data-theme="light"] .rp-btn--dismiss:hover:not(:disabled) { background: rgba(0,0,0,0.08); color: rgba(0,0,0,0.65); }
        [data-theme="light"] .rp-btn--ghost { background: rgba(0,0,0,0.04); color: rgba(0,0,0,0.4); border-color: rgba(0,0,0,0.08); }
      `}</style>
    </div>
  )
}
