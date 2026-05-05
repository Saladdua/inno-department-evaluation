# INNO Department Evaluation

Internal performance evaluation platform for INNO JSC. Department heads score their peers against a weighted criteria matrix each quarter. Admins manage periods, criteria, and view aggregated results across all departments.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Auth | NextAuth.js v5 (credentials) |
| Database | Supabase (PostgreSQL) |
| User sync | Google Sheets API |
| UI | React 19, Tailwind CSS v4, Recharts |
| Validation | Zod, React Hook Form |

## Features

- **Criteria management** — define weighted criteria per quarter; import via CSV
- **Evaluation matrix** — cross-department scoring with live progress tracking
- **Results dashboard** — aggregated scores, per-department drill-down
- **Status view** — completion progress per evaluation period
- **Role-based access** — `super_admin`, `leadership`, `department`
- **User sync** — pull staff roster from Google Sheets into Supabase

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- A Google Cloud service account with Sheets API enabled
- A Google Sheet containing the staff roster

## Getting Started

### 1. Clone & install

```bash
git clone https://github.com/Saladdua/inno-department-evaluation.git
cd inno-department-evaluation
npm install
```

### 2. Set up Supabase

Run the schema in **Supabase Dashboard → SQL Editor**:

```bash
# Apply schema
supabase-schema.sql

# Seed initial data (optional)
supabase-seed.sql

# Create superadmin account
seed-superadmin.sql
```

### 3. Configure environment variables

Create a `.env.local` file at the project root:

```env
# ── Supabase ─────────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# ── NextAuth ──────────────────────────────────────────────────────────
AUTH_SECRET=<random-secret>          # openssl rand -base64 32
AUTH_URL=http://localhost:3000

# ── Google Sheets (user sync) ─────────────────────────────────────────
GOOGLE_SHEET_ID=<spreadsheet-id>
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=

# Place your service account JSON at the project root (git-ignored):
# service-account.json

# ── Branding (optional) ───────────────────────────────────────────────
NEXT_PUBLIC_COMPANY_LOGO_URL=https://your-cdn.com/logo.png
```

> **Note:** `service-account.json` is git-ignored. Never commit it. Rotate credentials immediately if accidentally exposed.

### 4. Run locally

```bash
npm run dev
# → http://localhost:3000
```

### 5. Build for production

```bash
npm run build
npm start
```

## Deployment

The easiest path is [Vercel](https://vercel.com) — import the repo, add the environment variables above in the project settings, and deploy.

For self-hosted deployments, set the same env vars on your server and run `npm run build && npm start`.

## Project Structure

```
src/
├── app/
│   ├── api/              REST endpoints (criteria, evaluate, matrix, period, sync…)
│   ├── dashboard/        Protected pages (criteria, evaluate, matrix, results, status)
│   └── login/            Authentication UI
├── auth.ts               NextAuth configuration
├── middleware.ts          Route protection
└── lib/
    ├── auth-helpers.ts    Session / role utilities
    ├── google-sheets.ts   Sheets API client
    └── supabase/          SSR + browser Supabase clients
```

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full architecture diagram and execution flow traces.

## Role Reference

| Role | Capabilities |
|---|---|
| `super_admin` | Full access: periods, criteria, all evaluations, results |
| `leadership` | View all results and matrix; manage evaluations |
| `department` | Submit evaluation for assigned department only |

## License

Internal use only — © INNO JSC. Not licensed for redistribution.
