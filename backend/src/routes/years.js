import pool from '../db/pool.js';

const YEAR_LABELS = [
  '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017',
  '2016', '2015', '2014', '2013', '2012', '2011', '2010', '2009', '2008',
  '2007', '2006', '2005', '2004', '2003', '2002',
];

// Only expose 2025 for now (year_key 0)
const CURRENT_YEAR_KEY = 0;

export async function getYears(_req, res) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT DISTINCT year_key, fiscal_year FROM salary_records WHERE year_key = $1 ORDER BY year_key ASC`,
      [CURRENT_YEAR_KEY]
    );
    const years = rows.map((r) => ({
      yearKey: r.year_key,
      label: YEAR_LABELS[r.year_key] ?? r.fiscal_year ?? `${r.year_key}`,
    }));
    res.json(years);
  } finally {
    client.release();
  }
}
