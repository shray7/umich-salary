/**
 * Import salary data from umsalary.info into PostgreSQL.
 * Fetches the department list, then every department's paginated results, and inserts records.
 * Respects rate limits. Re-run safe: duplicates are skipped (ON CONFLICT DO NOTHING).
 *
 * Usage:
 *   node src/scripts/import-from-umsalary.js [options]
 *   npm run import
 *
 * Options (env or CLI):
 *   YEAR=0           Year key (0=2025-26, 1=2024-25, ...). Default 0.
 *   DELAY_MS=1500    Delay between HTTP requests (ms). Default 1500.
 *   LIMIT=0          Max departments to process (0 = all). Default 0.
 *   SKIP=0           Skip first N departments (for resuming). Default 0.
 *   RETRY_FAILED=1   Re-run only departments that failed last time (reads import-failures.log).
 *   ONLY_INDICES=35,36,37,38  Process only these 1-based department indices (comma-separated).
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db/pool.js';
import nhp from 'node-html-parser';
const parse = nhp?.default ?? nhp?.parse ?? nhp;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FAILURES_LOG = path.resolve(__dirname, '../../import-failures.log');

const BASE = 'https://www.umsalary.info';
const FISCAL_YEARS = ['2025-26', '2024-25', '2023-24', '2022-23', '2021-22', '2020-21', '2019-20', '2018-19', '2017-18', '2016-17', '2015-16', '2014-15', '2013-14', '2012-13', '2011-12', '2010-11', '2009-10', '2008-09', '2007-08', '2006-07', '2005-06', '2004-05', '2003-04', '2002-03'];

function getOpt(name, def) {
  const env = process.env[name];
  if (env !== undefined && env !== '') return isNaN(Number(env)) ? env : Number(env);
  const i = process.argv.indexOf(`--${name.toLowerCase()}`);
  if (i !== -1 && process.argv[i + 1] !== undefined) return Number(process.argv[i + 1]);
  if (name === 'RETRY_FAILED') return process.argv.includes('--retry-failed') ? 1 : def;
  return def;
}

function getOnlyIndices() {
  const env = process.env.ONLY_INDICES;
  const arg = process.argv.indexOf('--only-indices');
  const str = (arg !== -1 && process.argv[arg + 1]) ? process.argv[arg + 1] : (env || '');
  if (!str || !str.trim()) return null;
  return str.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n) && n >= 1);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseSalary(text) {
  if (!text || typeof text !== 'string') return 0;
  const n = parseFloat(String(text).replace(/[$,]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

async function fetchPage(url, retries = 2) {
  const opts = { headers: { 'User-Agent': 'UM-Salary-Import/1.0 (educational; copying public data)' } };
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, opts);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(2000);
    }
  }
  throw lastErr;
}

function appendFailure(yearKey, dept, err) {
  const line = JSON.stringify({ yearKey, encodedName: dept.encodedName, name: dept.name, error: err.message }) + '\n';
  try {
    fs.appendFileSync(FAILURES_LOG, line);
  } catch (e) {
    console.warn('Could not write failure log:', e.message);
  }
}

function readFailedEncodedNames(yearKey) {
  if (!fs.existsSync(FAILURES_LOG)) return new Set();
  const content = fs.readFileSync(FAILURES_LOG, 'utf8');
  const encoded = new Set();
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line);
      if (Number(o.yearKey) === Number(yearKey)) encoded.add(o.encodedName);
    } catch (_) {}
  }
  return encoded;
}

function removeFailedFromLog(yearKey, encodedNames) {
  if (!fs.existsSync(FAILURES_LOG) || encodedNames.size === 0) return;
  const toRemove = new Set(encodedNames);
  const content = fs.readFileSync(FAILURES_LOG, 'utf8');
  const kept = content.split('\n').filter((line) => {
    if (!line.trim()) return true;
    try {
      const o = JSON.parse(line);
      if (Number(o.yearKey) !== Number(yearKey)) return true;
      return !toRemove.has(o.encodedName);
    } catch (_) {
      return true;
    }
  });
  fs.writeFileSync(FAILURES_LOG, kept.join('\n') + (kept[kept.length - 1] === '' ? '' : '\n'));
}

/**
 * umsalary.info's "department" list mixes real departments with job titles.
 * Skip entries that look like job titles to avoid importing swapped title/department data.
 */
function looksLikeJobTitle(name) {
  if (!name || name.length < 3) return false;
  if (/\b(department|office|center|centre|program|admin|services|division|institute|lab)\b/i.test(name)) return false;
  const patterns = [
    /professor/i, /\b(research\s+)?scientist\b/i, /\b(coach|lecturer|instructor)\b/i,
    /\badjunct\b/i, /\b(fellow|postdoc|post-doc)\b/i, /\b(assoc|asst)\s+(prof|res)/i,
    /\b(acad|academic)\s+.*\s+(ofcr|officer)\b/i, /^(asst|assoc|assistant|associate)\s+/i,
  ];
  return patterns.some((re) => re.test(name));
}

/**
 * Parse dept_list.php: return list of { name, encodedName } from links to deptsearch.php.
 * Skips entries that appear to be job titles rather than departments.
 */
function parseDepartmentList(html) {
  const root = parse(html);
  const links = root.querySelectorAll('a[href*="deptsearch.php"]');
  const seen = new Set();
  const list = [];
  for (const a of links) {
    const href = a.getAttribute('href') || '';
    const match = href.match(/Dept=([^&]+)/);
    const text = (a.textContent || '').trim();
    if (!text || !match) continue;
    const encodedName = decodeURIComponent(match[1].replace(/\+/g, ' '));
    if (seen.has(encodedName)) continue;
    if (looksLikeJobTitle(encodedName)) continue;
    seen.add(encodedName);
    list.push({ name: encodedName, encodedName: match[1] });
  }
  return list;
}

/**
 * Parse "Page 1 of 14" from HTML.
 */
function parseTotalPages(html) {
  const m = html.match(/Page:\s*1\s+of\s+(\d+)/i) || html.match(/Page\s+1\s+of\s+(\d+)/i);
  return m ? Math.max(1, parseInt(m[1], 10)) : 1;
}

/**
 * Parse salary table: rows with 5 columns (Name, Title, Department, FTR, GF).
 * Table is identified by header row containing "FTR" and "GF".
 */
function parseSalaryTable(html, yearKey, fiscalYear) {
  const root = parse(html);
  const tables = root.querySelectorAll('table');
  const records = [];
  for (const table of tables) {
    const rows = table.querySelectorAll('tr');
    let dataStart = false;
    for (const tr of rows) {
      const ths = tr.querySelectorAll('th');
      const cells = tr.querySelectorAll('td');
      if (ths.length >= 5) {
        const text = (tr.textContent || '').toLowerCase();
        if (text.includes('ftr') && text.includes('gf')) dataStart = true;
        continue;
      }
      if (cells.length >= 5 && dataStart) {
        const nameText = (cells[0]?.textContent || '').trim();
        const titleText = (cells[1]?.textContent || '').trim();
        const deptText = (cells[2]?.textContent || '').trim();
        const ftrText = (cells[3]?.textContent || '').trim();
        const gfText = (cells[4]?.textContent || '').trim();
        const nameParts = nameText.split(',').map((s) => s.trim());
        const lastName = nameParts[0] || '';
        const firstName = nameParts.slice(1).join(' ').trim() || '';
        if (!lastName) continue;
        records.push({
          last_name: lastName,
          first_name: firstName,
          title: titleText,
          department: deptText,
          fiscal_year: fiscalYear,
          year_key: yearKey,
          campus: 'UM_ANN-ARBOR',
          campus_id: 1,
          ftr: parseSalary(ftrText),
          gf: parseSalary(gfText),
          period_fte: '12-Month1.00',
        });
      }
    }
    if (records.length > 0) return records;
  }
  return records;
}

async function fetchDepartmentPage(deptEncoded, yearKey, page) {
  const fiscalYear = FISCAL_YEARS[yearKey] ?? '2025-26';
  const url = `${BASE}/deptsearch.php?Dept=${deptEncoded}&Year=${yearKey}${page > 1 ? `&page=${page}` : ''}`;
  const html = await fetchPage(url);
  return { html, fiscalYear };
}

async function main() {
  const yearKey = getOpt('YEAR', 0);
  const delayMs = getOpt('DELAY_MS', 1500);
  const limitDepts = getOpt('LIMIT', 0);
  const skipDepts = getOpt('SKIP', 0);
  const retryFailed = getOpt('RETRY_FAILED', 0);
  const onlyIndices = getOnlyIndices();

  console.log('Import from umsalary.info');
  console.log('Options: yearKey=%s, delayMs=%s, limit=%s, skip=%s, retryFailed=%s, onlyIndices=%s', yearKey, delayMs, limitDepts, skipDepts, retryFailed, onlyIndices ? onlyIndices.join(',') : '');

  const client = await pool.connect();
  try {
    // Ensure unique index exists for ON CONFLICT
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_salary_import_key
      ON salary_records (last_name, first_name, title, department, year_key)
    `);
  } catch (e) {
    console.warn('Index creation (optional):', e.message);
  }

  try {
    const listUrl = `${BASE}/dept_list.php`;
    console.log('Fetching department list: %s', listUrl);
    await sleep(delayMs);
    const listHtml = await fetchPage(listUrl);
    let departments = parseDepartmentList(listHtml);
    console.log('Found %d departments', departments.length);

    if (retryFailed) {
      const failedSet = readFailedEncodedNames(yearKey);
      departments = departments.filter((d) => failedSet.has(d.encodedName));
      console.log('Retry mode: processing %d previously failed departments', departments.length);
      if (departments.length === 0) {
        console.log('No failed departments for yearKey=%s. Check %s for logged failures.', yearKey, FAILURES_LOG);
        return;
      }
    } else if (onlyIndices && onlyIndices.length > 0) {
      const total = departments.length;
      departments = onlyIndices.map((idx) => departments[idx - 1]).filter(Boolean);
      console.log('Only-indices mode: processing %d departments (indices %s)', departments.length, onlyIndices.join(','));
      if (departments.length === 0) {
        console.log('No valid indices in ONLY_INDICES.');
        return;
      }
    } else {
      if (skipDepts > 0) {
        departments = departments.slice(skipDepts);
        console.log('Skipping first %d, processing %d', skipDepts, departments.length);
      }
      if (limitDepts > 0) {
        departments = departments.slice(0, limitDepts);
        console.log('Limited to first %d departments', limitDepts);
      }
    }

    const fiscalYear = FISCAL_YEARS[yearKey] ?? '2025-26';
    const BATCH = 100;
    let totalInserted = 0;
    let totalSkipped = 0;
    const succeededEncoded = new Set();

    for (let i = 0; i < departments.length; i++) {
      const dept = departments[i];
      const label = `[${i + 1}/${departments.length}] ${dept.name.slice(0, 40)}${dept.name.length > 40 ? '…' : ''}`;
      try {
        await sleep(delayMs);
        const { html } = await fetchDepartmentPage(dept.encodedName, yearKey, 1);
        const totalPages = parseTotalPages(html);
        const allRecords = parseSalaryTable(html, yearKey, fiscalYear);

        for (let page = 2; page <= totalPages; page++) {
          await sleep(delayMs);
          const next = await fetchDepartmentPage(dept.encodedName, yearKey, page);
          allRecords.push(...parseSalaryTable(next.html, yearKey, fiscalYear));
        }

        let inserted = 0;
        for (let b = 0; b < allRecords.length; b += BATCH) {
          const batch = allRecords.slice(b, b + BATCH);
          const values = [];
          const params = [];
          let idx = 0;
          for (const r of batch) {
            values.push(`($${++idx},$${++idx},$${++idx},$${++idx},$${++idx},$${++idx},$${++idx},$${++idx},$${++idx},$${++idx},$${++idx})`);
            params.push(r.last_name, r.first_name, r.title, r.department, r.fiscal_year, r.year_key, r.campus, r.campus_id, r.ftr, r.gf, r.period_fte);
          }
          const res = await client.query(
            `INSERT INTO salary_records (last_name, first_name, title, department, fiscal_year, year_key, campus, campus_id, ftr, gf, period_fte)
             VALUES ${values.join(',')}
             ON CONFLICT (last_name, first_name, title, department, year_key) DO NOTHING`,
            params
          );
          inserted += res.rowCount ?? 0;
        }
        totalInserted += inserted;
        totalSkipped += allRecords.length - inserted;
        console.log('%s: %d rows (%d new)', label, allRecords.length, inserted);
        succeededEncoded.add(dept.encodedName);
      } catch (err) {
        console.error('%s: ERROR %s', label, err.message);
        appendFailure(yearKey, dept, err);
      }
    }

    if (retryFailed && succeededEncoded.size > 0) {
      removeFailedFromLog(yearKey, succeededEncoded);
      console.log('Removed %d departments from failure log (retry succeeded)', succeededEncoded.size);
    }

    console.log('Done. Inserted: %d, skipped (duplicates): %d', totalInserted, totalSkipped);

    if (fs.existsSync(FAILURES_LOG)) {
      const lines = fs.readFileSync(FAILURES_LOG, 'utf8').split('\n').filter((l) => l.trim());
      const forYear = lines.filter((l) => {
        try {
          return Number(JSON.parse(l).yearKey) === Number(yearKey);
        } catch (_) {
          return false;
        }
      });
      if (forYear.length > 0) {
        console.log('\nFailed departments for yearKey=%s (see %s for details):', yearKey, FAILURES_LOG);
        for (const line of forYear.slice(0, 20)) {
          try {
            const o = JSON.parse(line);
            console.log('  - %s: %s', o.name, o.error);
          } catch (_) {}
        }
        if (forYear.length > 20) console.log('  ... and %d more', forYear.length - 20);
        console.log('To retry only failed departments: RETRY_FAILED=1 npm run import  (or YEAR=%s RETRY_FAILED=1)', yearKey);
      }
    }
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
