/**
 * Delete all salary records for a given year.
 * Usage: node src/scripts/delete-year.js [yearKey]
 *   yearKey: 4 = 2021-2022, 3 = 2022-2023, etc.
 */

import 'dotenv/config';
import pool from '../db/pool.js';

const YEAR_LABELS = [
  '2025-2026', '2024-2025', '2023-2024', '2022-2023', '2021-2022',
  '2020-2021', '2019-2020', '2018-2019', '2017-2018', '2016-2017',
  '2015-2016', '2014-2015', '2013-2014', '2012-2013', '2011-2012',
];

const yearKey = parseInt(process.argv[2], 10);
if (Number.isNaN(yearKey) || yearKey < 0) {
  console.error('Usage: node delete-year.js <yearKey>');
  console.error('  yearKey 4 = 2021-2022');
  process.exitCode = 1;
  process.exit(1);
}

const label = YEAR_LABELS[yearKey] ?? `year_key ${yearKey}`;
const client = await pool.connect();
try {
  const r = await client.query('DELETE FROM salary_records WHERE year_key = $1', [yearKey]);
  console.log(`Deleted ${r.rowCount} rows for ${label} (year_key=${yearKey})`);
} finally {
  client.release();
  await pool.end();
}
