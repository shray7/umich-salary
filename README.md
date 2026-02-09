# UM Salary – University of Michigan Salary Information

A recreation of the UM salary lookup experience: search by name, job title, or department, with a modern Vue.js frontend and a REST API backend.

## Stack

- **Backend:** Node.js, Express, PostgreSQL
- **Frontend:** Vue 3, TypeScript, Vue Router, Pinia, Vite

## Prerequisites

- Node.js 18+
- PostgreSQL (local or remote). Create a database, e.g. `createdb umich_salary`, then set `DATABASE_URL` in `backend/.env`.

## Run with Docker (backend + PostgreSQL)

PostgreSQL data is stored in a **named volume** (`pgdata`), so it persists across `docker compose down` and image rebuilds.

```bash
# From repo root
docker compose up -d

# Backend inits the DB schema on first start. To load sample data on first run:
RUN_SEED=1 docker compose up -d
# Or seed later while the stack is running:
docker compose exec backend node src/db/seed.js
```

- API: http://localhost:3000  
- Postgres: localhost:5432 (credentials and db name are in `docker-compose.yml`; use `backend/.env` with `DATABASE_URL` for local runs)

To reset the database (delete all data but keep the volume): connect to Postgres and drop/recreate tables, or remove the volume and bring the stack up again:

```bash
docker compose down
docker volume rm umich-salary_pgdata   # optional: only if you want to wipe DB
docker compose up -d
```

## Setup (local without Docker)

### 1. Backend

```bash
cd backend
cp .env.example .env
# Copy .env.example to .env and set DATABASE_URL (see .env.example; do not commit .env)
npm install
npm run db:init    # Create tables
npm run db:seed    # Load sample data (optional; run after db:init)
npm run dev        # Start API on http://localhost:3000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev        # Start dev server (proxies /api to backend)
```

Open http://localhost:5173 (or the port Vite prints).

### 3. Import data (PDF or umsalary.info)

The import script copies salary data from umsalary.info into your PostgreSQL database. It fetches the department list, then every department’s paginated results, and inserts rows (duplicates are skipped).

**Official UM HR PDF (recommended as source of truth)**

The [official salary disclosure PDF](https://hr.umich.edu/sites/default/files/salary_record_2025.pdf) can be imported directly. Optionally clear existing records first so the PDF is the sole source.

```bash
cd backend
npm run import:pdf              # Fetch PDF from URL and import
CLEAR=1 npm run import:pdf      # Clear all salary_records, then import from PDF (PDF as sole source)
LIMIT=100 npm run import:pdf    # Test run: import only first 100 records
node src/scripts/import-from-pdf.js --dry-run   # Parse and log only; no DB writes
FILE=./salary_record_2025.pdf npm run import:pdf # Use a local PDF file
```

**umsalary.info (alternative)**

The import script copies salary data from umsalary.info into your PostgreSQL database. It fetches the department list, then every department's paginated results, and inserts rows (duplicates are skipped).

**With Docker (umsalary):**

```bash
docker compose exec backend node src/scripts/import-from-umsalary.js
```

**Local (with `DATABASE_URL` in `backend/.env`):**

```bash
cd backend
npm run import
```

**Options** (env or `--key value`):

| Option         | Default | Description |
|----------------|--------|-------------|
| `YEAR`         | 0      | Fiscal year key (0 = 2025-26, 1 = 2024-25, …) |
| `DELAY_MS`     | 1500   | Delay between HTTP requests (ms). Be polite to the source. |
| `LIMIT`        | 0      | Max departments to process (0 = all). Use a small number to test. |
| `SKIP`         | 0      | Skip first N departments (for resuming a run). |
| `RETRY_FAILED` | 0      | If 1 (or `--retry-failed`), re-run only departments that failed last run. |

When a department fails, it is logged to `backend/import-failures.log` with the error reason. To retry only those:

```bash
RETRY_FAILED=1 npm run import
# or with a specific year:
YEAR=1 RETRY_FAILED=1 npm run import
```

Examples:

```bash
# Test run: only first 3 departments
LIMIT=3 npm run import

# Import only 2024-25
YEAR=1 npm run import

# Resume after 500 departments
SKIP=500 npm run import

# Retry only previously failed departments (same YEAR as when they failed)
RETRY_FAILED=1 npm run import
```

Full import (all departments, one year) can take a long time; use a delay of at least 1–2 seconds between requests.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/years | List fiscal years |
| GET | /api/campuses | List campuses |
| GET | /api/departments?year=0 | List department names for year |
| GET | /api/titles?year=0 | List title names for year |
| GET | /api/search/name?lastName=...&firstName=&year=0&campus=0 | Name search (max 30) |
| GET | /api/search/title?title=...&year=0&page=1&pageSize=30 | Title search (paginated) |
| GET | /api/search/department?department=...&year=0&page=1&pageSize=30 | Department search (paginated) |
| GET | /api/person?lastName=...&firstName=... | Person salary history |

The API is rate-limited by IP (default: 100 requests per 15 minutes). Configure with `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS` in `backend/.env`.

## Deploy to Azure

To run PostgreSQL and the backend container in Azure, see [docs/DEPLOY-AZURE.md](docs/DEPLOY-AZURE.md) (Azure Database for PostgreSQL + Azure Container Apps or App Service). For production, you can deploy the backend to two regions (e.g. West US and East US) with Azure Front Door for latency-based routing; the deploy doc includes a multi-region section.

## Project layout

```
umich-salary/
├── backend/
│   ├── src/
│   │   ├── db/          # Schema, pool, init, seed
│   │   ├── routes/      # API handlers
│   │   ├── scripts/     # Import script
│   │   └── index.js
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── api/         # API client
│   │   ├── components/
│   │   ├── views/
│   │   └── router/
│   └── package.json
└── README.md
```

## Data and legal

Salary data is from public University of Michigan disclosures. If you scrape third-party sites (e.g. umsalary.info), respect their robots.txt and rate limits; prefer official UM sources when available.
