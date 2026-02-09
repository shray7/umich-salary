/**
 * Fix title/department columns where umsalary.info's "department" list incorrectly
 * includes job titles. When imported from those pages, the Department column shows
 * the job title and the Title column may show wrong data (e.g. first name).
 *
 * This script:
 * 1. Identifies records where department matches job-title-like patterns
 * 2. Sets title = department (the actual job title) and department = '' for those records
 *
 * Usage:
 *   node src/scripts/fix-title-department.js [--dry-run]
 *
 * Options:
 *   --dry-run   Report changes without applying (default: false)
 */

import 'dotenv/config';
import pool from '../db/pool.js';

// Patterns that indicate "department" value is actually a job title.
// umsalary.info's dept_list mixes real departments with job titles.
const TITLE_LIKE_PATTERNS = [
  /professor/i,
  /\b(research\s+)?scientist\b/i,
  /\b(coach|lecturer|instructor)\b/i,
  /\badjunct\b/i,
  /\b(fellow|postdoc|post-doc)\b/i,
  /\b(assoc|asst)\s+(prof|res)/i,
  /\b(acad|academic)\s+.*\s+(ofcr|officer)\b/i,
  /^(asst|assoc|assistant|associate)\s+/i,
  /\b(vp|vice\s+president)\b/i,
  /\b(chief|dir|director)\s+of\b/i,
  /^(sr|sr\.|senior)\s+(res|research)\b/i,
];

// Skip if it looks like an org unit (real department), not a job title
const ORG_INDICATORS = /\b(department|office|center|centre|program|admin|services|division|institute|lab|laboratory)\b/i;

function looksLikeTitle(str) {
  if (!str || typeof str !== 'string' || str.length < 3) return false;
  if (ORG_INDICATORS.test(str)) return false;
  return TITLE_LIKE_PATTERNS.some((re) => re.test(str));
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) console.log('DRY RUN - no changes will be written\n');

  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT id, last_name, first_name, title, department, year_key
       FROM salary_records
       WHERE department IS NOT NULL AND department != ''
       ORDER BY year_key, last_name, first_name`
    );

    const toFix = [];
    for (const row of res.rows) {
      if (!looksLikeTitle(row.department)) continue;
      toFix.push(row);
    }

    console.log('Found %d records where department appears to be a job title\n', toFix.length);

    if (toFix.length === 0) {
      console.log('Nothing to fix.');
      return;
    }

    let updated = 0;
    for (const row of toFix) {
      const newTitle = row.department;
      const newDept = '';
      if (dryRun) {
        console.log('[dry-run] id=%s | %s, %s | title: "%s" -> "%s" | dept: "%s" -> ""',
          row.id, row.last_name, row.first_name, row.title || '(empty)', newTitle, row.department);
      } else {
        const r = await client.query(
          `UPDATE salary_records
           SET title = $1, department = $2
           WHERE id = $3`,
          [newTitle, newDept, row.id]
        );
        if (r.rowCount > 0) updated++;
      }
    }

    if (!dryRun) {
      console.log('Updated %d records.', updated);
    } else {
      console.log('\nWould update %d records. Run without --dry-run to apply.', toFix.length);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
