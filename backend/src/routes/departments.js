import pool from '../db/pool.js';

export async function getDepartments(req, res) {
  const yearKey = parseInt(req.query.year, 10);
  const yk = isNaN(yearKey) ? 0 : yearKey;

  const result = await pool.query(
    `SELECT DISTINCT department FROM salary_records
     WHERE year_key = $1 AND department IS NOT NULL AND department != ''
     ORDER BY department`,
    [yk]
  );
  const departments = result.rows.map((r) => r.department);
  res.json({ yearKey: yk, departments });
}
