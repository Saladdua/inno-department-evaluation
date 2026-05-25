"use client";

import { Fragment, useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Table2,
  Lock,
  Upload,
  X,
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
  region: string | null;
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
  activeYear: number;
  activeQuarter: number | null;
  years: number[];
  periods: PeriodOption[];
  results: DeptResult[];
  criteria: CriterionInfo[];
  maxScore: number;
  totalSubmitted: number;
  canManageAll: boolean;
  myRegion?: string | null;
  periodId: string | null;
  initialOverrides: Record<string, Record<string, number>>;
}

function fmt(n: number | null, decimals = 2) {
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
  activeYear,
  activeQuarter,
  years,
  periods,
  results,
  criteria,
  maxScore,
  totalSubmitted,
  canManageAll,
  myRegion = null,
  periodId,
  initialOverrides,
}: Props) {
  const router = useRouter();

  // ── Import state ──────────────────────────────────────
  type ImportRow = { csvName: string; score: number; deptId: string | null; deptName: string | null }
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importRegion, setImportRegion] = useState<'Miền Bắc' | 'Miền Nam'>('Miền Bắc')
  const [importPreview, setImportPreview] = useState<ImportRow[]>([])
  const [importedOverrides, setImportedOverrides] = useState<Record<string, Record<string, number>>>(initialOverrides)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    setImportedOverrides(initialOverrides)
  }, [periodId])

  function normKey(s: string) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
  }

  // Proper quoted-field CSV splitter
  function splitCSVLine(line: string, sep: string): string[] {
    const cols: string[] = []
    let cur = '', inQ = false
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ }
      else if (ch === sep && !inQ) { cols.push(cur.trim()); cur = '' }
      else { cur += ch }
    }
    cols.push(cur.trim())
    return cols
  }

  function parseCSVRows(text: string) {
    const sep = text.includes(';') ? ';' : ','
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    if (lines.length < 2) return []
    const header = splitCSVLine(lines[0], sep).map(h => h.replace(/^"|"$/g, ''))
    const deptIdx = header.findIndex(h => normKey(h).includes('phong') || normKey(h) === 'dept')
    const scoreIdx = header.findIndex(h => normKey(h).includes('diem') || normKey(h) === 'score')
    if (deptIdx === -1 || scoreIdx === -1) return []
    return lines.slice(1).flatMap(line => {
      const cols = splitCSVLine(line, sep).map(c => c.replace(/^"|"$/g, ''))
      const name = cols[deptIdx]?.trim()
      let rawScore = (cols[scoreIdx] ?? '').replace(',', '.')
      // If score has no decimal but extra columns exist, it may be a comma-decimal split:
      // e.g. "69,22" with comma sep → cols[scoreIdx]="69", cols[scoreIdx+1]="22"
      if (!rawScore.includes('.') && cols.length > header.length) {
        const frac = cols[scoreIdx + 1]?.trim()
        if (frac && /^\d{1,2}$/.test(frac)) rawScore = rawScore + '.' + frac
      }
      const score = parseFloat(rawScore)
      if (!name || isNaN(score)) return []
      return [{ deptName: name, score }]
    })
  }

  function matchDeptFromCSV(csvName: string, pool: DeptResult[]): DeptResult | null {
    const key = normKey(csvName)
    if (!key) return null
    return pool.find(r => normKey(r.code ?? '') === key || normKey(r.name) === key)
      ?? pool.find(r => { const rc = normKey(r.code ?? ''); return rc && (rc.startsWith(key) || key.startsWith(rc)) })
      ?? null
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const rows = parseCSVRows(text)
      const pool = results.filter(r => (r.region ?? 'Miền Bắc') === importRegion)
      setImportPreview(rows.map(row => {
        const match = matchDeptFromCSV(row.deptName, pool)
        return { csvName: row.deptName, score: row.score, deptId: match?.id ?? null, deptName: match ? (match.code ?? match.name) : null }
      }))
    }
    reader.readAsText(file, 'UTF-8')
  }

  async function handleConfirmImport() {
    const override: Record<string, number> = {}
    importPreview.forEach(r => {
      if (r.deptId) override[r.deptId] = Math.round(r.score * 100) / 100
    })
    setImportedOverrides(prev => ({ ...prev, [importRegion]: override }))
    setShowImportModal(false)
    setImportPreview([])
    if (fileInputRef.current) fileInputRef.current.value = ''

    if (periodId) {
      setIsSaving(true)
      try {
        await fetch('/api/results/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            period_id: periodId,
            region: importRegion,
            overrides: Object.entries(override).map(([dept_id, score]) => ({ dept_id, score })),
          }),
        })
      } finally {
        setIsSaving(false)
      }
    }
  }

  function openImportModal() {
    setImportRegion((myRegion as 'Miền Bắc' | 'Miền Nam') ?? regionFilter)
    setImportPreview([])
    if (fileInputRef.current) fileInputRef.current.value = ''
    setShowImportModal(true)
  }

  const [regionFilter, setRegionFilter] = useState<'Miền Bắc' | 'Miền Nam'>(
    (myRegion as 'Miền Bắc' | 'Miền Nam') ?? 'Miền Bắc'
  );

  useEffect(() => {
    if (myRegion) return;
    const saved = localStorage.getItem('region_filter') as 'Miền Bắc' | 'Miền Nam' | null;
    if (saved === 'Miền Bắc' || saved === 'Miền Nam') setRegionFilter(saved);
  }, [myRegion]);

  useEffect(() => {
    if (myRegion) return;
    localStorage.setItem('region_filter', regionFilter);
  }, [regionFilter, myRegion]);

  const displayResults = useMemo(() => {
    const myDeptRegion = results.find(r => r.isMyDept)?.region ?? null;
    const filtered = canManageAll
      ? results.filter(r => (r.region ?? 'Miền Bắc') === regionFilter)
      : myDeptRegion
        ? results.filter(r => (r.region ?? 'Miền Bắc') === myDeptRegion)
        : results;
    const overrides = importedOverrides[regionFilter] ?? {}
    const base = Object.keys(overrides).length > 0
      ? filtered.map(r => overrides[r.id] !== undefined ? { ...r, avgScore: overrides[r.id] } : r)
      : filtered
    const withRanks = base.map(r => ({ ...r }));
    let rank = 1;
    withRanks
      .filter(r => r.avgScore != null)
      .sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0))
      .forEach(r => { r.rank = rank++; });
    return withRanks.sort((a, b) => {
      if (a.avgScore != null && b.avgScore != null) return a.rank - b.rank;
      if (a.avgScore != null) return -1;
      if (b.avgScore != null) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [results, regionFilter, canManageAll, importedOverrides]);

  const ranked = displayResults.filter((r) => r.avgScore != null);
  const unranked = displayResults.filter((r) => r.avgScore == null);
  const tableRows = [...ranked.filter(r => r.rank > 3), ...unranked];

  const quartersForYear = periods
    .filter(p => p.year === activeYear)
    .map(p => p.quarter)
    .sort((a, b) => a - b);

  function handleYearChange(e: React.ChangeEvent<HTMLSelectElement>) {
    router.push(`/dashboard/results?year=${e.target.value}`);
  }

  function handleQuarterChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const q = e.target.value;
    if (q === '') {
      router.push(`/dashboard/results?year=${activeYear}`);
    } else {
      router.push(`/dashboard/results?year=${activeYear}&quarter=${q}`);
    }
  }

  function handleDownloadHTML() {
    const html = generateHTML(
      displayResults,
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
    const xls = generateXLS(displayResults, criteria, periodLabel, maxScore);
    const slug = periodLabel.replace(/[\s·]+/g, "_");
    triggerDownload(
      xls,
      `ket_qua_${slug}.xls`,
      "application/vnd.ms-excel;charset=utf-8",
    );
  }

  const medalColors: Record<number, string> = { 1: "#C8A84B", 2: "#9EB5C8", 3: "#C8956C" };
  const blockH:  Record<number, number>     = { 1: 88, 2: 64, 3: 52 };

  return (
    <>
    <div className="rs-root">
      {/* ── Header ── */}
      <div className="rs-header">
        <div className="rs-header-left">
          <div className="rs-filter-group">
            <div className="rs-period-select-wrap">
              <select
                className="rs-period-select"
                value={activeYear}
                onChange={handleYearChange}
              >
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <ChevronDown size={12} className="rs-select-icon" />
            </div>
            <div className="rs-period-select-wrap">
              <select
                className="rs-period-select"
                value={activeQuarter ?? ""}
                onChange={handleQuarterChange}
              >
                <option value="">Cả năm</option>
                {quartersForYear.map((q) => (
                  <option key={q} value={q}>Quý {q}</option>
                ))}
              </select>
              <ChevronDown size={12} className="rs-select-icon" />
            </div>
          </div>
          {canManageAll && (
            <div className="rs-region-tabs">
              {(["Miền Bắc", "Miền Nam"] as const).map(r => (
                <button
                  key={r}
                  className={`rs-region-tab${regionFilter === r ? " rs-region-tab--active" : ""}`}
                  onClick={() => setRegionFilter(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
          {activeQuarter !== null && periodStatus === "closed" && (
            <span className="rs-locked-badge"><Lock size={10} /> Đã tổng kết</span>
          )}
        </div>
        <div className="rs-header-right">
          {canManageAll && periodId !== null && (
            <button className="rs-dl-btn rs-import-btn" onClick={openImportModal} disabled={isSaving}>
              <Upload size={13} /> {isSaving ? 'Đang lưu…' : 'Nhập CSV'}
            </button>
          )}
          {(canManageAll || periodStatus === "closed") && results.length > 0 && (
            <button className="rs-dl-btn rs-dl-btn--xls" onClick={handleDownloadXLS} title="Tải Excel">
              <Table2 size={13} /> Excel
            </button>
          )}
        </div>
      </div>

      {/* ── Empty state ── */}
      {displayResults.length === 0 && (
        <div className="rs-empty">{canManageAll ? `Không có phòng ban nào thuộc ${regionFilter}.` : 'Chưa có dữ liệu đánh giá nào được nộp trong kỳ này.'}</div>
      )}

      {/* ── Podium (top 3) ── */}
      {ranked.length >= 1 && (
        <div className="rs-podium-section">
          <div className="rs-section-label">Top Phòng Ban</div>
          <div className="rs-podium">
            {([1, 0, 2] as const).map((idx) => {
              const r = ranked[idx];
              const place = idx + 1;
              const color = medalColors[place];
              if (!r) return <div key={idx} className="rs-podium-slot rs-podium-slot--empty" />;
              return (
                <div key={r.id} className={`rs-podium-slot rs-podium-slot--${place}${r.isMyDept ? " rs-podium-mine" : ""}`}>
                  <div className="rs-pm-card" style={{ "--mc": color } as React.CSSProperties}>
                    <div className={`rs-pm-rank-badge rs-pm-rank-badge--${place}`}>{place}</div>
                    <span className="rs-pm-code">{r.code ?? r.name}</span>
                    <span className="rs-pm-score" style={{ color }}>{fmt(r.avgScore)}</span>
                  </div>
                  <div
                    className="rs-pm-block"
                    style={{ height: blockH[place], borderColor: color, boxShadow: `0 4px 32px ${color}22` }}
                  >
                    <span className="rs-pm-num" style={{ color }}>{place}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Rankings 4+ ── */}
      {tableRows.length > 0 && (
        <div className="rs-list-section">
          {ranked.length > 3 && (
            <div className="rs-section-label">Bảng Xếp Hạng</div>
          )}
          <div className="rs-list">
            {tableRows.map((r, i) => {
              const barPct = pct(r.avgScore, maxScore);
              return (
                <div
                  key={r.id}
                  className={`rs-row${r.isMyDept ? " rs-row--mine" : ""}${r.avgScore == null ? " rs-row--unranked" : ""}`}
                  style={{ animationDelay: `${0.04 + i * 0.03}s` } as React.CSSProperties}
                >
                  <span className="rs-row-rank">{r.avgScore != null ? r.rank : "—"}</span>
                  <div className="rs-row-mid">
                    <div className="rs-row-top">
                      <span className="rs-row-code">{r.code ?? r.name}</span>
                      {r.isMyDept && <span className="rs-you-tag">bạn</span>}
                    </div>
                    <div className="rs-bar-track">
                      <div className="rs-bar-fill" style={{ width: `${barPct.toFixed(1)}%` }} />
                    </div>
                  </div>
                  <div className="rs-row-score-col">
                    <span className="rs-row-score">{fmt(r.avgScore)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{rsStyles}</style>
    </div>

      {/* ── Import Modal (outside rs-root to avoid transform stacking context) ── */}
      {showImportModal && (
        <div className="rs-modal-overlay" onClick={() => setShowImportModal(false)}>
          <div className="rs-modal" onClick={e => e.stopPropagation()}>
            <div className="rs-modal-header">
              <span className="rs-modal-title">Nhập kết quả từ CSV</span>
              <button className="rs-modal-close" onClick={() => setShowImportModal(false)}><X size={16} /></button>
            </div>
            <div className="rs-modal-body">
              <div className="rs-modal-region-tabs">
                {(['Miền Bắc', 'Miền Nam'] as const).map(r => (
                  <button
                    key={r}
                    className={`rs-modal-region-tab${importRegion === r ? ' rs-modal-region-tab--active' : ''}`}
                    onClick={() => { setImportRegion(r); setImportPreview([]); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <p className="rs-modal-period-info">Kỳ: <strong>{periodLabel}</strong></p>
              <label className="rs-modal-file-label">
                <Upload size={14} />
                <span>Chọn file CSV…</span>
                <input ref={fileInputRef} type="file" accept=".csv" className="rs-modal-file-input" onChange={handleFileChange} />
              </label>
              <p className="rs-modal-hint">CSV cần cột <code>Phòng ban</code> và <code>điểm</code></p>
              {importPreview.length > 0 && (
                <div className="rs-modal-preview">
                  <div className="rs-modal-preview-title">
                    {importPreview.length} dòng &mdash; {importPreview.filter(r => r.deptId).length} khớp
                  </div>
                  <div className="rs-modal-table-wrap">
                    <table className="rs-modal-table">
                      <thead>
                        <tr><th>Tên trong CSV</th><th>Phòng ban khớp</th><th>Điểm</th></tr>
                      </thead>
                      <tbody>
                        {importPreview.map((row, i) => (
                          <tr key={i} className={row.deptId ? '' : 'rs-modal-row--unmatched'}>
                            <td>{row.csvName}</td>
                            <td>{row.deptName ?? <span className="rs-modal-no-match">Không tìm thấy</span>}</td>
                            <td className="rs-modal-score-cell">{(Math.round(row.score * 100) / 100).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="rs-modal-footer">
              <button className="rs-modal-cancel" onClick={() => setShowImportModal(false)}>Huỷ</button>
              <button
                className="rs-modal-confirm"
                onClick={handleConfirmImport}
                disabled={importPreview.filter(r => r.deptId).length === 0}
              >
                Áp dụng ({importPreview.filter(r => r.deptId).length})
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}

const rsStyles = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,700&display=swap');

  .rs-root { display: flex; flex-direction: column; gap: 0; font-family: 'DM Sans', sans-serif; animation: rsFade 0.3s ease both; }
  @keyframes rsFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  .rs-empty { color: rgba(255,255,255,0.2); font-size: 13px; padding: 64px 0; text-align: center; font-family: 'DM Sans', sans-serif; }

  /* ── Header ── */
  .rs-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 36px; }
  .rs-header-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .rs-header-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .rs-filter-group { display: flex; align-items: center; gap: 6px; }
  .rs-period-select-wrap { position: relative; display: flex; align-items: center; }
  .rs-period-select {
    appearance: none; -webkit-appearance: none;
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px; padding: 5px 28px 5px 11px;
    font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
    color: rgba(255,255,255,0.6); cursor: pointer; outline: none; transition: border-color 0.15s;
    font-family: var(--font-sans), sans-serif;
  }
  .rs-period-select:hover { border-color: rgba(255,255,255,0.2); }
  .rs-period-select:focus { border-color: rgba(179,0,0,0.5); }
  .rs-period-select option { background: #1a1a1a; font-weight: normal; }
  .rs-select-icon { position: absolute; right: 8px; pointer-events: none; color: rgba(255,255,255,0.3); }
  .rs-locked-badge {
    display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 20px;
    font-size: 11px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.3);
  }
  .rs-dl-btn {
    display: inline-flex; align-items: center; gap: 5px; padding: 5px 12px; border-radius: 7px; border: none;
    font-size: 11.5px; font-family: var(--font-sans), sans-serif; font-weight: 600;
    cursor: pointer; transition: background 0.15s, transform 0.15s;
  }
  .rs-dl-btn:hover { transform: translateY(-1px); }
  .rs-dl-btn--xls { background: rgba(0,160,80,0.1); color: rgba(0,200,100,0.9); border: 1px solid rgba(0,160,80,0.2); }
  .rs-dl-btn--xls:hover { background: rgba(0,160,80,0.18); }

  /* ── Region tabs ── */
  .rs-region-tabs { display: flex; align-items: center; gap: 2px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 3px; }
  .rs-region-tab {
    padding: 3px 11px; border-radius: 5px; border: none; cursor: pointer;
    font-size: 11px; font-weight: 700; letter-spacing: 0.06em;
    background: transparent; color: rgba(255,255,255,0.35);
    font-family: var(--font-sans), sans-serif;
    transition: background 0.15s, color 0.15s;
  }
  .rs-region-tab:hover { color: rgba(255,255,255,0.6); background: rgba(255,255,255,0.05); }
  .rs-region-tab--active { background: #B30000; color: #fff; }
  .rs-region-tab--active:hover { background: #cc0000; color: #fff; }
  [data-theme="light"] .rs-region-tabs { background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.1); }
  [data-theme="light"] .rs-region-tab { color: rgba(0,0,0,0.4); }
  [data-theme="light"] .rs-region-tab:hover { color: rgba(0,0,0,0.65); background: rgba(0,0,0,0.05); }
  [data-theme="light"] .rs-region-tab--active { background: #B30000; color: #fff; }

  /* ── Section label ── */
  .rs-section-label {
    font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 700;
    letter-spacing: 0.22em; text-transform: uppercase; color: rgba(255,255,255,0.4);
    padding-left: 14px; border-left: 3px solid #CC0000; margin-bottom: 20px; line-height: 1.2;
  }

  /* ── Podium ── */
  .rs-podium-section { margin-bottom: 40px; }
  .rs-podium { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; align-items: end; }
  .rs-podium-slot { display: flex; flex-direction: column; align-items: center; }
  .rs-podium-slot--empty { visibility: hidden; }
  .rs-pm-card {
    width: 100%; padding: 22px 16px 18px; text-align: center;
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    border: 1px solid rgba(255,255,255,0.06); border-top-width: 3px; border-bottom: none;
    border-top-color: var(--mc, rgba(255,255,255,0.1)); border-radius: 0; margin-bottom: -1px;
    background: rgba(255,255,255,0.02); position: relative; overflow: hidden;
  }
  .rs-pm-card::before { display: none; }
  .rs-pm-card::after {
    content: ''; position: absolute; inset: 0; pointer-events: none;
    background-image: repeating-linear-gradient(0deg, transparent, transparent 15px, rgba(255,255,255,0.012) 15px, rgba(255,255,255,0.012) 16px);
  }
  .rs-podium-slot--1 .rs-pm-card { border-color: rgba(200,168,75,0.15); border-top-color: #C8A84B; background: linear-gradient(180deg, rgba(200,168,75,0.07) 0%, rgba(0,0,0,0) 50%); }
  .rs-podium-slot--2 .rs-pm-card { border-color: rgba(158,181,200,0.1); border-top-color: #9EB5C8; background: linear-gradient(180deg, rgba(158,181,200,0.05) 0%, rgba(0,0,0,0) 50%); }
  .rs-podium-slot--3 .rs-pm-card { border-color: rgba(200,149,108,0.1); border-top-color: #C8956C; background: linear-gradient(180deg, rgba(200,149,108,0.05) 0%, rgba(0,0,0,0) 50%); }
  .rs-podium-mine .rs-pm-card { border-top-color: #CC0000; }
  .rs-pm-rank-badge {
    width: 46px; height: 46px; border-radius: 50%; border: 2px solid;
    display: flex; align-items: center; justify-content: center;
    font-family: 'Barlow Condensed', sans-serif; font-size: 22px; font-weight: 800;
    margin-bottom: 10px; position: relative; z-index: 1; letter-spacing: 0.02em;
  }
  .rs-pm-rank-badge--1 { color: #C8A84B; border-color: rgba(200,168,75,0.55); background: rgba(200,168,75,0.08); box-shadow: 0 0 18px rgba(200,168,75,0.18); }
  .rs-pm-rank-badge--2 { color: #9EB5C8; border-color: rgba(158,181,200,0.45); background: rgba(158,181,200,0.06); }
  .rs-pm-rank-badge--3 { color: #C8956C; border-color: rgba(200,149,108,0.45); background: rgba(200,149,108,0.06); }
  .rs-pm-code { font-family: 'Barlow Condensed', sans-serif; font-size: 28px; font-weight: 800; color: #fff; letter-spacing: 0.06em; line-height: 1; text-transform: uppercase; position: relative; z-index: 1; }
  .rs-pm-score { font-family: 'Barlow Condensed', sans-serif; font-size: 34px; font-weight: 800; letter-spacing: 0.01em; line-height: 1; margin-top: 12px; position: relative; z-index: 1; }
  .rs-pm-block {
    width: 100%; border: 1px solid rgba(255,255,255,0.06); border-top: none; border-radius: 0;
    background: #080A0B; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden;
  }
  .rs-pm-block::before {
    content: ''; position: absolute; inset: 0; pointer-events: none;
    background-image: repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.01) 3px, rgba(255,255,255,0.01) 4px);
  }
  .rs-pm-num { font-family: 'Barlow Condensed', sans-serif; font-size: 40px; font-weight: 800; opacity: 0.1; line-height: 1; letter-spacing: 0.04em; position: relative; z-index: 1; color: #fff; }
  .rs-podium-slot--1 .rs-pm-num { color: #C8A84B; opacity: 0.18; }
  .rs-podium-slot--2 .rs-pm-num { color: #9EB5C8; opacity: 0.16; }
  .rs-podium-slot--3 .rs-pm-num { color: #C8956C; opacity: 0.16; }

  /* ── List ── */
  .rs-list-section { display: flex; flex-direction: column; gap: 16px; }
  .rs-list { display: flex; flex-direction: column; border: 1px solid rgba(255,255,255,0.06); background: transparent; overflow: hidden; }
  .rs-row {
    display: flex; align-items: stretch; position: relative;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    transition: background 0.1s; animation: rowSlide 0.35s ease both;
  }
  .rs-row:last-child { border-bottom: none; }
  .rs-row::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: transparent; transition: background 0.15s; }
  .rs-row:hover { background: rgba(255,255,255,0.02); }
  .rs-row--mine { background: rgba(204,0,0,0.04); }
  .rs-row--mine::before { background: #CC0000; }
  .rs-row--mine:hover { background: rgba(204,0,0,0.07); }
  .rs-row--unranked { opacity: 0.45; }
  @keyframes rowSlide { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
  .rs-row-rank {
    font-family: 'Barlow Condensed', sans-serif; font-size: 14px; font-weight: 700;
    color: rgba(255,255,255,0.2); width: 52px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    letter-spacing: 0.04em; border-right: 1px solid rgba(255,255,255,0.04);
    background: rgba(255,255,255,0.01);
  }
  .rs-row-mid { flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 14px 16px 11px; }
  .rs-row-top { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .rs-row-code { font-family: 'DM Sans', sans-serif; font-size: 15px; font-weight: 700; color: rgba(255,255,255,0.82); letter-spacing: 0.02em; }
  .rs-you-tag {
    display: inline-block; font-size: 8px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
    padding: 2px 6px; background: rgba(204,0,0,0.14); color: rgba(240,60,60,0.9);
    border: 1px solid rgba(204,0,0,0.25); border-radius: 0; vertical-align: middle; font-family: 'DM Sans', sans-serif;
  }
  .rs-bar-track { height: 6px; background: rgba(255,255,255,0.05); overflow: hidden; }
  .rs-bar-fill { height: 100%; background: #CC0000; transition: width 0.85s cubic-bezier(0.34,1.1,0.64,1); }
  .rs-row-score-col {
    display: flex; flex-direction: column; align-items: flex-end; justify-content: center; gap: 2px;
    flex-shrink: 0; padding: 14px 20px 11px 16px; min-width: 80px;
    border-left: 1px solid rgba(255,255,255,0.04);
  }
  .rs-row-score { font-family: 'Barlow Condensed', sans-serif; font-size: 20px; font-weight: 800; color: rgba(255,255,255,0.8); letter-spacing: 0.02em; line-height: 1; }

  /* ── Light mode ── */
  [data-theme="light"] .rs-root { font-family: 'DM Sans', sans-serif; }
  [data-theme="light"] .rs-empty { color: rgba(0,0,0,0.3); }
  [data-theme="light"] .rs-period-select { background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.12); color: rgba(0,0,0,0.65); }
  [data-theme="light"] .rs-period-select option { background: #fff; }
  [data-theme="light"] .rs-select-icon { color: rgba(0,0,0,0.3); }
  [data-theme="light"] .rs-locked-badge { background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.08); color: rgba(0,0,0,0.3); }
  [data-theme="light"] .rs-dl-btn--xls { background: rgba(0,130,60,0.07); color: rgba(0,110,50,0.9); border-color: rgba(0,130,60,0.18); }
  [data-theme="light"] .rs-period-select { background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.12); color: rgba(0,0,0,0.65); }
  [data-theme="light"] .rs-period-select option { background: #fff; }
  [data-theme="light"] .rs-select-icon { color: rgba(0,0,0,0.3); }
  [data-theme="light"] .rs-section-label { color: rgba(0,0,0,0.35); }
  [data-theme="light"] .rs-pm-card { background: rgba(0,0,0,0.02); border-color: rgba(0,0,0,0.08); }
  [data-theme="light"] .rs-podium-slot--1 .rs-pm-card { background: rgba(200,168,75,0.06); }
  [data-theme="light"] .rs-podium-slot--2 .rs-pm-card { background: rgba(158,181,200,0.05); }
  [data-theme="light"] .rs-podium-slot--3 .rs-pm-card { background: rgba(200,149,108,0.05); }
  [data-theme="light"] .rs-pm-rank-badge--1 { border-color: rgba(180,140,0,0.5); background: rgba(200,168,75,0.08); }
  [data-theme="light"] .rs-pm-rank-badge--2 { border-color: rgba(120,150,175,0.45); background: rgba(158,181,200,0.07); }
  [data-theme="light"] .rs-pm-rank-badge--3 { border-color: rgba(170,110,80,0.45); background: rgba(200,149,108,0.07); }
  [data-theme="light"] .rs-pm-code { color: #111; }
  [data-theme="light"] .rs-pm-block { background: #f0f0f0; border-color: rgba(0,0,0,0.08); }
  [data-theme="light"] .rs-pm-num { color: #000; opacity: 0.12; }
  [data-theme="light"] .rs-list { border-color: rgba(0,0,0,0.08); }
  [data-theme="light"] .rs-row { border-bottom-color: rgba(0,0,0,0.05); }
  [data-theme="light"] .rs-row:hover { background: rgba(0,0,0,0.015); }
  [data-theme="light"] .rs-row--mine { background: rgba(204,0,0,0.03); }
  [data-theme="light"] .rs-row--mine:hover { background: rgba(204,0,0,0.06); }
  [data-theme="light"] .rs-row-rank { color: rgba(0,0,0,0.35); background: rgba(0,0,0,0.02); border-right-color: rgba(0,0,0,0.06); }
  [data-theme="light"] .rs-row-code { color: rgba(0,0,0,0.85); }
  [data-theme="light"] .rs-bar-track { background: rgba(0,0,0,0.07); }
  [data-theme="light"] .rs-row-score { color: rgba(0,0,0,0.78); }
  [data-theme="light"] .rs-row-score-col { border-left-color: rgba(0,0,0,0.06); }
  [data-theme="light"] .rs-section-label { color: rgba(0,0,0,0.55); }

  /* ── Import button & badge ── */
  .rs-import-btn { background: rgba(179,0,0,0.1); color: rgba(220,80,80,0.9); border: 1px solid rgba(179,0,0,0.22); }
  .rs-import-btn:hover { background: rgba(179,0,0,0.18); }
  [data-theme="light"] .rs-import-btn { background: rgba(179,0,0,0.07); color: rgba(160,0,0,0.9); border-color: rgba(179,0,0,0.18); }

  .rs-import-badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 3px 8px 3px 10px; border-radius: 20px;
    font-size: 11px; font-weight: 600; letter-spacing: 0.04em;
    background: rgba(179,0,0,0.12); border: 1px solid rgba(179,0,0,0.28); color: rgba(240,100,100,0.9);
    font-family: var(--font-sans), sans-serif;
  }
  .rs-import-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: #CC0000; flex-shrink: 0; }
  .rs-import-badge-clear {
    display: flex; align-items: center; justify-content: center;
    width: 16px; height: 16px; border-radius: 50%; border: none; cursor: pointer;
    background: rgba(255,255,255,0.08); color: rgba(240,100,100,0.7); padding: 0;
    transition: background 0.15s;
  }
  .rs-import-badge-clear:hover { background: rgba(255,255,255,0.16); color: #fff; }
  [data-theme="light"] .rs-import-badge { background: rgba(179,0,0,0.07); border-color: rgba(179,0,0,0.2); color: rgba(160,0,0,0.9); }
  [data-theme="light"] .rs-import-badge-clear { background: rgba(0,0,0,0.06); color: rgba(160,0,0,0.6); }

  /* ── Import Modal ── */
  .rs-modal-overlay {
    position: fixed; inset: 0; z-index: 1000;
    background: rgba(0,0,0,0.65); backdrop-filter: blur(3px);
    display: flex; align-items: center; justify-content: center; padding: 24px;
  }
  .rs-modal {
    background: #111; border: 1px solid rgba(255,255,255,0.1); border-radius: 14px;
    width: 100%; max-width: 520px; display: flex; flex-direction: column;
    box-shadow: 0 24px 64px rgba(0,0,0,0.7); animation: rsFade 0.2s ease both;
    font-family: var(--font-sans), sans-serif;
  }
  .rs-modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 20px 16px; border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .rs-modal-title { font-size: 14px; font-weight: 700; color: #fff; letter-spacing: 0.03em; }
  .rs-modal-close {
    display: flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; border-radius: 6px; border: none; cursor: pointer;
    background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.45);
    transition: background 0.15s, color 0.15s;
  }
  .rs-modal-close:hover { background: rgba(255,255,255,0.1); color: #fff; }

  .rs-modal-body { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; }

  .rs-modal-region-tabs { display: flex; gap: 4px; }
  .rs-modal-region-tab {
    padding: 5px 14px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1);
    font-size: 12px; font-weight: 700; letter-spacing: 0.06em; cursor: pointer;
    background: transparent; color: rgba(255,255,255,0.35);
    font-family: var(--font-sans), sans-serif; transition: background 0.15s, color 0.15s;
  }
  .rs-modal-region-tab:hover { color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.06); }
  .rs-modal-region-tab--active { background: #B30000; color: #fff; border-color: #B30000; }

  .rs-modal-period-info { font-size: 12px; color: rgba(255,255,255,0.4); }
  .rs-modal-period-info strong { color: rgba(255,255,255,0.75); }

  .rs-modal-file-label {
    display: inline-flex; align-items: center; gap: 8px; cursor: pointer;
    padding: 8px 14px; border-radius: 8px; border: 1px dashed rgba(255,255,255,0.2);
    font-size: 12px; color: rgba(255,255,255,0.5); transition: border-color 0.15s, color 0.15s;
    width: fit-content;
  }
  .rs-modal-file-label:hover { border-color: rgba(179,0,0,0.5); color: rgba(255,255,255,0.75); }
  .rs-modal-file-input { display: none; }
  .rs-modal-hint { font-size: 11px; color: rgba(255,255,255,0.25); }
  .rs-modal-hint code { background: rgba(255,255,255,0.07); padding: 1px 5px; border-radius: 4px; font-size: 11px; color: rgba(255,255,255,0.5); }

  .rs-modal-preview { display: flex; flex-direction: column; gap: 8px; }
  .rs-modal-preview-title { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.35); letter-spacing: 0.06em; text-transform: uppercase; }
  .rs-modal-table-wrap { max-height: 220px; overflow-y: auto; border: 1px solid rgba(255,255,255,0.07); border-radius: 8px; }
  .rs-modal-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .rs-modal-table thead th {
    padding: 7px 10px; text-align: left; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
    color: rgba(255,255,255,0.3); background: rgba(255,255,255,0.03); border-bottom: 1px solid rgba(255,255,255,0.07);
    position: sticky; top: 0;
  }
  .rs-modal-table tbody td { padding: 7px 10px; border-bottom: 1px solid rgba(255,255,255,0.04); color: rgba(255,255,255,0.72); }
  .rs-modal-table tbody tr:last-child td { border-bottom: none; }
  .rs-modal-row--unmatched td { opacity: 0.45; }
  .rs-modal-no-match { color: rgba(220,60,60,0.7); font-style: italic; }
  .rs-modal-score-cell { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; color: rgba(255,255,255,0.85); }

  .rs-modal-footer {
    display: flex; align-items: center; justify-content: flex-end; gap: 8px;
    padding: 14px 20px 18px; border-top: 1px solid rgba(255,255,255,0.07);
  }
  .rs-modal-cancel {
    padding: 7px 16px; border-radius: 7px; border: 1px solid rgba(255,255,255,0.1); cursor: pointer;
    font-size: 12px; font-weight: 600; background: transparent; color: rgba(255,255,255,0.45);
    font-family: var(--font-sans), sans-serif; transition: background 0.15s, color 0.15s;
  }
  .rs-modal-cancel:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.7); }
  .rs-modal-confirm {
    padding: 7px 16px; border-radius: 7px; border: none; cursor: pointer;
    font-size: 12px; font-weight: 700; background: #B30000; color: #fff;
    font-family: var(--font-sans), sans-serif; transition: background 0.15s, opacity 0.15s;
  }
  .rs-modal-confirm:hover:not(:disabled) { background: #cc0000; }
  .rs-modal-confirm:disabled { opacity: 0.35; cursor: not-allowed; }

  /* Light mode modal */
  [data-theme="light"] .rs-modal { background: #fff; border-color: rgba(0,0,0,0.12); box-shadow: 0 24px 64px rgba(0,0,0,0.18); }
  [data-theme="light"] .rs-modal-header { border-bottom-color: rgba(0,0,0,0.08); }
  [data-theme="light"] .rs-modal-title { color: #111; }
  [data-theme="light"] .rs-modal-close { background: rgba(0,0,0,0.04); color: rgba(0,0,0,0.4); }
  [data-theme="light"] .rs-modal-close:hover { background: rgba(0,0,0,0.09); color: #111; }
  [data-theme="light"] .rs-modal-region-tab { border-color: rgba(0,0,0,0.12); color: rgba(0,0,0,0.4); }
  [data-theme="light"] .rs-modal-region-tab:hover { color: rgba(0,0,0,0.7); background: rgba(0,0,0,0.05); }
  [data-theme="light"] .rs-modal-period-info { color: rgba(0,0,0,0.45); }
  [data-theme="light"] .rs-modal-period-info strong { color: rgba(0,0,0,0.8); }
  [data-theme="light"] .rs-modal-file-label { border-color: rgba(0,0,0,0.2); color: rgba(0,0,0,0.45); }
  [data-theme="light"] .rs-modal-file-label:hover { border-color: rgba(179,0,0,0.45); color: rgba(0,0,0,0.75); }
  [data-theme="light"] .rs-modal-hint { color: rgba(0,0,0,0.3); }
  [data-theme="light"] .rs-modal-hint code { background: rgba(0,0,0,0.06); color: rgba(0,0,0,0.55); }
  [data-theme="light"] .rs-modal-preview-title { color: rgba(0,0,0,0.35); }
  [data-theme="light"] .rs-modal-table-wrap { border-color: rgba(0,0,0,0.1); }
  [data-theme="light"] .rs-modal-table thead th { background: rgba(0,0,0,0.03); color: rgba(0,0,0,0.35); border-bottom-color: rgba(0,0,0,0.08); }
  [data-theme="light"] .rs-modal-table tbody td { color: rgba(0,0,0,0.8); border-bottom-color: rgba(0,0,0,0.05); }
  [data-theme="light"] .rs-modal-score-cell { color: rgba(0,0,0,0.85); }
  [data-theme="light"] .rs-modal-footer { border-top-color: rgba(0,0,0,0.08); }
  [data-theme="light"] .rs-modal-cancel { border-color: rgba(0,0,0,0.12); color: rgba(0,0,0,0.5); }
  [data-theme="light"] .rs-modal-cancel:hover { background: rgba(0,0,0,0.05); color: rgba(0,0,0,0.75); }
`;
