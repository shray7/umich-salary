import pool from '../db/pool.js';

export async function getTitles(req, res) {
  const yearKey = parseInt(req.query.year, 10);
  const yk = isNaN(yearKey) ? 0 : yearKey;

  const result = await pool.query(
    `SELECT DISTINCT title FROM salary_records
     WHERE year_key = $1 AND title IS NOT NULL AND title != ''
     ORDER BY title`,
    [yk]
  );
  const titles = result.rows.map((r) => r.title);
  res.json({ yearKey: yk, titles });
}
