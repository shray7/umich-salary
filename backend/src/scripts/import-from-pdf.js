/**
 * Import salary data from official UM HR PDF (e.g. salary_record_2025.pdf) into PostgreSQL.
 * Layout: 2025 PDF has columns CAMPUS, NAME, APPOINTMENT TITLE, APPOINTING DEPT, APPT ANNUAL FTR,
 * APPT FTR BASIS, APPT FRACTION, AMT OF SALARY PAID FROM GENL FUND. Rows are concatenated;
 * each record starts with a campus code (UM_ANN-ARBOR, UM_FLINT, UM_DEARBOR).
 *
 * Usage:
 *   node src/scripts/import-from-pdf.js [options]
 *   npm run import:pdf
 *
 * Options (env or CLI):
 *   FILE=path       Path to local PDF file.
 *   URL=...         URL to fetch PDF (default: https://hr.umich.edu/sites/default/files/salary_record_2025.pdf).
 *   YEAR=0          Year key (0=2025-26, 1=2024-25, ...). Default 0. Also derived from filename if present.
 *   LIMIT=0         Max records to import (0 = all). Use for dry-run or testing.
 *   CLEAR=1         If set, delete all existing salary_records before importing (PDF as sole source of truth).
 *   --dry-run       Parse and log only; do not insert.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db/pool.js';

// pdf-parse is CommonJS; default import for ESM
let pdfParse;
try {
  const mod = await import('pdf-parse');
  pdfParse = mod.default ?? mod;
} catch (e) {
  console.error('pdf-parse is required: npm install pdf-parse');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_PDF_URL = 'https://hr.umich.edu/sites/default/files/salary_record_2025.pdf';
const FISCAL_YEARS = ['2025-26', '2024-25', '2023-24', '2022-23', '2021-22', '2020-21', '2019-20', '2018-19', '2017-18', '2016-17', '2015-16', '2014-15', '2013-14', '2012-13', '2011-12', '2010-11', '2009-10', '2008-09', '2007-08', '2006-07', '2005-06', '2004-05', '2003-04', '2002-03'];

const CAMPUS_IDS = { 'UM_ANN-ARBOR': 1, 'UM_DEARBOR': 2, 'UM_FLINT': 3 };

const MAX_LEN = { last_name: 255, first_name: 255, title: 500, department: 500, period_fte: 50, campus: 100 };
function truncateRecord(r) {
  const out = { ...r };
  for (const [k, max] of Object.entries(MAX_LEN)) {
    if (out[k] != null && String(out[k]).length > max) out[k] = String(out[k]).slice(0, max);
  }
  return out;
}

function getOpt(name, def) {
  const env = process.env[name];
  if (env !== undefined && env !== '') return isNaN(Number(env)) ? env : Number(env);
  const i = process.argv.indexOf(`--${name.toLowerCase().replace(/_/g, '-')}`);
  if (i !== -1 && process.argv[i + 1] !== undefined) return process.argv[i + 1];
  return def;
}

function parseCurrency(text) {
  if (!text || typeof text !== 'string') return 0;
  const n = parseFloat(String(text).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Extract text from PDF buffer using pdf-parse.
 */
async function extractPdfText(buffer) {
  const data = await pdfParse(buffer);
  return data.text || '';
}

/**
 * Split full PDF text into record chunks. Each record starts with a campus code.
 * Returns array of { campus, rest } where rest is the line content after the campus token.
 */
function splitIntoRecords(text) {
  const records = [];
  const re = /(UM_ANN-ARBOR|UM_FLINT|UM_DEARBOR)/g;
  let match;
  let lastIndex = 0;
  let lastCampus = null;
  while ((match = re.exec(text)) !== null) {
    if (lastCampus) {
      const rest = text.slice(lastIndex, match.index).trim();
      if (rest.length > 10) records.push({ campus: lastCampus, rest });
    }
    lastCampus = match[1];
    lastIndex = match.index + match[1].length;
  }
  if (lastCampus) {
    const rest = text.slice(lastIndex).trim();
    if (rest.length > 10) records.push({ campus: lastCampus, rest });
  }
  return records;
}

// Tail regex: FTR, basis (8|9|12-Month), fraction, GF. Allow optional spaces (2021/2023 PDFs have no space before -Month).
const TAIL_RE = /([\d,]+\.\d{2})\s*(8|9|12)-Month\s*(\d\.\d{2})\s*([\d,]+\.\d{2})\s*$/;
// Try with leading space first, then without (2021/2023 PDFs often have "TitleMM Dept" with no space before MM)
const DEPT_PREFIXES = [' MM ', ' LSA ', ' DENT ', ' Ross ', ' College ', ' School of ', ' Building ', ' MM ', ' LSA ', ' DENT ', ' Ross '];

/** Prefixes that start a department name; used to strip department text from title. */
const DEPT_START_PATTERNS = [/\s+MM\s+/i, /\s+LSA\s+/i, /\s+DENT\s+/i, /\s+Ross\s+/i, /\s+College\s+/i, /\s+School\s+of\s+/i, /\s+Building\s+/i, /\s+OUA\s+/i, /\s+UMH\s+/i, /\s+DPSS\s+/i, /\s+SRC\s+/i, /\s+CoE\s+/i, /\s+Dbn\s+/i];

/**
 * If title contains department-like text (e.g. "PROFESSOR - LSA History"), split so
 * title stays job-only and department gets the org part. Prevents department leaking into title.
 */
function normalizeTitleAndDepartment(title, department) {
  let t = (title || '').trim();
  let d = (department || '').trim();
  if (!t) return { title: t || 'N/A', department: d || 'N/A' };
  for (const re of DEPT_START_PATTERNS) {
    const match = t.match(re);
    if (match) {
      const idx = match.index;
      const before = t.slice(0, idx).replace(/\s*[-–]\s*$/, '').trim();
      const after = t.slice(idx).trim();
      if (before.length >= 2 && after.length >= 2) {
        t = before;
        d = (d && d !== 'N/A') ? d : after;
        break;
      }
    }
  }
  return { title: t || 'N/A', department: d || 'N/A' };
}

/**
 * Parse one record chunk (campus already known). Compact format:
 * "Name Title Department FTR basis fraction GF" (optional spaces; 2021/2023 have no space before -Month).
 * Name is "Last, First" (comma). Try to split department by known prefixes.
 */
function parseRecordChunk(campus, rest) {
  const tailMatch = rest.match(TAIL_RE);
  if (!tailMatch) return null;
  const ftr = parseCurrency(tailMatch[1]);
  const basisNum = tailMatch[2];
  const fraction = tailMatch[3];
  const gf = parseCurrency(tailMatch[4]);
  const periodFte = basisNum + '-Month'.replace('-', '') + fraction;

  let middle = rest.replace(TAIL_RE, '').trim();
  if (!middle) return null;

  const commaIdx = middle.indexOf(',');
  if (commaIdx === -1) return null;
  const last_name = middle.slice(0, commaIdx).trim();
  let afterName = middle.slice(commaIdx + 1).trim();
  if (!last_name || !afterName) return null;

  let department = 'N/A';
  let beforeDept = afterName;
  for (const prefix of DEPT_PREFIXES) {
    const i = afterName.indexOf(prefix);
    if (i !== -1) {
      beforeDept = afterName.slice(0, i).trim();
      department = (prefix.trim() + afterName.slice(i + prefix.length)).trim();
      break;
    }
  }
  const words = beforeDept.split(/\s+/);
  const first_name = words[0] || 'N/A';
  let title = words.length > 1 ? words.slice(1).join(' ') : 'N/A';
  const norm = normalizeTitleAndDepartment(title, department);
  title = norm.title;
  department = norm.department;

  const campusId = CAMPUS_IDS[campus] ?? 1;
  return {
    last_name,
    first_name,
    title,
    department,
    campus,
    campus_id: campusId,
    ftr,
    gf,
    period_fte: periodFte,
  };
}

// 2025 PDF: FTR and basis can be on same line ("62,232.00   12-Month") or separate ("113,000.00" then "9-Month").
const FTR_BASIS_SAME_LINE = /^([\d,]+\.?\d*)\s*(8|9|12)-Month\s*$/i;
const FTR_ONLY_LINE = /^[\d,]+\.?\d*\s*$/;

/**
 * Parse 2025-style PDF: each record starts with campus; name is on same line as campus or next;
 * then title, department, FTR (and optionally basis), fraction, GF.
 * Format A (6 lines after campus): "Name\nTitle\nDept\nFTR  12-Month\nfraction\nGF"
 * Format B (7 lines): "Name\nTitle\nDept\nFTR\n9-Month\nfraction\nGF"
 */
function parseLineByLineRecords(text) {
  const records = [];
  const re = /(UM_ANN-ARBOR|UM_FLINT|UM_DEARBOR)/g;
  const parts = text.split(re);
  for (let i = 1; i < parts.length; i += 2) {
    const campus = parts[i];
    const block = (parts[i + 1] || '').trim();
    const lines = block.split(/\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 6) continue;
    const nameLine = lines[0];
    const commaIdx = nameLine.indexOf(',');
    if (commaIdx === -1) continue;
    const last_name = nameLine.slice(0, commaIdx).trim();
    const first_name = nameLine.slice(commaIdx + 1).trim() || 'N/A';
    let title = lines[1] || 'N/A';
    let department = lines[2] || 'N/A';
    const norm = normalizeTitleAndDepartment(title, department);
    title = norm.title;
    department = norm.department;

    let ftrStr;
    let basisStr;
    let fractionStr;
    let gfStr;
    const line3 = lines[3] || '';
    const matchSame = line3.match(FTR_BASIS_SAME_LINE);
    if (matchSame) {
      ftrStr = matchSame[1];
      basisStr = matchSame[2];
      fractionStr = lines[4];
      gfStr = lines[5];
    } else if (lines.length >= 7 && /^(8|9|12)-Month\s*$/i.test((lines[4] || '').trim())) {
      ftrStr = lines[3];
      basisStr = (lines[4] || '').replace(/-Month\s*$/i, '').trim();
      fractionStr = lines[5];
      gfStr = lines[6];
    } else {
      continue;
    }
    const ftr = parseCurrency(ftrStr);
    const gf = parseCurrency(gfStr);
    const periodFte = (basisStr || '12') + 'Month' + (fractionStr || '1.00');
    records.push({
      campus,
      last_name,
      first_name,
      title,
      department,
      campus_id: CAMPUS_IDS[campus] ?? 1,
      ftr,
      gf,
      period_fte: periodFte,
    });
  }
  return records;
}

async function main() {
  const filePath = getOpt('FILE', process.env.FILE);
  const url = getOpt('URL', process.env.URL || DEFAULT_PDF_URL);
  const yearKey = getOpt('YEAR', 0);
  const limit = Number(getOpt('LIMIT', 0)) || 0;
  const clearFirst = process.env.CLEAR === '1' || process.env.CLEAR === 'true' || process.argv.includes('--clear');
  const dryRun = process.argv.includes('--dry-run');

  const fiscalYear = FISCAL_YEARS[yearKey] ?? '2025-26';

  console.log('Import from UM salary PDF');
  console.log('Options: yearKey=%s, fiscalYear=%s, limit=%s, clear=%s, dryRun=%s', yearKey, fiscalYear, limit, clearFirst, dryRun);

  let buffer;
  if (filePath) {
    const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(resolved)) {
      console.error('File not found:', resolved);
      process.exit(1);
    }
    buffer = fs.readFileSync(resolved);
    console.log('Reading PDF from file:', resolved);
  } else {
    console.log('Fetching PDF from URL:', url);
    const res = await fetch(url, { headers: { 'User-Agent': 'UM-Salary-Import-PDF/1.0' } });
    if (!res.ok) {
      console.error('HTTP %s: %s', res.status, url);
      process.exit(1);
    }
    const ab = await res.arrayBuffer();
    buffer = Buffer.from(ab);
  }

  const text = await extractPdfText(buffer);
  const formatEnv = process.env.FORMAT;
  const isLineByLine = formatEnv === 'line' || (formatEnv !== 'compact' && /(UM_ANN-ARBOR|UM_FLINT|UM_DEARBOR)\s*\n[^\n]*,[^\n]*\n/.test(text));
  let records = [];
  if (isLineByLine) {
    console.log('Using line-by-line parser (2024-style PDF)');
    const lineRecords = parseLineByLineRecords(text);
    records = lineRecords.map((r) => ({ ...r, fiscal_year: fiscalYear, year_key: yearKey }));
    console.log('Parsed %d records', records.length);
  } else {
    const rawRecords = splitIntoRecords(text);
    console.log('Parsed %d raw record chunks', rawRecords.length);
    let parseFail = 0;
    for (const { campus, rest } of rawRecords) {
      const r = parseRecordChunk(campus, rest);
      if (r) {
        records.push({ ...r, fiscal_year: fiscalYear, year_key: yearKey });
      } else {
        parseFail++;
      }
    }
    if (parseFail > 0) console.warn('Skipped %d chunks that could not be parsed', parseFail);
  }

  const toProcess = limit > 0 ? records.slice(0, limit) : records;
  console.log('Records to insert: %d', toProcess.length);

  if (dryRun) {
    toProcess.slice(0, 5).forEach((r, i) => console.log('[%s] %s, %s | %s | %s | FTR=%s GF=%s', i + 1, r.last_name, r.first_name, r.title, r.department, r.ftr, r.gf));
    console.log('Dry run: no database writes.');
    process.exit(0);
  }

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_salary_import_key
      ON salary_records (last_name, first_name, title, department, year_key)
    `);
  } catch (e) {
    console.warn('Index (optional):', e.message);
  }

  try {
    if (clearFirst) {
      const del = await client.query('DELETE FROM salary_records');
      console.log('Cleared %d existing records (CLEAR=1)', del.rowCount ?? 0);
    }

    const BATCH = 100;
    let totalInserted = 0;
    let totalSkipped = 0;

    for (let b = 0; b < toProcess.length; b += BATCH) {
      const batch = toProcess.slice(b, b + BATCH);
      const values = [];
      const params = [];
      let idx = 0;
      for (const r of batch) {
        const t = truncateRecord(r);
        values.push(`($${++idx},$${++idx},$${++idx},$${++idx},$${++idx},$${++idx},$${++idx},$${++idx},$${++idx},$${++idx},$${++idx})`);
        params.push(t.last_name, t.first_name, t.title, t.department, t.fiscal_year, t.year_key, t.campus, t.campus_id, t.ftr, t.gf, t.period_fte);
      }
      const res = await client.query(
        `INSERT INTO salary_records (last_name, first_name, title, department, fiscal_year, year_key, campus, campus_id, ftr, gf, period_fte)
         VALUES ${values.join(',')}
         ON CONFLICT (last_name, first_name, title, department, year_key) DO NOTHING`,
        params
      );
      const inserted = res.rowCount ?? 0;
      totalInserted += inserted;
      totalSkipped += batch.length - inserted;
    }

    console.log('Done. Inserted: %d, skipped (duplicates): %d', totalInserted, totalSkipped);
  } catch (err) {
    console.error('Import failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
  process.exit(process.exitCode || 0);
}

main();
