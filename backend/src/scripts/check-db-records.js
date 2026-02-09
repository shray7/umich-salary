/**
 * Report record counts in the database. Use to verify Azure (or local) DB has expected data.
 * Run from backend: DATABASE_URL='...' node src/scripts/check-db-records.js
 */
import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    const total = await client.query(
      'SELECT COUNT(*)::int AS n FROM salary_records'
    );
    console.log('Total records:', total.rows[0].n);

    const byYear = await client.query(`
      SELECT year_key, fiscal_year, COUNT(*)::int AS n
      FROM salary_records
      GROUP BY year_key, fiscal_year
      ORDER BY year_key ASC
    `);
    if (byYear.rows.length === 0) {
      console.log('No data by year (table may be empty or schema not initialized).');
      return;
    }
    console.log('\nBy year:');
    for (const r of byYear.rows) {
      console.log(`  year_key=${r.year_key} fiscal_year=${r.fiscal_year || '(null)'}  count=${r.n}`);
    }

    // Quick sanity: year_key 0 is usually latest (2025); we expect ~53k from PDF import
    const y0 = byYear.rows.find((r) => r.year_key === 0);
    if (y0 && y0.n > 0) {
      console.log('\nLatest year (year_key=0) has', y0.n, 'records.');
    }

    const topN = parseInt(process.argv.find((a) => a.startsWith('--top='))?.split('=')[1] || process.env.TOP_EARNERS || '0', 10);
    if (topN > 0) {
      const top = await client.query(
        `SELECT first_name, last_name, title, department, ftr, fiscal_year
         FROM salary_records
         ORDER BY ftr DESC NULLS LAST
         LIMIT $1`,
        [topN]
      );
      console.log('\nTop %d earners (by FTR):', topN);
      top.rows.forEach((r, i) => {
        console.log('  %d. %s %s — %s | %s | $%s', i + 1, r.first_name || '', r.last_name, r.title || '', r.department || '', Number(r.ftr).toLocaleString());
      });
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
