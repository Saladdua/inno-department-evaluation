'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Bell, X, AlertTriangle, CheckCircle2, CalendarClock, CalendarCheck, Flag, ShieldCheck } from 'lucide-react'

interface Notification {
  id: string
  type: 'chosen_for_evaluation' | 'evaluation_submitted' | 'period_started' | 'period_ended' | 'report_submitted' | 'report_resolved'
  recipient_dept_id: string | null
  data: Record<string, string>
  is_read: boolean
  created_at: string
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'vừa xong'
  if (m < 60) return `${m} phút trước`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} giờ trước`
  return `${Math.floor(h / 24)} ngày trước`
}

function NotifIcon({ type }: { type: Notification['type'] }) {
  if (type === 'chosen_for_evaluation') return <AlertTriangle size={14} />
  if (type === 'evaluation_submitted')  return <CheckCircle2  size={14} />
  if (type === 'period_started')        return <CalendarClock size={14} />
  if (type === 'period_ended')          return <CalendarCheck size={14} />
  if (type === 'report_submitted')      return <Flag          size={14} />
  if (type === 'report_resolved')       return <ShieldCheck   size={14} />
  return <Bell size={14} />
}

function notifTitle(n: Notification): string {
  const d = n.data
  if (n.type === 'chosen_for_evaluation')
    return `${d.evaluator_dept_name ?? 'Phòng ban khác'} đã chọn bạn để đánh giá`
  if (n.type === 'evaluation_submitted')
    return `Bạn vừa được đánh giá bởi ${d.evaluator_dept_name ?? 'một phòng ban'}`
  if (n.type === 'period_started')
    return `Kỳ đánh giá ${d.period_label ?? ''} đã bắt đầu`
  if (n.type === 'period_ended')
    return `Kỳ đánh giá ${d.period_label ?? ''} đã kết thúc`
  if (n.type === 'report_submitted')
    return `Báo cáo từ ${d.reporter_dept_name ?? 'một phòng ban'} về ${d.evaluator_dept_name ?? '—'}`
  if (n.type === 'report_resolved') {
    if (d.role === 'reporter') {
      return d.action === 'approve'
        ? `Báo cáo của bạn được chấp thuận — lựa chọn của ${d.evaluator_dept_name ?? 'phòng kia'} đã bị gỡ`
        : `Báo cáo của bạn đã được đóng bởi quản trị`
    }
    return d.action === 'approve'
      ? `Lựa chọn đánh giá của bạn đối với ${d.reporter_dept_name ?? 'một phòng ban'} đã bị gỡ`
      : `Báo cáo từ ${d.reporter_dept_name ?? 'một phòng ban'} về lựa chọn của bạn đã được đóng`
  }
  return 'Thông báo'
}

// Destination URL when a notification is clicked
function notifHref(n: Notification): string | null {
  if (n.type === 'chosen_for_evaluation') return '/dashboard/matrix'
  if (n.type === 'evaluation_submitted')  return '/dashboard/results'
  if (n.type === 'report_submitted')      return '/dashboard/reports'
  if (n.type === 'report_resolved')       return '/dashboard/matrix'
  if (n.type === 'period_started')        return '/dashboard/status'
  if (n.type === 'period_ended')          return '/dashboard/status'
  return null
}

export default function NotificationBell({ deptId }: { deptId: string | null }) {
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [popupStyle, setPopupStyle] = useState({ top: 0, right: 0 })
  const [reportingId, setReportingId] = useState<string | null>(null)
  const [reportReason, setReportReason] = useState('')
  const [reportStatus, setReportStatus] = useState<Record<string, 'pending' | 'done' | 'error'>>({})
  const bellRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter(n => !n.is_read).length

  useEffect(() => { setMounted(true) }, [])

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications')
      if (res.ok) setNotifications(await res.json())
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchNotifications()
    const id = setInterval(fetchNotifications, 30000)
    return () => clearInterval(id)
  }, [fetchNotifications])

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (
        popupRef.current && !popupRef.current.contains(e.target as Node) &&
        bellRef.current  && !bellRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  function handleBellClick() {
    if (!open && bellRef.current) {
      const rect = bellRef.current.getBoundingClientRect()
      setPopupStyle({ top: rect.bottom + 8, right: window.innerWidth - rect.right })
    }
    setOpen(o => !o)
    if (!open && unreadCount > 0) setTimeout(markAllRead, 1500)
  }

  async function markAllRead() {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    })
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  async function markRead(id: string) {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    })
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
  }

  function handleItemClick(n: Notification) {
    if (!n.is_read) markRead(n.id)
    const href = notifHref(n)
    if (href) {
      setOpen(false)
      router.push(href)
    }
  }

  async function submitReport(notifId: string) {
    setReportStatus(s => ({ ...s, [notifId]: 'pending' }))
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_id: notifId, reason: reportReason }),
      })
      if (res.ok) {
        setReportStatus(s => ({ ...s, [notifId]: 'done' }))
        setReportingId(null)
        setReportReason('')
        markRead(notifId)
      } else {
        setReportStatus(s => ({ ...s, [notifId]: 'error' }))
      }
    } catch {
      setReportStatus(s => ({ ...s, [notifId]: 'error' }))
    }
  }

  const popup = (
    <div
      ref={popupRef}
      className="nb-popup"
      style={{ position: 'fixed', top: popupStyle.top, right: popupStyle.right, zIndex: 9999 }}
    >
      <div className="nb-popup-header">
        <span className="nb-popup-title">Thông báo</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {unreadCount > 0 && (
            <button className="nb-mark-all" onClick={markAllRead}>Đọc tất cả</button>
          )}
          <button className="nb-close" onClick={() => setOpen(false)}>
            <X size={13} />
          </button>
        </div>
      </div>

      <div className="nb-list">
        {notifications.length === 0 ? (
          <div className="nb-empty">Không có thông báo</div>
        ) : notifications.map(n => {
          const href = notifHref(n)
          return (
            <div
              key={n.id}
              className={`nb-item ${!n.is_read ? 'nb-item--unread' : ''} ${href ? 'nb-item--nav' : ''}`}
              onClick={() => handleItemClick(n)}
            >
              <div className={`nb-item-icon nb-icon--${n.type}`}>
                <NotifIcon type={n.type} />
              </div>
              <div className="nb-item-body">
                <p className="nb-item-text">{notifTitle(n)}</p>
                <span className="nb-item-time">{timeAgo(n.created_at)}</span>
                {href && (
                  <span className="nb-item-cta">
                    {n.type === 'chosen_for_evaluation' && 'Xem ma trận →'}
                    {n.type === 'evaluation_submitted'  && 'Xem kết quả →'}
                    {n.type === 'report_submitted'      && 'Xem báo cáo →'}
                    {n.type === 'report_resolved'       && 'Xem ma trận →'}
                    {(n.type === 'period_started' || n.type === 'period_ended') && 'Xem tình trạng →'}
                  </span>
                )}

                {n.type === 'chosen_for_evaluation' && deptId && (
                  <div className="nb-report-wrap" onClick={e => e.stopPropagation()}>
                    {reportStatus[n.id] === 'done' ? (
                      <span className="nb-report-done">Đã gửi báo cáo</span>
                    ) : reportingId === n.id ? (
                      <div className="nb-report-form">
                        <textarea
                          className="nb-report-input"
                          placeholder="Lý do báo cáo..."
                          value={reportReason}
                          onChange={e => setReportReason(e.target.value)}
                          rows={2}
                        />
                        <div className="nb-report-actions">
                          <button
                            className="nb-btn nb-btn--primary"
                            disabled={reportStatus[n.id] === 'pending'}
                            onClick={() => submitReport(n.id)}
                          >
                            Gửi
                          </button>
                          <button
                            className="nb-btn nb-btn--ghost"
                            onClick={() => { setReportingId(null); setReportReason('') }}
                          >
                            Huỷ
                          </button>
                        </div>
                        {reportStatus[n.id] === 'error' && (
                          <span className="nb-report-error">Gửi thất bại, thử lại</span>
                        )}
                      </div>
                    ) : (
                      <button
                        className="nb-btn nb-btn--report"
                        onClick={() => setReportingId(n.id)}
                      >
                        <Flag size={11} /> Báo cáo
                      </button>
                    )}
                  </div>
                )}
              </div>
              {!n.is_read && <span className="nb-unread-dot" />}
            </div>
          )
        })}
      </div>

      <style>{`
        .nb-popup {
          width: 320px;
          background: #1c1c1c;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 14px;
          box-shadow: 0 16px 48px rgba(0,0,0,0.8), 0 4px 16px rgba(0,0,0,0.5);
          overflow: hidden;
          animation: nbSlide 0.22s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        @keyframes nbSlide { from { opacity:0; transform:translateY(-8px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }

        .nb-popup-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 16px 10px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          background: #1c1c1c;
        }
        .nb-popup-title { font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.55); font-family: var(--font-sans), sans-serif; }
        .nb-mark-all { background: none; border: none; cursor: pointer; font-size: 11px; color: rgba(179,0,0,0.8); padding: 0; font-family: var(--font-sans), sans-serif; }
        .nb-mark-all:hover { color: #B30000; }
        .nb-close { background: none; border: none; cursor: pointer; color: rgba(255,255,255,0.35); display: flex; align-items: center; padding: 2px; }
        .nb-close:hover { color: rgba(255,255,255,0.7); }

        .nb-list { max-height: 380px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(179,0,0,0.2) transparent; background: #1c1c1c; }
        .nb-list::-webkit-scrollbar { width: 3px; }
        .nb-list::-webkit-scrollbar-thumb { background: rgba(179,0,0,0.2); border-radius: 3px; }

        .nb-empty { padding: 28px 20px; text-align: center; font-size: 12px; color: rgba(255,255,255,0.25); font-style: italic; font-family: var(--font-sans), sans-serif; }

        .nb-item {
          display: flex; align-items: flex-start; gap: 12px;
          padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.05);
          cursor: default; transition: background 0.1s; position: relative;
          background: #1c1c1c;
        }
        .nb-item:last-child { border-bottom: none; }
        .nb-item--unread { background: #221616; }
        .nb-item--nav { cursor: pointer; }
        .nb-item--nav:hover { background: #242424; }
        .nb-item--unread.nb-item--nav:hover { background: #2a1818; }

        .nb-item-icon {
          width: 28px; height: 28px; border-radius: 8px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
        }
        .nb-icon--chosen_for_evaluation { background: rgba(255,165,0,0.15); color: #ffa500; }
        .nb-icon--evaluation_submitted   { background: rgba(34,197,94,0.15); color: #22c55e; }
        .nb-icon--period_started         { background: rgba(99,102,241,0.15); color: #6366f1; }
        .nb-icon--period_ended           { background: rgba(148,163,184,0.15); color: #94a3b8; }
        .nb-icon--report_submitted       { background: rgba(239,68,68,0.15); color: #ef4444; }
        .nb-icon--report_resolved        { background: rgba(34,197,94,0.15); color: #22c55e; }

        .nb-item-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .nb-item-text { font-size: 12.5px; color: rgba(255,255,255,0.82); line-height: 1.4; margin: 0; font-family: var(--font-sans), sans-serif; }
        .nb-item-time { font-size: 11px; color: rgba(255,255,255,0.28); font-family: var(--font-sans), sans-serif; }
        .nb-item-cta { font-size: 11px; color: rgba(179,0,0,0.7); font-family: var(--font-sans), sans-serif; margin-top: 1px; }

        .nb-unread-dot {
          width: 6px; height: 6px; border-radius: 50%; background: #B30000;
          flex-shrink: 0; margin-top: 5px;
          box-shadow: 0 0 4px rgba(179,0,0,0.6);
        }

        .nb-report-wrap { margin-top: 6px; }
        .nb-report-done { font-size: 11px; color: #22c55e; font-style: italic; font-family: var(--font-sans), sans-serif; }
        .nb-report-error { font-size: 11px; color: #ef4444; font-style: italic; font-family: var(--font-sans), sans-serif; }
        .nb-report-form { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
        .nb-report-input {
          width: 100%; background: #262626;
          border: 1px solid rgba(255,255,255,0.12); border-radius: 6px;
          color: rgba(255,255,255,0.85); font-size: 12px; padding: 6px 8px;
          resize: none; font-family: var(--font-sans), sans-serif; outline: none;
        }
        .nb-report-input:focus { border-color: rgba(179,0,0,0.5); }
        .nb-report-actions { display: flex; gap: 6px; }
        .nb-btn {
          padding: 4px 10px; border-radius: 6px; border: none; cursor: pointer;
          font-size: 11px; font-family: var(--font-sans), sans-serif;
          display: inline-flex; align-items: center; gap: 4px;
          transition: background 0.15s;
        }
        .nb-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .nb-btn--primary { background: rgba(179,0,0,0.25); color: rgba(255,130,130,0.95); }
        .nb-btn--primary:hover:not(:disabled) { background: rgba(179,0,0,0.38); }
        .nb-btn--ghost { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.45); }
        .nb-btn--ghost:hover { background: rgba(255,255,255,0.12); }
        .nb-btn--report { background: rgba(255,165,0,0.1); color: rgba(255,165,0,0.85); border: 1px solid rgba(255,165,0,0.18); }
        .nb-btn--report:hover { background: rgba(255,165,0,0.18); color: #ffa500; }

        [data-theme="light"] .nb-popup { background: #ffffff; border-color: rgba(0,0,0,0.12); box-shadow: 0 16px 48px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.1); }
        [data-theme="light"] .nb-popup-header { background: #ffffff; border-bottom-color: rgba(0,0,0,0.08); }
        [data-theme="light"] .nb-popup-title { color: rgba(0,0,0,0.55); }
        [data-theme="light"] .nb-close { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .nb-close:hover { color: rgba(0,0,0,0.7); }
        [data-theme="light"] .nb-list { background: #ffffff; }
        [data-theme="light"] .nb-item { background: #ffffff; border-bottom-color: rgba(0,0,0,0.06); }
        [data-theme="light"] .nb-item--unread { background: #fff8f8; }
        [data-theme="light"] .nb-item--nav:hover { background: #f7f7f7; }
        [data-theme="light"] .nb-item--unread.nb-item--nav:hover { background: #fff0f0; }
        [data-theme="light"] .nb-item-text { color: rgba(0,0,0,0.8); }
        [data-theme="light"] .nb-item-time { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .nb-item-cta { color: #B30000; }
        [data-theme="light"] .nb-empty { color: rgba(0,0,0,0.3); }
        [data-theme="light"] .nb-report-input { background: #f5f5f5; border-color: rgba(0,0,0,0.14); color: rgba(0,0,0,0.85); }
        [data-theme="light"] .nb-btn--ghost { background: rgba(0,0,0,0.05); color: rgba(0,0,0,0.45); }
      `}</style>
    </div>
  )

  return (
    <>
      <button
        ref={bellRef}
        className={`nb-bell ${unreadCount > 0 ? 'nb-bell--active' : ''}`}
        onClick={handleBellClick}
        aria-label={`Thông báo${unreadCount > 0 ? ` (${unreadCount} chưa đọc)` : ''}`}
        title="Thông báo"
      >
        <Bell size={14} strokeWidth={1.75} />
        {unreadCount > 0 && (
          <span className="nb-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {mounted && open && createPortal(popup, document.body)}

      <style>{`
        .nb-bell {
          width: 30px; height: 30px; border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.08);
          background: transparent; color: rgba(255,255,255,0.4);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; flex-shrink: 0; position: relative;
          transition: color 0.15s, border-color 0.15s, background 0.15s;
        }
        .nb-bell:hover { color: rgba(255,255,255,0.8); border-color: rgba(255,255,255,0.18); background: rgba(255,255,255,0.06); }
        .nb-bell--active { color: #B30000; border-color: rgba(179,0,0,0.25); background: rgba(179,0,0,0.06); }
        .nb-bell--active:hover { background: rgba(179,0,0,0.1); }

        .nb-badge {
          position: absolute; top: -5px; right: -5px;
          min-width: 16px; height: 16px; padding: 0 4px;
          background: #B30000; color: #fff;
          font-size: 9px; font-weight: 700; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          line-height: 1; letter-spacing: 0;
          border: 1.5px solid #080808;
          animation: nbPop 0.3s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        @keyframes nbPop { from { transform: scale(0); } to { transform: scale(1); } }

        [data-theme="light"] .nb-bell { border-color: rgba(0,0,0,0.1); color: rgba(0,0,0,0.4); }
        [data-theme="light"] .nb-bell:hover { color: rgba(0,0,0,0.7); border-color: rgba(0,0,0,0.18); background: rgba(0,0,0,0.05); }
        [data-theme="light"] .nb-bell--active { color: #B30000; border-color: rgba(179,0,0,0.25); background: rgba(179,0,0,0.06); }
        [data-theme="light"] .nb-badge { border-color: #f0f0f2; }
      `}</style>
    </>
  )
}
