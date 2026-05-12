"use client";

import { useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Table2,
  Lock,
} from "lucide-react";

export interface CriterionInfo {
  id: string;
  code: string | null;
  name: string;
  weight: number;
  input_type: 'manual' | 'auto';
}

export interface CriterionAvg {
  criteriaId: string;
  avgRaw: number | null;
  avgWeighted: number | null;
}

export interface DeptResult {
  id: string;
  name: string;
  code: string | null;
  rank: number;
  avgScore: number | null;
  receivedCount: number;
  totalEvaluators: number;
  criteriaAvg: CriterionAvg[];
  isMyDept: boolean;
}

export interface PeriodOption {
  id: string;
  quarter: number;
  year: number;
  status: string;
}

interface Props {
  periodLabel: string;
  periodStatus: string;
  activePeriodId: string;
  periods: PeriodOption[];
  results: DeptResult[];
  criteria: CriterionInfo[];
  maxScore: number;
  totalSubmitted: number;
  canManageAll: boolean;
}

function fmt(n: number | null, decimals = 1) {
  return n == null ? "—" : n.toFixed(decimals);
}

function pct(score: number | null, max: number) {
  if (score == null || max === 0) return 0;
  return Math.min(100, (score / max) * 100);
}

const RANK_COLOR: Record<number, string> = {
  1: "#FFD700",
  2: "#C0C0C0",
  3: "#CD7F32",
};

/* ── HTML Report Generator ───────────────────────────── */
export function generateHTML(
  results: DeptResult[],
  criteria: CriterionInfo[],
  periodLabel: string,
  maxScore: number,
  totalSubmitted: number,
  logoUrl?: string,
) {
  const now = new Date().toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const ranked = results.filter((r) => r.avgScore != null);

  const criteriaHeaders = criteria
    .map(
      (c) =>
        `<th style="text-align:right"><span style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${c.name}">${c.code ?? c.name}</span><span style="font-weight:400;opacity:0.5;font-size:9px;letter-spacing:.04em">×${c.weight}</span></th>`,
    )
    .join("");

  const RANK_COLORS: Record<number, string> = {
    1: "#C8A84B",
    2: "#9EB5C8",
    3: "#C8956C",
  };

  const tableRows = results
    .map((r) => {
      const barPct = pct(r.avgScore, maxScore);
      const isTop3 = r.rank <= 3 && r.avgScore != null;
      const rc = isTop3 ? RANK_COLORS[r.rank] : "";
      const criteriaData = criteria
        .map((c) => {
          const avg = r.criteriaAvg.find((a) => a.criteriaId === c.id);
          return `<td class="td-num">${avg?.avgWeighted != null ? avg.avgWeighted.toFixed(2) : "—"}</td>`;
        })
        .join("");
      return `<tr${isTop3 ? ` class="rank-${r.rank}"` : ""}>
      <td class="td-rank"><span style="color:${rc || "rgba(240,230,211,0.3)"};font-weight:700;font-size:15px">${r.avgScore != null ? r.rank : "—"}</span></td>
      <td class="td-dept">
        <span class="dept-code">${r.code ?? r.name}</span>
        ${r.code ? `<span class="dept-name">${r.name}</span>` : ""}
      </td>
      <td class="td-bar">
        <div class="bar-track"><div class="bar-fill" style="width:${barPct.toFixed(1)}%;background:${rc || "#B30000"}"></div></div>
      </td>
      <td class="td-score"><span style="color:${rc || "rgba(240,230,211,0.85)"};font-size:${isTop3 ? "16px" : "14px"}">${r.avgScore != null ? r.avgScore.toFixed(2) : "—"}</span></td>
      <td class="td-pct">${r.avgScore != null ? `${barPct.toFixed(1)}%` : "—"}</td>
      <td class="td-count">${r.receivedCount}/${r.totalEvaluators}</td>
      ${criteriaData}
    </tr>`;
    })
    .join("");

  // Podium order: 2nd left · 1st centre · 3rd right
  const podiumSlots = [
    { r: ranked[1], medal: "🥈", height: 90, color: "#9EB5C8" },
    { r: ranked[0], medal: "🥇", height: 130, color: "#C8A84B" },
    { r: ranked[2], medal: "🥉", height: 65, color: "#C8956C" },
  ];
  const podiumHtml =
    ranked.length >= 1
      ? `
  <section class="podium-section">
    <h2 class="section-title">Top Phòng Ban</h2>
    <div class="podium-stage">
      ${podiumSlots
        .filter((s) => s.r != null)
        .map(
          ({ r, medal, height, color }) => `
        <div class="podium-slot">
          <div class="podium-info">
            <div class="podium-medal">${medal}</div>
            <div class="podium-dept">${r.code ?? r.name}</div>
            ${r.code ? `<div class="podium-full-name">${r.name}</div>` : ""}
            <div class="podium-score" style="color:${color}">${r.avgScore?.toFixed(2)}</div>
            <div class="podium-pct">${pct(r.avgScore, maxScore).toFixed(1)}%</div>
          </div>
          <div class="podium-block" style="height:${height}px;border-color:${color};box-shadow:0 0 28px ${color}20">
            <span class="podium-rank-num" style="color:${color}">${r.rank}</span>
          </div>
        </div>`,
        )
        .join("")}
    </div>
  </section>`
      : "";

  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kết quả Đánh giá — ${periodLabel}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{
  --crimson:#B30000;--gold:#C8A84B;--gold-dim:rgba(200,168,75,0.15);
  --silver:#9EB5C8;--bronze:#C8956C;
  --bg:#080808;--surface:#101010;
  --border:rgba(200,168,75,0.12);--border-dim:rgba(255,255,255,0.06);
  --text:rgba(240,230,211,0.85);--text-dim:rgba(240,230,211,0.42);--text-muted:rgba(240,230,211,0.2);
}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter','Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh}

/* ── HEADER ── */
.page-header{
  background:linear-gradient(155deg,#0f0000 0%,#160000 50%,#0d0505 100%);
  border-bottom:1px solid var(--border);
  padding:32px 48px 28px;
  position:relative;overflow:hidden;
}
.page-header::before{
  content:'';position:absolute;top:-100px;right:-100px;
  width:360px;height:360px;
  background:radial-gradient(circle,rgba(179,0,0,0.09) 0%,transparent 60%);
  pointer-events:none;
}
.page-header::after{
  content:'';position:absolute;
  top:-60px;left:-40px;
  width:200px;height:200px;
  background:radial-gradient(circle,rgba(200,168,75,0.04) 0%,transparent 70%);
  pointer-events:none;
}
.header-shine{
  position:absolute;bottom:0;left:0;right:0;height:2px;
  background:linear-gradient(90deg,transparent 0%,var(--crimson) 25%,var(--gold) 50%,var(--crimson) 75%,transparent 100%);
  opacity:0.65;
}

/* Logo */
.logo{display:flex;align-items:center;gap:14px;margin-bottom:24px}
.logo-img{height:52px;object-fit:contain;max-width:240px;display:block;filter:brightness(1.05)}
.logo-wordmark{line-height:1}
.logo-name{
  font-family:'Cinzel','Palatino Linotype',Georgia,serif;
  font-size:22px;font-weight:700;letter-spacing:.35em;color:#fff;
}
.logo-tagline{
  font-size:8.5px;letter-spacing:.42em;text-transform:uppercase;
  color:var(--gold);opacity:.7;margin-top:5px;display:block;
}

.header-content{display:flex;align-items:flex-start;justify-content:space-between;gap:24px}
.report-title{
  font-family:'Cinzel','Palatino Linotype',Georgia,serif;
  font-size:26px;font-weight:700;color:#fff;
  letter-spacing:.04em;line-height:1.2;
  text-shadow:0 2px 24px rgba(179,0,0,0.35);
}
.report-sub{font-size:12px;color:var(--text-dim);margin-top:9px;font-weight:300;letter-spacing:.05em}
.period-pill{
  display:inline-flex;align-items:center;gap:9px;
  background:linear-gradient(135deg,rgba(179,0,0,0.28),rgba(200,168,75,0.12));
  border:1px solid rgba(200,168,75,0.28);
  border-radius:30px;padding:9px 22px;
  font-size:12px;font-weight:700;letter-spacing:.1em;
  color:#E8C86C;text-transform:uppercase;white-space:nowrap;align-self:flex-start;
}
.period-pill::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--crimson);flex-shrink:0}

/* ── BODY ── */
.container{max-width:1300px;margin:0 auto;padding:36px 48px 60px}

/* ── STATS ── */
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:12px;margin-bottom:44px}
.stat-card{
  background:var(--surface);
  border:1px solid var(--border-dim);
  border-top:2px solid var(--border-dim);
  border-radius:10px;padding:18px 20px;
}
.stat-card--crimson{border-top-color:var(--crimson)}
.stat-card--gold{border-top-color:var(--gold);background:linear-gradient(160deg,rgba(200,168,75,0.04) 0%,var(--surface) 55%)}
.stat-card--winner{border-top-color:var(--gold);background:linear-gradient(160deg,rgba(200,168,75,0.06) 0%,var(--surface) 50%)}
.stat-val{font-size:30px;font-weight:300;color:#fff;letter-spacing:-.02em;line-height:1}
.stat-val--winner{font-size:16px;font-weight:700;color:var(--gold);line-height:1.25;letter-spacing:.03em}
.stat-lbl{font-size:9px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted);margin-top:8px}

/* ── SECTION TITLE ── */
.section-title{
  font-family:'Cinzel','Palatino Linotype',Georgia,serif;
  font-size:11px;font-weight:700;letter-spacing:.22em;
  text-transform:uppercase;color:var(--gold);
  display:flex;align-items:center;gap:14px;margin-bottom:22px;
}
.section-title::before,.section-title::after{content:'';flex:1;height:1px}
.section-title::before{background:linear-gradient(270deg,var(--gold-dim),transparent)}
.section-title::after{background:linear-gradient(90deg,var(--gold-dim),transparent)}

/* ── PODIUM ── */
.podium-section{margin-bottom:52px}
.podium-stage{display:flex;justify-content:center;align-items:flex-end;gap:10px;padding:0 16px}
.podium-slot{display:flex;flex-direction:column;align-items:center;width:210px;max-width:33%}
.podium-info{
  text-align:center;padding:18px 14px 14px;width:100%;
  background:var(--surface);
  border:1px solid var(--border-dim);
  border-radius:12px 12px 0 0;margin-bottom:-1px;
}
.podium-medal{font-size:30px;margin-bottom:8px;line-height:1}
.podium-dept{font-size:17px;font-weight:700;color:#fff;letter-spacing:.05em}
.podium-full-name{font-size:10px;color:var(--text-dim);margin-top:3px;font-weight:300}
.podium-score{font-size:30px;font-weight:300;letter-spacing:-.03em;margin-top:10px;line-height:1}
.podium-pct{font-size:11px;color:var(--text-muted);margin-top:5px}
.podium-block{
  width:100%;border:1px solid;border-top:none;
  border-radius:0 0 8px 8px;
  display:flex;align-items:center;justify-content:center;
  background:linear-gradient(180deg,rgba(0,0,0,0.25),rgba(0,0,0,0.6));
}
.podium-rank-num{
  font-family:'Cinzel',Georgia,serif;
  font-size:36px;font-weight:700;opacity:.4;
}

/* ── TABLE ── */
.table-section{margin-bottom:40px}
.table-wrap{border:1px solid var(--border-dim);border-radius:12px;overflow:hidden}
table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed}
thead th{
  background:linear-gradient(180deg,#1c0000,#150000);
  color:rgba(200,168,75,0.75);
  padding:11px 10px;text-align:left;
  font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
  word-break:break-word;overflow:hidden;
  border-bottom:1px solid rgba(200,168,75,0.18);
}
td{
  padding:10px 10px;vertical-align:middle;
  border-bottom:1px solid var(--border-dim);
  color:var(--text);overflow:hidden;
}
tr:last-child td{border-bottom:none}
tr:hover td{background:rgba(255,255,255,0.018)}
tr.rank-1 td{background:rgba(200,168,75,0.045)}
tr.rank-2 td{background:rgba(158,181,200,0.03)}
tr.rank-3 td{background:rgba(200,149,108,0.03)}
.td-rank{width:44px;text-align:center}
.td-dept{width:150px}
.dept-code{font-weight:700;color:#fff;display:block;letter-spacing:.03em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dept-name{font-size:10px;color:var(--text-dim);display:block;margin-top:2px;font-weight:300;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.td-bar{width:90px}
.bar-track{height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;margin-top:4px}
.bar-fill{height:100%;border-radius:2px}
.td-score{width:70px;text-align:right;white-space:nowrap;font-weight:300}
.td-pct{width:50px;text-align:right;color:var(--text-dim);font-size:11px;white-space:nowrap}
.td-count{width:72px;text-align:center;color:var(--text-dim);font-size:11px;white-space:nowrap}
.td-num{text-align:right;font-size:11px;color:var(--text-dim);font-variant-numeric:tabular-nums;white-space:nowrap}

/* ── FOOTER ── */
footer{
  text-align:center;padding:24px 48px 32px;
  border-top:1px solid var(--border-dim);
  color:var(--text-muted);font-size:11px;letter-spacing:.07em;
  position:relative;
}
footer::before{
  content:'';position:absolute;top:-1px;left:50%;transform:translateX(-50%);
  width:100px;height:1px;
  background:linear-gradient(90deg,transparent,var(--gold),transparent);
  opacity:.45;
}
.footer-brand{color:rgba(200,168,75,0.5);font-weight:600;letter-spacing:.14em}

@media print{
  -webkit-print-color-adjust:exact;color-adjust:exact;
  tr{page-break-inside:avoid}
}
</style>
</head>
<body>

<div class="page-header">
  <div class="logo">
    ${logoUrl
      ? `<img src="${logoUrl}" alt="Company Logo" class="logo-img">`
      : `<svg width="42" height="42" viewBox="0 0 42 42" xmlns="http://www.w3.org/2000/svg">
      <polygon points="21,2 40,21 21,40 2,21" fill="#B30000"/>
      <polygon points="21,9 34,21 21,33 8,21" fill="rgba(0,0,0,0.22)"/>
      <polygon points="21,2 40,21 30,11" fill="rgba(255,255,255,0.13)"/>
      <polygon points="21,2 12,11 21,9" fill="rgba(255,255,255,0.06)"/>
      <polygon points="21,40 40,21 30,31" fill="rgba(0,0,0,0.15)"/>
    </svg>
    <div class="logo-wordmark">
      <div class="logo-name">INNO</div>
      <span class="logo-tagline">Innovation — Joint Stock Company</span>
    </div>`}
  </div>
  <div class="header-content">
    <div>
      <div class="report-title">Kết quả Đánh giá Phòng ban</div>
      <div class="report-sub">Báo cáo tổng hợp chính thức &nbsp;·&nbsp; Xuất lúc ${now}</div>
    </div>
    <span class="period-pill">${periodLabel}</span>
  </div>
  <div class="header-shine"></div>
</div>

<div class="container">

  <div class="stats-grid">
    <div class="stat-card stat-card--crimson">
      <div class="stat-val">${results.length}</div>
      <div class="stat-lbl">Phòng ban</div>
    </div>
    <div class="stat-card stat-card--gold">
      <div class="stat-val" style="color:var(--gold)">${totalSubmitted}</div>
      <div class="stat-lbl">Đánh giá đã nộp</div>
    </div>
    <div class="stat-card">
      <div class="stat-val" style="font-size:22px">${maxScore}</div>
      <div class="stat-lbl">Điểm tối đa</div>
    </div>
    ${
      ranked[0]
        ? `<div class="stat-card stat-card--winner">
      <div class="stat-val--winner">${ranked[0].code ?? ranked[0].name}</div>
      <div class="stat-lbl" style="margin-top:10px">🥇&nbsp; Hạng nhất &nbsp;·&nbsp; ${ranked[0].avgScore?.toFixed(2)} điểm</div>
    </div>`
        : ""
    }
  </div>

  ${podiumHtml}

  <div class="table-section">
    <h2 class="section-title">Bảng Xếp Hạng Chi Tiết</h2>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width:44px;text-align:center">Hạng</th>
            <th style="width:150px">Phòng ban</th>
            <th style="width:90px">Điểm TB</th>
            <th style="width:70px;text-align:right">Điểm</th>
            <th style="width:50px;text-align:right">%</th>
            <th style="width:72px;text-align:center">Đánh giá</th>
            ${criteriaHeaders}
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  </div>

</div>

<footer>
  <span class="footer-brand">INNO JSC</span> &nbsp;·&nbsp; Hệ thống Đánh giá Phòng ban &nbsp;·&nbsp; ${periodLabel}
</footer>

</body>
</html>`;
}

/* ── XLS (SpreadsheetML) Generator ──────────────────── */
export function generateXLS(
  results: DeptResult[],
  criteria: CriterionInfo[],
  periodLabel: string,
  maxScore: number,
) {
  const esc = (s: string) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const cell = (v: string) =>
    `<Cell><Data ss:Type="String">${esc(v)}</Data></Cell>`;
  const hCell = (v: string) =>
    `<Cell ss:StyleID="h"><Data ss:Type="String">${esc(v)}</Data></Cell>`;
  const nCell = (v: number | null) =>
    v != null
      ? `<Cell><Data ss:Type="Number">${v}</Data></Cell>`
      : `<Cell><Data ss:Type="String">—</Data></Cell>`;

  const rows: string[] = [];

  rows.push(
    `<Row><Cell ss:StyleID="title" ss:MergeAcross="${4 + criteria.length}"><Data ss:Type="String">KẾT QUẢ ĐÁNH GIÁ PHÒNG BAN — ${esc(periodLabel)}</Data></Cell></Row>`,
  );
  rows.push("<Row/>");
  rows.push(
    `<Row>${[
      "Hạng",
      "Phòng ban",
      "Điểm TB",
      "Tỷ lệ %",
      "Được đánh giá",
      ...criteria.map((c) => `${c.code ?? c.name} (×${c.weight})`),
    ]
      .map(hCell)
      .join("")}</Row>`,
  );

  for (const r of results) {
    const barPct = pct(r.avgScore, maxScore);
    rows.push(
      `<Row>${[
        cell(r.avgScore != null ? String(r.rank) : "—"),
        cell((r.code ? `${r.code} - ` : "") + r.name),
        nCell(r.avgScore != null ? parseFloat(r.avgScore.toFixed(2)) : null),
        cell(r.avgScore != null ? `${barPct.toFixed(1)}%` : "—"),
        cell(`${r.receivedCount}/${r.totalEvaluators}`),
        ...criteria.map((c) => {
          const avg = r.criteriaAvg.find((a) => a.criteriaId === c.id);
          return nCell(
            avg?.avgWeighted != null
              ? parseFloat(avg.avgWeighted.toFixed(2))
              : null,
          );
        }),
      ].join("")}</Row>`,
    );
  }

  rows.push("<Row/>");
  rows.push(`<Row>${cell(`Điểm tối đa: ${maxScore}`)}</Row>`);
  rows.push(
    `<Row>${cell(`Xuất lúc: ${new Date().toLocaleString("vi-VN")}`)}</Row>`,
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
          xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="title"><Font ss:Bold="1" ss:Size="14" ss:Color="#B30000"/></Style>
    <Style ss:ID="h">
      <Font ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#1A1A1A" ss:Pattern="Solid"/>
      <Alignment ss:WrapText="1"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="Kết quả">
    <Table ColumnWidth="120">${rows.join("")}</Table>
  </Worksheet>
</Workbook>`;
}

export function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob(["﻿" + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ── Main Component ──────────────────────────────────── */
export default function ResultsClient({
  periodLabel,
  periodStatus,
  activePeriodId,
  periods,
  results,
  criteria,
  maxScore,
  totalSubmitted,
  canManageAll,
}: Props) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const ranked = results.filter((r) => r.avgScore != null);
  const unranked = results.filter((r) => r.avgScore == null);
  const allRows = [...ranked, ...unranked];

  function toggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function handlePeriodChange(e: React.ChangeEvent<HTMLSelectElement>) {
    router.push(`/dashboard/results?periodId=${e.target.value}`);
  }

  function handleDownloadHTML() {
    const html = generateHTML(
      results,
      criteria,
      periodLabel,
      maxScore,
      totalSubmitted,
      process.env.NEXT_PUBLIC_COMPANY_LOGO_URL,
    );
    const slug = periodLabel.replace(/[\s·]+/g, "_");
    triggerDownload(html, `ket_qua_${slug}.html`, "text/html;charset=utf-8");
  }

  function handleDownloadXLS() {
    const xls = generateXLS(results, criteria, periodLabel, maxScore);
    const slug = periodLabel.replace(/[\s·]+/g, "_");
    triggerDownload(
      xls,
      `ket_qua_${slug}.xls`,
      "application/vnd.ms-excel;charset=utf-8",
    );
  }

  if (results.length === 0) {
    return (
      <div className="rs-root">
        <div className="rs-header">
          <div className="rs-header-left">
            <div className="rs-period-select-wrap">
              <select
                className="rs-period-select"
                value={activePeriodId}
                onChange={handlePeriodChange}
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    Quý {p.quarter} · {p.year}
                    {p.status === "closed" ? " ✓" : ""}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} className="rs-select-icon" />
            </div>
          </div>
        </div>
        <div className="rs-empty">
          Chưa có dữ liệu đánh giá nào được nộp trong kỳ này.
        </div>
        <style>{rsStyles}</style>
      </div>
    );
  }

  return (
    <div className="rs-root">
      {/* ── Header ── */}
      <div className="rs-header">
        <div className="rs-header-left">
          {/* Period selector */}
          <div className="rs-period-select-wrap">
            <select
              className="rs-period-select"
              value={activePeriodId}
              onChange={handlePeriodChange}
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  Quý {p.quarter} · {p.year}
                  {p.status === "closed"
                    ? " ✓"
                    : p.status === "draft"
                      ? " (nháp)"
                      : ""}
                </option>
              ))}
            </select>
            <ChevronDown size={12} className="rs-select-icon" />
          </div>
          <span className="rs-sub">Kết quả tổng hợp</span>
          {periodStatus === "closed" && (
            <span className="rs-locked-badge">
              <Lock size={10} /> Đã tổng kết
            </span>
          )}
        </div>
        <div className="rs-header-right">
          <span className="rs-meta">
            {totalSubmitted} đánh giá · tối đa {maxScore} điểm
          </span>
          {(canManageAll || periodStatus === "closed") &&
            results.length > 0 && (
              <>
                <button
                  className="rs-dl-btn rs-dl-btn--html"
                  onClick={handleDownloadHTML}
                  title="Tải báo cáo HTML"
                >
                  <FileText size={13} /> HTML
                </button>
                <button
                  className="rs-dl-btn rs-dl-btn--xls"
                  onClick={handleDownloadXLS}
                  title="Tải bảng Excel"
                >
                  <Table2 size={13} /> Excel
                </button>
              </>
            )}
        </div>
      </div>

      {/* ── Podium (top 3) ── */}
      {ranked.length >= 1 && (
        <div className="rs-podium">
          {([1, 0, 2] as const).map((podiumIndex) => {
            const r = ranked[podiumIndex];
            if (!r)
              return (
                <div
                  key={podiumIndex}
                  className="rs-podium-slot rs-podium-slot--empty"
                />
              );
            const place = podiumIndex + 1;
            const heightMap: Record<number, string> = {
              1: "80px",
              2: "64px",
              3: "52px",
            };
            return (
              <div
                key={r.id}
                className={`rs-podium-slot rs-podium-slot--${place} ${r.isMyDept ? "rs-podium-slot--mine" : ""}`}
              >
                <div className="rs-podium-info">
                  <span
                    className="rs-podium-rank"
                    style={{ color: RANK_COLOR[place] }}
                  >
                    #{place}
                  </span>
                  <span className="rs-podium-name">{r.code ?? r.name}</span>
                  <span className="rs-podium-score">{fmt(r.avgScore)}</span>
                  <span className="rs-podium-pct">
                    {pct(r.avgScore, maxScore).toFixed(1)}%
                  </span>
                </div>
                <div
                  className="rs-podium-base"
                  style={{
                    height: heightMap[place],
                    borderColor: RANK_COLOR[place],
                  }}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* ── Ranking table ── */}
      <div className="rs-table-wrap">
        <table className="rs-table">
          <thead>
            <tr>
              <th className="rs-th th-rank">#</th>
              <th className="rs-th th-dept">Phòng ban</th>
              <th className="rs-th th-bar">Điểm trung bình</th>
              <th className="rs-th th-score">Điểm TB</th>
              <th className="rs-th th-pct">%</th>
              <th className="rs-th th-count">Được đánh giá</th>
              <th className="rs-th th-expand" />
            </tr>
          </thead>
          <tbody>
            {allRows.map((r) => {
              const isExpanded = expandedId === r.id;
              const barPct = pct(r.avgScore, maxScore);
              const rankColor = r.rank <= 3 ? RANK_COLOR[r.rank] : undefined;

              const canExpand = canManageAll || r.isMyDept
              return (
                <Fragment key={r.id}>
                  <tr
                    className={`rs-tr ${r.isMyDept ? "rs-tr--mine" : ""} ${isExpanded ? "rs-tr--expanded" : ""} ${!canExpand ? "rs-tr--locked" : ""}`}
                    onClick={() => canExpand && toggle(r.id)}
                  >
                    <td className="rs-td td-rank">
                      {r.avgScore != null ? (
                        <span
                          className="rs-rank-num"
                          style={{ color: rankColor }}
                        >
                          {r.rank}
                        </span>
                      ) : (
                        <span className="rs-rank-dash">—</span>
                      )}
                    </td>

                    <td className="rs-td td-dept">
                      <span
                        className={`rs-dept-name ${r.isMyDept ? "rs-dept-name--mine" : ""}`}
                      >
                        {r.code ?? r.name}
                      </span>
                      {r.isMyDept && <span className="rs-you">bạn</span>}
                    </td>

                    <td className="rs-td td-bar">
                      <div className="rs-bar-track">
                        <div
                          className="rs-bar-fill"
                          style={{
                            width: `${barPct}%`,
                            background: rankColor ?? "#B30000",
                          }}
                        />
                      </div>
                    </td>

                    <td className="rs-td td-score">
                      <span
                        className="rs-score-val"
                        style={{ color: rankColor }}
                      >
                        {fmt(r.avgScore)}
                      </span>
                    </td>

                    <td className="rs-td td-pct">
                      <span className="rs-pct-val">
                        {r.avgScore != null ? `${barPct.toFixed(1)}%` : "—"}
                      </span>
                    </td>

                    <td className="rs-td td-count">
                      <span
                        className={`rs-count ${r.receivedCount === r.totalEvaluators && r.totalEvaluators > 0 ? "rs-count--full" : ""}`}
                      >
                        {r.receivedCount}
                      </span>
                      <span className="rs-count-total">
                        /{r.totalEvaluators}
                      </span>
                    </td>

                    <td className="rs-td td-expand">
                      {canExpand && (isExpanded ? (
                        <ChevronDown
                          size={13}
                          className="rs-chevron rs-chevron--open"
                        />
                      ) : (
                        <ChevronRight size={13} className="rs-chevron" />
                      ))}
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className="rs-detail-row">
                      <td colSpan={7} className="rs-detail-cell">
                        <div className="rs-detail-inner">
                          {(() => {
                            const hasAnyScore = r.criteriaAvg.some(
                              (a) => a.avgRaw != null || a.avgWeighted != null,
                            );
                            if (!hasAnyScore) {
                              return (
                                <span className="rs-detail-empty">
                                  Chưa có đánh giá nào được nộp.
                                </span>
                              );
                            }
                            return (
                              <table className="rs-detail-table">
                                <thead>
                                  <tr>
                                    <th className="rs-dth dth-code">Mã</th>
                                    <th className="rs-dth dth-name">Tiêu chí</th>
                                    <th className="rs-dth dth-weight">Hệ số</th>
                                    <th className="rs-dth dth-raw">TB điểm</th>
                                    <th className="rs-dth dth-bar">Phân bố</th>
                                    <th className="rs-dth dth-weighted">
                                      TB quy đổi
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {criteria.map((c) => {
                                    const avg = r.criteriaAvg.find(
                                      (a) => a.criteriaId === c.id,
                                    );
                                    const rawMax = c.input_type === 'auto' ? 100 : 10;
                                    const rawPct =
                                      avg?.avgRaw != null
                                        ? Math.min(100, (avg.avgRaw / rawMax) * 100)
                                        : 0;
                                    return (
                                      <tr key={c.id} className="rs-dtr">
                                        <td className="rs-dtd dtd-code">
                                          {c.code ?? "—"}
                                        </td>
                                        <td className="rs-dtd dtd-name">
                                          {c.name}
                                          {c.input_type === 'auto' && (
                                            <span className="rs-auto-badge">auto</span>
                                          )}
                                        </td>
                                        <td className="rs-dtd dtd-weight">
                                          ×{c.weight}
                                        </td>
                                        <td className="rs-dtd dtd-raw">
                                          {fmt(avg?.avgRaw ?? null)}
                                        </td>
                                        <td className="rs-dtd dtd-bar">
                                          <div className="rs-dbar-track">
                                            <div
                                              className={`rs-dbar-fill${c.input_type === 'auto' ? ' rs-dbar-fill--auto' : ''}`}
                                              style={{ width: `${rawPct}%` }}
                                            />
                                          </div>
                                        </td>
                                        <td className="rs-dtd dtd-weighted">
                                          <span className="rs-weighted-val">
                                            {fmt(avg?.avgWeighted ?? null)}
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                                <tfoot>
                                  <tr className="rs-dfoot">
                                    <td colSpan={5} className="rs-dfoot-label">
                                      Tổng
                                    </td>
                                    <td className="rs-dfoot-val">
                                      {fmt(r.avgScore)}
                                      <span className="rs-dfoot-max">
                                        {" "}
                                        / {maxScore}
                                      </span>
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            );
                          })()}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <style>{rsStyles}</style>
    </div>
  );
}

const rsStyles = `
  .rs-root { display: flex; flex-direction: column; gap: 20px; font-family: var(--font-sans), sans-serif; animation: rsFade 0.3s ease both; }
  @keyframes rsFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  .rs-empty { color: rgba(255,255,255,0.2); font-size: 13px; font-style: italic; padding: 48px 0; }

  /* ── Header ── */
  .rs-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .rs-header-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .rs-header-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

  /* Period selector */
  .rs-period-select-wrap { position: relative; display: flex; align-items: center; }
  .rs-period-select {
    appearance: none; -webkit-appearance: none;
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px; padding: 5px 28px 5px 11px;
    font-size: 12px; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; color: rgba(255,255,255,0.6);
    cursor: pointer; outline: none;
    font-family: var(--font-sans), sans-serif;
    transition: border-color 0.15s;
  }
  .rs-period-select:hover { border-color: rgba(255,255,255,0.2); }
  .rs-period-select:focus { border-color: rgba(179,0,0,0.5); }
  .rs-period-select option { background: #1a1a1a; font-weight: normal; }
  .rs-select-icon { position: absolute; right: 8px; pointer-events: none; color: rgba(255,255,255,0.3); }

  .rs-sub { font-size: 13px; color: rgba(255,255,255,0.25); font-style: italic; }
  .rs-meta { font-size: 11px; color: rgba(255,255,255,0.25); font-style: italic; }

  /* Locked badge */
  .rs-locked-badge {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 8px; border-radius: 20px; font-size: 11px;
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.3);
  }

  /* Download buttons */
  .rs-dl-btn {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 5px 12px; border-radius: 7px; border: none;
    font-size: 11.5px; font-family: var(--font-sans), sans-serif;
    font-weight: 600; cursor: pointer;
    transition: background 0.15s, transform 0.15s;
  }
  .rs-dl-btn:hover { transform: translateY(-1px); }
  .rs-dl-btn--html {
    background: rgba(0,140,200,0.1); color: rgba(80,180,240,0.9);
    border: 1px solid rgba(0,140,200,0.2);
  }
  .rs-dl-btn--html:hover { background: rgba(0,140,200,0.18); }
  .rs-dl-btn--xls {
    background: rgba(0,160,80,0.1); color: rgba(0,200,100,0.9);
    border: 1px solid rgba(0,160,80,0.2);
  }
  .rs-dl-btn--xls:hover { background: rgba(0,160,80,0.18); }

  /* ── Podium ── */
  .rs-podium { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; align-items: end; }
  .rs-podium-slot { display: flex; flex-direction: column; align-items: center; gap: 0; }
  .rs-podium-slot--empty { visibility: hidden; }
  .rs-podium-info {
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    padding: 12px 16px 10px; width: 100%;
    background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07);
    border-bottom: none; border-radius: 10px 10px 0 0;
  }
  .rs-podium-slot--1 .rs-podium-info { background: rgba(255,215,0,0.04); border-color: rgba(255,215,0,0.15); }
  .rs-podium-slot--2 .rs-podium-info { background: rgba(192,192,192,0.03); border-color: rgba(192,192,192,0.1); }
  .rs-podium-slot--3 .rs-podium-info { background: rgba(205,127,50,0.03); border-color: rgba(205,127,50,0.1); }
  .rs-podium-slot--mine .rs-podium-info { border-color: rgba(179,0,0,0.3); }
  .rs-podium-rank { font-size: 11px; font-weight: 800; letter-spacing: 0.08em; }
  .rs-podium-name { font-size: 15px; font-weight: 700; color: #fff; letter-spacing: 0.06em; }
  .rs-podium-score { font-size: 22px; font-weight: 300; color: rgba(255,255,255,0.9); letter-spacing: -0.02em; line-height: 1; margin-top: 4px; }
  .rs-podium-pct { font-size: 11px; color: rgba(255,255,255,0.3); }
  .rs-podium-base { width: 100%; border: 1px solid; border-top: none; border-radius: 0 0 8px 8px; opacity: 0.15; background: currentColor; }

  /* ── Table ── */
  .rs-table-wrap {
    overflow: auto; border-radius: 12px; border: 1px solid rgba(255,255,255,0.06);
    background: rgba(255,255,255,0.015);
    scrollbar-width: thin; scrollbar-color: rgba(179,0,0,0.15) transparent;
  }
  .rs-table-wrap::-webkit-scrollbar { width: 4px; }
  .rs-table-wrap::-webkit-scrollbar-thumb { background: rgba(179,0,0,0.15); border-radius: 4px; }
  .rs-table { width: 100%; border-collapse: collapse; }
  .rs-th {
    padding: 10px 14px; text-align: left;
    font-size: 10px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase;
    color: rgba(255,255,255,0.25); border-bottom: 1px solid rgba(255,255,255,0.06);
    white-space: nowrap; position: sticky; top: 0; background: #0e0e0e; z-index: 1;
  }
  .th-rank { width: 44px; text-align: center; }
  .th-bar  { min-width: 160px; }
  .th-score, .th-pct { width: 80px; text-align: right; }
  .th-count { width: 90px; text-align: center; }
  .th-expand { width: 32px; }
  .rs-tr { border-bottom: 1px solid rgba(255,255,255,0.04); cursor: pointer; transition: background 0.1s; }
  .rs-tr:hover { background: rgba(255,255,255,0.03); }
  .rs-tr--mine { background: rgba(179,0,0,0.04); }
  .rs-tr--mine:hover { background: rgba(179,0,0,0.07); }
  .rs-tr--locked { cursor: default; }
  .rs-tr--locked:hover { background: transparent; }
  .rs-tr--expanded { background: rgba(255,255,255,0.03); }
  .rs-tr:last-child:not(.rs-detail-row) { border-bottom: none; }
  .rs-td { padding: 12px 14px; vertical-align: middle; }
  .td-rank { text-align: center; }
  .rs-rank-num { font-size: 14px; font-weight: 700; }
  .rs-rank-dash { color: rgba(255,255,255,0.2); font-size: 13px; }
  .td-dept { white-space: nowrap; }
  .rs-dept-name { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.7); letter-spacing: 0.04em; }
  .rs-dept-name--mine { color: #B30000; }
  .rs-you {
    display: inline-block; margin-left: 6px; font-size: 9px; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; padding: 1px 6px; border-radius: 4px;
    background: rgba(179,0,0,0.15); color: rgba(179,0,0,0.9);
    border: 1px solid rgba(179,0,0,0.2); vertical-align: middle;
  }
  .td-bar { min-width: 160px; padding-right: 8px; }
  .rs-bar-track { height: 5px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden; }
  .rs-bar-fill { height: 100%; border-radius: 3px; transition: width 0.5s cubic-bezier(0.34,1.56,0.64,1); box-shadow: 0 0 6px rgba(179,0,0,0.4); }
  .td-score { text-align: right; }
  .rs-score-val { font-size: 15px; font-weight: 300; letter-spacing: -0.01em; }
  .td-pct { text-align: right; }
  .rs-pct-val { font-size: 11px; color: rgba(255,255,255,0.3); }
  .td-count { text-align: center; white-space: nowrap; }
  .rs-count { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.5); }
  .rs-count--full { color: #4ade80; }
  .rs-count-total { font-size: 12px; color: rgba(255,255,255,0.25); }
  .td-expand { text-align: center; }
  .rs-chevron { color: rgba(255,255,255,0.2); transition: transform 0.15s; }
  .rs-chevron--open { color: rgba(179,0,0,0.6); }

  /* ── Expanded detail ── */
  .rs-detail-row { background: rgba(255,255,255,0.01); }
  .rs-detail-cell { padding: 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
  .rs-detail-inner { padding: 14px 20px 16px 56px; border-top: 1px solid rgba(255,255,255,0.04); background: rgba(0,0,0,0.15); }
  .rs-detail-empty { font-size: 12px; color: rgba(255,255,255,0.25); font-style: italic; }
  .rs-detail-table { width: 100%; border-collapse: collapse; }
  .rs-dth { padding: 6px 10px; text-align: left; font-size: 9px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.2); border-bottom: 1px solid rgba(255,255,255,0.05); white-space: nowrap; }
  .dth-raw, .dth-weighted { text-align: right; }
  .dth-bar { min-width: 100px; }
  .rs-dtr { border-bottom: 1px solid rgba(255,255,255,0.03); }
  .rs-dtr:last-child { border-bottom: none; }
  .rs-dtd { padding: 7px 10px; font-size: 12px; color: rgba(255,255,255,0.6); vertical-align: middle; }
  .dtd-code { color: rgba(179,0,0,0.7); font-size: 10px; font-weight: 600; font-family: monospace; white-space: nowrap; }
  .dtd-raw, .dtd-weighted { text-align: right; }
  .rs-weighted-val { color: rgba(179,0,0,0.8); font-weight: 600; }
  .rs-dbar-track { height: 3px; background: rgba(255,255,255,0.05); border-radius: 2px; overflow: hidden; }
  .rs-dbar-fill { height: 100%; background: rgba(179,0,0,0.5); border-radius: 2px; transition: width 0.4s ease; }
  .rs-dbar-fill--auto { background: rgba(139,92,246,0.6); }
  .rs-auto-badge {
    display: inline-block; margin-left: 6px; font-size: 8px; font-weight: 700; letter-spacing: 0.07em;
    text-transform: uppercase; padding: 1px 5px; border-radius: 3px; vertical-align: middle;
    background: rgba(139,92,246,0.15); color: rgba(167,139,250,0.9);
    border: 1px solid rgba(139,92,246,0.25);
  }
  .rs-dfoot { border-top: 1px solid rgba(255,255,255,0.06); }
  .rs-dfoot-label { padding: 8px 10px; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.25); text-align: right; }
  .rs-dfoot-val { padding: 8px 10px; text-align: right; font-size: 15px; font-weight: 300; color: #B30000; }
  .rs-dfoot-max { font-size: 11px; color: rgba(255,255,255,0.2); }

  /* ── Light mode ── */
  [data-theme="light"] .rs-empty { color: rgba(0,0,0,0.3); }
  [data-theme="light"] .rs-period-select { background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.12); color: rgba(0,0,0,0.65); }
  [data-theme="light"] .rs-period-select option { background: #fff; }
  [data-theme="light"] .rs-select-icon { color: rgba(0,0,0,0.3); }
  [data-theme="light"] .rs-sub { color: rgba(0,0,0,0.3); }
  [data-theme="light"] .rs-meta { color: rgba(0,0,0,0.3); }
  [data-theme="light"] .rs-locked-badge { background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.08); color: rgba(0,0,0,0.3); }
  [data-theme="light"] .rs-dl-btn--html { background: rgba(0,120,180,0.07); color: rgba(0,100,160,0.9); border-color: rgba(0,120,180,0.18); }
  [data-theme="light"] .rs-dl-btn--xls  { background: rgba(0,130,60,0.07);  color: rgba(0,110,50,0.9);  border-color: rgba(0,130,60,0.18);  }
  [data-theme="light"] .rs-podium-info { background: rgba(0,0,0,0.02); border-color: rgba(0,0,0,0.08); }
  [data-theme="light"] .rs-podium-name { color: #1a1a1a; }
  [data-theme="light"] .rs-podium-score { color: rgba(0,0,0,0.75); }
  [data-theme="light"] .rs-podium-pct { color: rgba(0,0,0,0.3); }
  [data-theme="light"] .rs-table-wrap { background: #fff; border-color: rgba(0,0,0,0.08); }
  [data-theme="light"] .rs-th { background: #f5f5f5; color: rgba(0,0,0,0.35); border-bottom-color: rgba(0,0,0,0.07); }
  [data-theme="light"] .rs-tr { border-bottom-color: rgba(0,0,0,0.05); }
  [data-theme="light"] .rs-tr:hover { background: rgba(0,0,0,0.02); }
  [data-theme="light"] .rs-tr--expanded { background: rgba(0,0,0,0.02); }
  [data-theme="light"] .rs-td { color: rgba(0,0,0,0.7); }
  [data-theme="light"] .rs-rank-dash { color: rgba(0,0,0,0.2); }
  [data-theme="light"] .rs-dept-name { color: rgba(0,0,0,0.7); }
  [data-theme="light"] .rs-bar-track { background: rgba(0,0,0,0.09); }
  [data-theme="light"] .rs-score-val { color: #1a1a1a; }
  [data-theme="light"] .rs-pct-val { color: rgba(0,0,0,0.35); }
  [data-theme="light"] .rs-count { color: rgba(0,0,0,0.55); }
  [data-theme="light"] .rs-count-total { color: rgba(0,0,0,0.3); }
  [data-theme="light"] .rs-chevron { color: rgba(0,0,0,0.2); }
  [data-theme="light"] .rs-detail-row { background: rgba(0,0,0,0.01); }
  [data-theme="light"] .rs-detail-cell { border-bottom-color: rgba(0,0,0,0.07); }
  [data-theme="light"] .rs-detail-inner { background: rgba(0,0,0,0.025); border-top-color: rgba(0,0,0,0.05); }
  [data-theme="light"] .rs-detail-empty { color: rgba(0,0,0,0.3); }
  [data-theme="light"] .rs-dth { color: rgba(0,0,0,0.3); border-bottom-color: rgba(0,0,0,0.07); }
  [data-theme="light"] .rs-dtr { border-bottom-color: rgba(0,0,0,0.04); }
  [data-theme="light"] .rs-dtd { color: rgba(0,0,0,0.6); }
  [data-theme="light"] .rs-dbar-track { background: rgba(0,0,0,0.07); }
  [data-theme="light"] .rs-dfoot { border-top-color: rgba(0,0,0,0.07); }
  [data-theme="light"] .rs-dfoot-label { color: rgba(0,0,0,0.3); }
  [data-theme="light"] .rs-dfoot-max { color: rgba(0,0,0,0.25); }
`;
