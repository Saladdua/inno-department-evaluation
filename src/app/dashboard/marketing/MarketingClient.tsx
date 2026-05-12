"use client";

import { useState, useCallback, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, CheckCircle2 } from "lucide-react";

const MKT_COLS = [
  { label: "Fanpage", title: "Viết bài up Fanpage", pts: 10 },
  { label: "Group", title: "Bài viết có giá trị trên group", pts: 5 },
  { label: "Profile", title: "Gửi nội dung tạo profile", pts: 2 },
  { label: "Like", title: "Like bài viết", pts: 1 },
  { label: "Share", title: "Share bài viết", pts: 2 },
  { label: "Ảnh", title: "Ảnh", pts: 1 },
  { label: "Clip", title: "Clip hoặc nội dung khó", pts: 2 },
  { label: "Hỗ trợ", title: "Hỗ trợ khác", pts: 1 },
  { label: "Nghỉ mát", title: "Văn nghệ nghỉ mát", pts: 2 },
  { label: "Cuối năm", title: "Văn nghệ cuối năm", pts: 2 },
  { label: "Giải đấu", title: "Tham gia giải đấu", pts: 2 },
  { label: "HĐ nội bộ", title: "Tổ chức hoạt động nội bộ", pts: 3 },
  {
    label: "HĐ XH",
    title: "Tham gia các hoạt động xã hội của tập thể",
    pts: 2,
  },
];

interface Dept {
  id: string;
  name: string;
  code: string | null;
}

interface MktRow {
  dept_id: string;
  scores: number[];
  member_count: number;
}

interface Props {
  periodId: string;
  periodLabel: string;
  departments: Dept[];
  initialScores: MktRow[];
}

function emptyScores() {
  return Array(13).fill(0);
}

function computeQ(scores: number[], memberCount: number): number | null {
  if (memberCount <= 0) return null;
  const total = scores.reduce((s, v) => s + (v ?? 0), 0);
  return total / memberCount;
}

function computeRanks(
  rows: { id: string; q: number | null }[],
): Map<string, { rank: number; points: number }> {
  const valid = rows
    .filter((r) => r.q !== null)
    .sort((a, b) => (b.q ?? 0) - (a.q ?? 0));
  const result = new Map<string, { rank: number; points: number }>();
  let rank = 1;
  for (let i = 0; i < valid.length; i++) {
    if (i > 0 && (valid[i].q ?? 0) < (valid[i - 1].q ?? 0)) rank = i + 1;
    const points = Math.max(0, 100 - 4.5 * (rank - 1));
    result.set(valid[i].id, { rank, points });
  }
  return result;
}

export default function MarketingClient({
  periodId,
  periodLabel,
  departments,
  initialScores,
}: Props) {
  const router = useRouter();
  const [isPushing, startPush] = useTransition();
  const [pushMsg, setPushMsg] = useState<string | null>(null);

  // Local state: map of dept_id -> { scores, member_count }
  const [data, setData] = useState<
    Map<string, { scores: number[]; member_count: number }>
  >(() => {
    const m = new Map<string, { scores: number[]; member_count: number }>();
    for (const d of departments) {
      const row = initialScores.find((s) => s.dept_id === d.id);
      m.set(d.id, {
        scores: row?.scores ?? emptyScores(),
        member_count: row?.member_count ?? 1,
      });
    }
    return m;
  });

  // Saving state per dept
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const schedSave = useCallback(
    (deptId: string, scores: number[], memberCount: number) => {
      const prev = saveTimers.current.get(deptId);
      if (prev) clearTimeout(prev);
      const t = setTimeout(async () => {
        setSaving((s) => new Set(s).add(deptId));
        try {
          await fetch("/api/mkt-scores", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ periodId, deptId, scores, memberCount }),
          });
          setSaved((s) => {
            const n = new Set(s);
            n.add(deptId);
            return n;
          });
          setTimeout(
            () =>
              setSaved((s) => {
                const n = new Set(s);
                n.delete(deptId);
                return n;
              }),
            2000,
          );
        } finally {
          setSaving((s) => {
            const n = new Set(s);
            n.delete(deptId);
            return n;
          });
        }
        saveTimers.current.delete(deptId);
      }, 600);
      saveTimers.current.set(deptId, t);
    },
    [periodId],
  );

  function setScore(deptId: string, colIdx: number, val: number) {
    setData((prev) => {
      const cur = prev.get(deptId)!;
      const newScores = [...cur.scores];
      newScores[colIdx] = Math.max(0, val);
      const next = new Map(prev);
      next.set(deptId, { ...cur, scores: newScores });
      schedSave(deptId, newScores, cur.member_count);
      return next;
    });
  }

  function setMemberCount(deptId: string, val: number) {
    setData((prev) => {
      const cur = prev.get(deptId)!;
      const mc = Math.max(1, val);
      const next = new Map(prev);
      next.set(deptId, { ...cur, member_count: mc });
      schedSave(deptId, cur.scores, mc);
      return next;
    });
  }

  // Build Q values for ranking
  const qRows = departments.map((d) => {
    const row = data.get(d.id)!;
    return { id: d.id, q: computeQ(row.scores, row.member_count) };
  });
  const rankMap = computeRanks(qRows);

  function handlePush() {
    startPush(async () => {
      setPushMsg(null);
      const res = await fetch("/api/mkt-scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setPushMsg("Lỗi: " + (json.error ?? "Không xác định"));
      } else {
        setPushMsg(
          `Đã đẩy điểm cho ${json.pushed} phòng ban lên bảng xếp hạng.`,
        );
        router.refresh();
      }
    });
  }

  return (
    <div className="mkt-root">
      {/* Header */}
      <div className="mkt-header">
        <div className="mkt-header-left">
          <span className="mkt-period">{periodLabel}</span>
          <span className="mkt-desc">Bảng chấm điểm hỗ trợ MKT INNO</span>
        </div>
        <div className="mkt-header-right">
          <button
            className="mkt-push-btn"
            onClick={handlePush}
            disabled={isPushing}
          >
            <Upload size={13} />
            {isPushing ? "Đang đẩy…" : "Đẩy điểm lên Bảng xếp hạng"}
          </button>
        </div>
      </div>

      {pushMsg && (
        <div
          className={`mkt-msg ${pushMsg.startsWith("Lỗi") ? "mkt-msg--err" : "mkt-msg--ok"}`}
        >
          {!pushMsg.startsWith("Lỗi") && <CheckCircle2 size={13} />}
          {pushMsg}
        </div>
      )}

      {/* Scoring note */}
      <div className="mkt-note">
        Nhập số điểm tích lũy cho từng hoạt động. Cột Q (Điểm/người) tự tính =
        Tổng ÷ Số người. Xếp hạng theo Q: Top 1 = 100đ, mỗi hạng tiếp theo
        −4,5đ.
      </div>

      {/* Table */}
      <div className="mkt-table-wrap">
        <table className="mkt-table">
          <thead>
            <tr>
              <th className="mkt-th mkt-th--dept">Phòng ban</th>
              {MKT_COLS.map((c, i) => (
                <th
                  key={i}
                  className="mkt-th mkt-th--col"
                  title={c.title}
                >
                  <span className="mkt-col-label">{c.label}</span>
                </th>
              ))}
              <th className="mkt-th mkt-th--sum" title="Tổng điểm">
                Tổng điểm
              </th>
              <th className="mkt-th mkt-th--member" title="Số người">
                Số người
              </th>
              <th
                className="mkt-th mkt-th--q"
                title="Điểm / người = Tổng ÷ Số người"
              >
                Điểm/người
              </th>
              <th className="mkt-th mkt-th--rank">Hạng</th>
              <th className="mkt-th mkt-th--pts">Điểm</th>
              <th className="mkt-th mkt-th--status" />
            </tr>
          </thead>
          <tbody>
            {departments.map((dept) => {
              const row = data.get(dept.id)!;
              const total = row.scores.reduce((s, v) => s + (v ?? 0), 0);
              const q = row.member_count > 0 ? total / row.member_count : null;
              const ranked = rankMap.get(dept.id);
              const isSaving = saving.has(dept.id);
              const isSaved = saved.has(dept.id);

              return (
                <tr key={dept.id} className="mkt-tr">
                  <td className="mkt-td mkt-td--dept">
                    <span className="mkt-dept-code">
                      {dept.code ?? dept.name}
                    </span>
                    <span className="mkt-dept-name">
                      {dept.code ? dept.name : ""}
                    </span>
                  </td>

                  {row.scores.map((val, colIdx) => (
                    <td key={colIdx} className="mkt-td mkt-td--input">
                      <input
                        className="mkt-input"
                        type="number"
                        min={0}
                        value={val || ""}
                        placeholder="0"
                        onChange={(e) =>
                          setScore(
                            dept.id,
                            colIdx,
                            parseInt(e.target.value) || 0,
                          )
                        }
                      />
                    </td>
                  ))}

                  <td className="mkt-td mkt-td--sum">{total}</td>

                  <td className="mkt-td mkt-td--member">
                    <input
                      className="mkt-input mkt-input--member"
                      type="number"
                      min={1}
                      value={row.member_count}
                      onChange={(e) =>
                        setMemberCount(dept.id, parseInt(e.target.value) || 1)
                      }
                    />
                  </td>

                  <td className="mkt-td mkt-td--q">
                    {q !== null ? q.toFixed(2) : "—"}
                  </td>

                  <td className="mkt-td mkt-td--rank">
                    {ranked ? (
                      <span className="mkt-rank">#{ranked.rank}</span>
                    ) : (
                      "—"
                    )}
                  </td>

                  <td className="mkt-td mkt-td--pts">
                    {ranked ? (
                      <span className="mkt-score">
                        {ranked.points.toFixed(1)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>

                  <td className="mkt-td mkt-td--status">
                    {isSaving && <span className="mkt-saving">…</span>}
                    {!isSaving && isSaved && (
                      <span className="mkt-saved">✓</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <style>{`
        .mkt-root {
          font-family: var(--font-sans), sans-serif;
          display: flex; flex-direction: column; gap: 14px;
          animation: mktFade 0.3s ease both;
        }
        @keyframes mktFade { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }

        /* Header */
        .mkt-header {
          display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
        }
        .mkt-header-left { display: flex; flex-direction: column; gap: 2px; }
        .mkt-period {
          font-size: 13px; font-weight: 700; letter-spacing: 0.06em;
          text-transform: uppercase; color: rgba(255,255,255,0.7);
        }
        .mkt-desc { font-size: 11px; color: rgba(255,255,255,0.3); font-style: italic; }
        .mkt-header-right { display: flex; align-items: center; gap: 10px; }

        /* Push button */
        .mkt-push-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 16px; border-radius: 8px; border: none;
          background: #B30000; color: #fff;
          font-size: 12.5px; font-weight: 600; letter-spacing: 0.02em;
          cursor: pointer; white-space: nowrap;
          box-shadow: 0 3px 14px rgba(179,0,0,0.35);
          transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
          font-family: var(--font-sans), sans-serif;
        }
        .mkt-push-btn:hover:not(:disabled) {
          background: #cc0000; transform: translateY(-1px);
          box-shadow: 0 5px 20px rgba(179,0,0,0.5);
        }
        .mkt-push-btn:disabled { opacity: 0.65; cursor: not-allowed; }

        /* Message */
        .mkt-msg {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 14px; border-radius: 8px; font-size: 12.5px;
          font-family: var(--font-sans), sans-serif;
        }
        .mkt-msg--ok {
          background: rgba(74,222,128,0.08); border: 1px solid rgba(74,222,128,0.2);
          color: rgba(74,222,128,0.9);
        }
        .mkt-msg--err {
          background: rgba(179,0,0,0.08); border: 1px solid rgba(179,0,0,0.2);
          color: rgba(255,100,100,0.9);
        }

        /* Note */
        .mkt-note {
          font-size: 11.5px; color: rgba(255,255,255,0.25); font-style: italic;
          padding: 8px 14px; border-radius: 6px;
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05);
        }

        /* Table */
        .mkt-table-wrap {
          overflow-x: auto; border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.015);
          scrollbar-width: thin; scrollbar-color: rgba(179,0,0,0.15) transparent;
        }
        .mkt-table-wrap::-webkit-scrollbar { height: 4px; width: 4px; }
        .mkt-table-wrap::-webkit-scrollbar-thumb { background: rgba(179,0,0,0.2); border-radius: 4px; }

        .mkt-table { width: max-content; min-width: 100%; border-collapse: collapse; }

        .mkt-th {
          padding: 9px 8px; text-align: center;
          font-size: 10px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase;
          color: rgba(255,255,255,0.25); border-bottom: 1px solid rgba(255,255,255,0.06);
          white-space: nowrap; position: sticky; top: 0;
          background: #0e0e0e; z-index: 1;
        }
        .mkt-th--dept { text-align: left; padding-left: 16px; width: 1%; white-space: nowrap; position: sticky; left: 0; z-index: 2; }
        .mkt-th--col { width: 70px; }
        .mkt-th--sum { background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.4); width: 60px; }
        .mkt-th--member { width: 90px; }
        .mkt-th--q { width: 80px; color: rgba(179,0,0,0.7); }
        .mkt-th--rank { width: 56px; }
        .mkt-th--pts { width: 64px; color: rgba(74,222,128,0.6); }
        .mkt-th--status { width: 32px; }

        .mkt-col-label { display: block; font-size: 10px; }

        .mkt-tr { border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.1s; }
        .mkt-tr:hover { background: rgba(255,255,255,0.02); }
        .mkt-tr:last-child { border-bottom: none; }

        .mkt-td { padding: 7px 6px; vertical-align: middle; text-align: center; font-size: 12.5px; color: rgba(255,255,255,0.65); }
        .mkt-td--dept {
          text-align: left; padding-left: 16px; white-space: nowrap;
          position: sticky; left: 0;
          background: #0e0e0e;
          border-right: 1px solid rgba(255,255,255,0.04);
        }
        .mkt-tr:hover .mkt-td--dept { background: #111; }

        .mkt-dept-code { display: block; font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.7); letter-spacing: 0.04em; }
        .mkt-dept-name { display: block; font-size: 10px; color: rgba(255,255,255,0.25); margin-top: 1px; }

        .mkt-td--input { padding: 5px 4px; }
        .mkt-input {
          width: 62px; padding: 5px 6px; text-align: center;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07);
          border-radius: 6px; color: #fff; font-size: 12px; outline: none;
          font-family: var(--font-sans), sans-serif;
          transition: border-color 0.12s, background 0.12s;
          -moz-appearance: textfield;
        }
        .mkt-input::-webkit-inner-spin-button,
        .mkt-input::-webkit-outer-spin-button { -webkit-appearance: none; }
        .mkt-input:focus { border-color: rgba(179,0,0,0.4); background: rgba(179,0,0,0.05); }
        .mkt-input:hover:not(:focus) { border-color: rgba(255,255,255,0.12); }
        .mkt-input--member { width: 72px; }

        .mkt-td--sum {
          background: rgba(255,255,255,0.02); color: rgba(255,255,255,0.5);
          font-weight: 600; font-size: 13px;
        }
        .mkt-td--q { color: rgba(179,0,0,0.8); font-weight: 600; }
        .mkt-td--rank { }
        .mkt-td--pts { }

        .mkt-rank {
          display: inline-block; padding: 2px 8px; border-radius: 5px;
          background: rgba(255,255,255,0.05); font-size: 11.5px;
          color: rgba(255,255,255,0.5); font-family: monospace;
        }
        .mkt-score {
          display: inline-block; padding: 2px 8px; border-radius: 5px;
          background: rgba(74,222,128,0.08); border: 1px solid rgba(74,222,128,0.15);
          font-size: 12px; color: #4ade80; font-weight: 700;
        }

        .mkt-saving { font-size: 11px; color: rgba(255,255,255,0.3); animation: pulse 1s infinite; }
        .mkt-saved  { font-size: 11px; color: rgba(74,222,128,0.7); }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

        /* Light mode */
        [data-theme="light"] .mkt-period { color: rgba(0,0,0,0.7); }
        [data-theme="light"] .mkt-desc { color: rgba(0,0,0,0.35); }
        [data-theme="light"] .mkt-note { background: rgba(0,0,0,0.02); border-color: rgba(0,0,0,0.07); color: rgba(0,0,0,0.4); }
        [data-theme="light"] .mkt-table-wrap { background: #fff; border-color: rgba(0,0,0,0.08); }
        [data-theme="light"] .mkt-th { background: #f5f5f5; color: rgba(0,0,0,0.4); border-bottom-color: rgba(0,0,0,0.07); }
        [data-theme="light"] .mkt-th--dept { background: #f5f5f5; }
        [data-theme="light"] .mkt-th--sum { background: rgba(0,0,0,0.03); color: rgba(0,0,0,0.5); }
        [data-theme="light"] .mkt-tr { border-bottom-color: rgba(0,0,0,0.05); }
        [data-theme="light"] .mkt-tr:hover { background: rgba(0,0,0,0.015); }
        [data-theme="light"] .mkt-td { color: rgba(0,0,0,0.65); }
        [data-theme="light"] .mkt-td--dept { background: #fff; border-right-color: rgba(0,0,0,0.06); }
        [data-theme="light"] .mkt-tr:hover .mkt-td--dept { background: #fafafa; }
        [data-theme="light"] .mkt-dept-code { color: rgba(0,0,0,0.7); }
        [data-theme="light"] .mkt-dept-name { color: rgba(0,0,0,0.35); }
        [data-theme="light"] .mkt-input { background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.1); color: #1a1a1a; }
        [data-theme="light"] .mkt-input:focus { border-color: rgba(179,0,0,0.35); background: rgba(179,0,0,0.03); }
        [data-theme="light"] .mkt-td--sum { background: rgba(0,0,0,0.02); color: rgba(0,0,0,0.55); }
        [data-theme="light"] .mkt-rank { background: rgba(0,0,0,0.06); color: rgba(0,0,0,0.5); }
        [data-theme="light"] .mkt-score { background: rgba(22,163,74,0.07); border-color: rgba(22,163,74,0.15); color: #16a34a; }
      `}</style>
    </div>
  );
}
