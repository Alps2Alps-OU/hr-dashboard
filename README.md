# HR Buddy — Recruitment & HR Analytics Dashboard

A local-first HR analytics dashboard built with Next.js 14, Prisma (SQLite), and Tremor UI.
Pulls data from PeopleForce, Google Drive (invoice PDFs), Asana, and Notion.

## Prerequisites

- **Node.js 18+** — download from [nodejs.org](https://nodejs.org) (LTS recommended)
- API credentials for: PeopleForce, Google Drive service account, Asana, Notion, Anthropic

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment variables
```bash
cp .env.local.example .env.local
```
Edit `.env.local` and fill in all API keys.

### 3. Initialize the database
```bash
npx prisma migrate dev --name init
```
Creates `prisma/hr-buddy.db` (local SQLite file).

### 4. Start the dashboard
```bash
npm run dev
```
Opens at **http://localhost:3000**

### 5. (Optional) Run an initial sync
```bash
npm run sync              # all sources
npm run sync -- peopleforce
npm run sync -- invoices
npm run sync -- asana
npm run sync -- notion
```

### 6. (Optional) Start the background scheduler
```bash
npm run cron
```

---

## Manual sync via API
```bash
curl -X POST "http://localhost:3000/api/sync?source=all"
curl -X POST "http://localhost:3000/api/sync?source=peopleforce"
```

---

## Dashboard Tabs

| Tab | Description |
|---|---|
| **Overview** | KPI cards, headcount delta, SLA donut, breach table |
| **Recruitment** | Pipeline board, funnel, source of hire, TTF vs TTH, cost per hire |
| **Onboarding** | New hires, probation tracker, overdue tasks, early attrition |
| **Offboarding** | Exits, voluntary/involuntary, exit reasons, termination log |
| **HR Roadmap** | Kanban board (Asana), OKR progress, Notion descriptions |
| **Alerts** | SLA breaches, offer rate warning, probation expiry, overdue tasks |

---

## Department Filtering

Records where department contains "Alveda" or "Ayurveda" (case-insensitive) are silently discarded at ingestion — never stored or displayed.

---

## SLA Rules

| Level | Keywords | GREEN | AMBER | RED |
|---|---|---|---|---|
| C (Directors+) | director, head of, chief, vp, ceo… | <35d | 35–45d | >45d |
| B (Managers) | manager, team lead, lead | <25d | 25–30d | >30d |
| A (ICs / default) | specialist, coordinator, analyst… | <18d | 18–25d | >25d |

---

## Tech Stack

- **Next.js 14** App Router + TypeScript
- **Tailwind CSS** + Tremor + Recharts
- **Prisma** + SQLite
- **PeopleForce**, **Google Drive** (googleapis), **Asana**, **Notion** APIs
- **Anthropic Claude** (`claude-sonnet-4-20250514`) for invoice PDF extraction
- **node-cron** for scheduled syncs
