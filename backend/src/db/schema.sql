-- Fiscal years: year_key 0 = latest (2025-26), 1 = 2024-25, etc.
-- Campuses: 0 = All, 1 = Ann Arbor, 2 = Dearborn, 3 = Flint

CREATE TABLE IF NOT EXISTS salary_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name VARCHAR(255),
  last_name VARCHAR(255) NOT NULL,
  title VARCHAR(500),
  department VARCHAR(500),
  fiscal_year VARCHAR(20),
  year_key INTEGER NOT NULL,
  campus VARCHAR(100),
  campus_id INTEGER,
  ftr NUMERIC(14, 2) NOT NULL DEFAULT 0,
  gf NUMERIC(14, 2) NOT NULL DEFAULT 0,
  period_fte VARCHAR(50),
  change_from_last_year_pct NUMERIC(6, 2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_salary_last_name ON salary_records(last_name);
CREATE INDEX IF NOT EXISTS idx_salary_first_name ON salary_records(first_name);
CREATE INDEX IF NOT EXISTS idx_salary_title ON salary_records(title);
CREATE INDEX IF NOT EXISTS idx_salary_department ON salary_records(department);
CREATE INDEX IF NOT EXISTS idx_salary_year_key ON salary_records(year_key);
CREATE INDEX IF NOT EXISTS idx_salary_campus ON salary_records(campus_id);
CREATE INDEX IF NOT EXISTS idx_salary_name_year ON salary_records(last_name, first_name, year_key);

-- Deduplicate imports: one row per (person, title, department, year)
CREATE UNIQUE INDEX IF NOT EXISTS idx_salary_import_key ON salary_records (last_name, first_name, title, department, year_key);
