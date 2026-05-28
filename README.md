<p align="center">
  <img src="./docs/banner.png" alt="INNO Department Evaluation" width="100%" />
</p>

<h1 align="center">INNO Department Evaluation</h1>

<p align="center">
  Internal cross-department evaluation platform built for INNO JSC.<br/>
  Quarterly peer reviews, auto-scored KPIs, role-based dashboards, and full-period archiving.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
</p>

---

## Overview

INNO Department Evaluation manages quarterly cross-department performance reviews. Departments evaluate each other against weighted criteria, leadership reviews regional aggregate results, and super-admins archive completed periods into downloadable ZIP reports.

The system supports two geographic regions (**Miền Bắc / Miền Nam**) with separate criteria sets, and three distinct user roles with tailored dashboards.

---

## Features

### Roles & Access

| Role | Capabilities |
|---|---|
| **Super Admin** | Full access — manage periods, criteria, evaluation matrix, view all results, archive periods |
| **Leadership** | View regional evaluation progress, per-department per-criterion averages, submit own evaluations |
| **Department** | Submit evaluations for assigned peers, track own progress, view received scores by criterion |

### Core Modules

**Evaluation Periods**
- Create and manage quarterly periods (Quý 1–4) with date ranges
- Status lifecycle: `draft → open → closed`
- **Archive**: exports styled HTML report, Excel results, criteria CSV, and raw data archive into a single ZIP, then purges all period data

**Criteria Management**
- Weighted criteria per period, per region (Miền Bắc / Miền Nam)
- Two input types: `manual` (peer-scored) and `auto` (pulled from external sources)
- Auto-score sources: timesheets, 1Office, Gitiho, Google Sheets, and more
- Import criteria from CSV; download blank template

**Evaluation Matrix**
- Super-admin configures which departments evaluate which (upper-triangle constraint enforced)
- Departments self-select peers during the draft phase and commit their selection
- Matrix lock prevents changes once the period is open

**Evaluations**
- Criterion-by-criterion scoring with optional notes
- Auto-scored criteria display pre-calculated values (read-only)
- Draft saving; explicit submit action
- Region tabs for super-admin to switch between Miền Bắc and Miền Nam

**Results & Rankings**
- Department rankings with average total scores
- Per-evaluator score breakdown for super-admin
- Export as styled HTML report or Excel (.xls)

**Status Dashboard**
- Real-time completion tracking per department and per leader
- Period-level progress bar (submitted / draft / not started)
- **Department view**: outgoing submission status + per-criterion average scores received
- **Leadership view**: personal submission card + regional per-dept per-criterion averages table

**Year / Quarter Period Filter**
- Consistent dropdown filter (year + quarter) across all dashboard pages — Criteria, Evaluate, Matrix, Status, and Results

**Report / Dispute System**
- Departments can dispute an evaluation result
- Accepted disputes remove the evaluation from both directions of the matrix

**Notifications**
- In-app notification bell with unread badge
- Triggered on reports, period status changes, and evaluation submissions

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 16](https://nextjs.org/) — App Router, Server Components, Server Actions |
| UI | React 19, Tailwind CSS v4, Lucide React |
| Auth | [NextAuth v5](https://authjs.dev/) — OTP email login via [Resend](https://resend.com/) |
| Database | [Supabase](https://supabase.com/) (PostgreSQL) |
| User sync | Google Sheets API (service account) |
| Export | JSZip, custom HTML / XLS generation |
| Language | TypeScript 5 |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com/) project
- A [Resend](https://resend.com/) account for OTP emails
- A Google Cloud service account with Sheets API enabled (for user sync)

### Installation

```bash
git clone https://github.com/Saladdua/inno-department-evaluation.git
cd inno-department-evaluation
npm install
```

### Environment Variables

Create `.env.local` at the project root:

```env
# ── Supabase ──────────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# ── NextAuth ──────────────────────────────────────────────────────────
AUTH_SECRET=<random-secret>          # openssl rand -base64 32
AUTH_URL=http://localhost:3000

# ── Resend (OTP email) ────────────────────────────────────────────────
RESEND_API_KEY=<resend-api-key>
EMAIL_FROM=noreply@yourdomain.com

# ── Google Sheets (user sync) ─────────────────────────────────────────
GOOGLE_SHEET_ID=<spreadsheet-id>
GOOGLE_SERVICE_ACCOUNT_EMAIL=<service-account-email>
GOOGLE_PRIVATE_KEY=<private-key>

# ── Branding (optional) ───────────────────────────────────────────────
NEXT_PUBLIC_COMPANY_LOGO_URL=https://your-cdn.com/logo.png
```

> `service-account.json` is git-ignored. Never commit credentials.

### Run

```bash
npm run dev
# → http://localhost:3000
```

### Build for Production

```bash
npm run build
npm start
```

---

## Deployment

The easiest path is [Vercel](https://vercel.com) — import the repo, add environment variables in project settings, and deploy. For self-hosted deployments, set the same env vars on your server and run `npm run build && npm start`.

---

## Project Structure

```
src/
├── app/
│   ├── api/                  # Route handlers (criteria, evaluate, matrix, period, reports…)
│   ├── dashboard/
│   │   ├── criteria/         # Period & criteria management
│   │   ├── evaluate/         # Evaluation form (with region tabs & auto scores)
│   │   ├── matrix/           # Evaluation matrix editor
│   │   ├── results/          # Rankings & detail view
│   │   └── status/           # Progress dashboard
│   ├── login/                # OTP authentication
│   └── actions/              # Server actions (period selection…)
├── auth.ts                   # NextAuth configuration
├── middleware.ts              # Route protection
└── lib/
    ├── supabase/             # SSR + browser Supabase clients
    ├── google-sheets.ts      # Sheets API client
    └── selected-period.ts    # Cookie-based active period helper
```

---

## Database Schema (key tables)

| Table | Description |
|---|---|
| `evaluation_periods` | Quarter/year periods with status and lock flags |
| `departments` | Department records with region assignment |
| `criteria` | Weighted criteria per period per region |
| `evaluation_matrix` | Which dept evaluates which (per period) |
| `matrix_commits` | Tracks dept matrix commitment |
| `evaluations` | Evaluation headers (evaluator → target, status, total score) |
| `evaluation_scores` | Per-criterion scores for each evaluation |
| `auto_scores` | Pre-calculated scores for auto-type criteria |
| `users` | Users with role (`super_admin`, `leadership`, `department`) and region |
| `report_requests` | Dispute requests between departments |
| `notifications` | In-app notification log |

---

## License

Internal use only — © INNO JSC. Not licensed for redistribution.
