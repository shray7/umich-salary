import pool from '../db/pool.js';

const YEAR_LABELS = [
  '2025-2026', '2024-2025', '2023-2024', '2022-2023', '2021-2022',
  '2020-2021', '2019-2020', '2018-2019', '2017-2018', '2016-2017',
  '2015-2016', '2014-2015', '2013-2014', '2012-2013', '2011-2012',
  '2010-2011', '2009-2010', '2008-2009', '2007-2008', '2006-2007',
  '2005-2006', '2004-2005', '2003-2004', '2002-2003',
];

export async function getAnalytics(req, res) {
  const yearKey = parseInt(req.query.year, 10);
  const yk = Number.isNaN(yearKey) ? 0 : yearKey;

  const client = await pool.connect();
  try {
    const [
      overviewRes,
      topEarnersRes,
      deptRes,
      yoyRes,
      histogramRes,
      campusRes,
      salaryBandsRes,
      concentrationRes,
      professorSalariesRes,
    ] = await Promise.all([
      client.query(
        `SELECT
           COUNT(*)::int AS headcount,
           COALESCE(SUM(ftr), 0)::numeric AS total_payroll,
           COALESCE(AVG(ftr), 0)::numeric AS mean_ftr,
           (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ftr))::numeric AS median_ftr,
           COALESCE(MIN(ftr), 0)::numeric AS min_ftr,
           COALESCE(MAX(ftr), 0)::numeric AS max_ftr
         FROM salary_records WHERE year_key = $1`,
        [yk]
      ),
      client.query(
        `SELECT id, first_name, last_name, title, department, ftr
         FROM salary_records WHERE year_key = $1 ORDER BY ftr DESC NULLS LAST LIMIT 10`,
        [yk]
      ),
      client.query(
        `SELECT department AS name,
                COUNT(*)::int AS count,
                SUM(ftr)::numeric AS total_ftr,
                AVG(ftr)::numeric AS avg_ftr
         FROM salary_records WHERE year_key = $1 AND department IS NOT NULL AND department != ''
         GROUP BY department ORDER BY total_ftr DESC NULLS LAST LIMIT 20`,
        [yk]
      ),
      client.query(
        `SELECT year_key,
                COUNT(*)::int AS count,
                SUM(ftr)::numeric AS total_payroll
         FROM salary_records WHERE year_key IN (0,1,2,3,4,5,6,7,8,9)
         GROUP BY year_key ORDER BY year_key ASC`
      ),
      client.query(
        `WITH buckets AS (
           SELECT CASE
             WHEN ftr < 25000 THEN 1
             WHEN ftr < 50000 THEN 2
             WHEN ftr < 75000 THEN 3
             WHEN ftr < 100000 THEN 4
             WHEN ftr < 125000 THEN 5
             WHEN ftr < 150000 THEN 6
             WHEN ftr < 200000 THEN 7
             WHEN ftr < 250000 THEN 8
             WHEN ftr < 300000 THEN 9
             ELSE 10
           END AS bucket
           FROM salary_records WHERE year_key = $1
         )
         SELECT bucket, COUNT(*)::int AS count
         FROM buckets GROUP BY bucket ORDER BY bucket`,
        [yk]
      ),
      client.query(
        `SELECT COALESCE(campus, 'Unknown') AS name,
                COUNT(*)::int AS count,
                SUM(ftr)::numeric AS total_ftr
         FROM salary_records WHERE year_key = $1
         GROUP BY campus ORDER BY total_ftr DESC NULLS LAST`,
        [yk]
      ),
      client.query(
        `SELECT department AS name,
               CASE WHEN ftr < 50000 THEN '0-50k'
                    WHEN ftr < 100000 THEN '50-100k'
                    WHEN ftr < 150000 THEN '100-150k'
                    WHEN ftr < 200000 THEN '150-200k'
                    WHEN ftr < 250000 THEN '200-250k'
                    WHEN ftr < 300000 THEN '250-300k'
                    ELSE '300k+'
               END AS band,
               COUNT(*)::int AS count
         FROM salary_records
         WHERE year_key = $1 AND department IS NOT NULL AND department != ''
         GROUP BY department, band
         HAVING COUNT(*) > 0`,
        [yk]
      ),
      client.query(
        `WITH ordered AS (
           SELECT ftr, ROW_NUMBER() OVER (ORDER BY ftr) AS rn,
                  SUM(ftr) OVER (ORDER BY ftr) AS cum_ftr,
                  NTILE(20) OVER (ORDER BY ftr) AS tile
           FROM salary_records WHERE year_key = $1
         ),
         totals AS (SELECT SUM(ftr)::numeric AS total, COUNT(*)::int AS cnt FROM salary_records WHERE year_key = $1),
         tile_ends AS (
           SELECT tile, MAX(rn) AS max_rn, MAX(cum_ftr) AS cum_ftr
           FROM ordered GROUP BY tile
         )
         SELECT ROUND((te.max_rn::numeric / t.cnt) * 100, 1) AS pct_employees,
                ROUND((te.cum_ftr / t.total) * 100, 1) AS pct_payroll
         FROM tile_ends te, totals t
         ORDER BY te.tile`,
        [yk]
      ),
      client.query(
        `WITH top_depts AS (
           SELECT department
           FROM salary_records
           WHERE year_key = $1 AND department IS NOT NULL AND department != ''
           GROUP BY department
           ORDER BY SUM(ftr) DESC NULLS LAST
           LIMIT 20
         ),
         prof_stats AS (
           SELECT department, COUNT(*)::int AS prof_count, AVG(ftr)::numeric AS avg_ftr
           FROM salary_records
           WHERE year_key = $1 AND department IS NOT NULL AND department != ''
             AND title ILIKE '%Professor%'
           GROUP BY department
         )
         SELECT t.department AS name, p.prof_count, p.avg_ftr
         FROM top_depts t
         JOIN prof_stats p ON t.department = p.department
         ORDER BY p.avg_ftr DESC NULLS LAST
         LIMIT 12`,
        [yk]
      ),
    ]);

    const overviewRow = overviewRes.rows[0];
    const overview = {
      headcount: parseInt(overviewRow?.headcount ?? 0, 10),
      totalPayroll: Number(overviewRow?.total_payroll ?? 0),
      meanFtr: Number(overviewRow?.mean_ftr ?? 0),
      medianFtr: Number(overviewRow?.median_ftr ?? 0),
      minFtr: Number(overviewRow?.min_ftr ?? 0),
      maxFtr: Number(overviewRow?.max_ftr ?? 0),
    };

    const topEarners = topEarnersRes.rows.map((r) => ({
      id: r.id,
      firstName: r.first_name ?? '',
      lastName: r.last_name ?? '',
      title: r.title ?? '',
      department: r.department ?? '',
      ftr: Number(r.ftr),
    }));

    const departments = deptRes.rows.map((r) => ({
      name: r.name,
      count: parseInt(r.count, 10),
      totalFtr: Number(r.total_ftr),
      avgFtr: Number(r.avg_ftr),
    }));

    const yearOverYear = yoyRes.rows.map((r) => ({
      yearKey: r.year_key,
      label: YEAR_LABELS[r.year_key] ?? `${r.year_key}`,
      totalPayroll: Number(r.total_payroll),
      count: parseInt(r.count, 10),
    }));

    const HISTOGRAM_LABELS = ['0-25k', '25-50k', '50-75k', '75-100k', '100-125k', '125-150k', '150-200k', '200-250k', '250-300k', '300k+'];
    const histogram = Array.from({ length: 10 }, (_, i) => ({ bucket: i + 1, label: HISTOGRAM_LABELS[i], count: 0 }));
    histogramRes.rows.forEach((r) => {
      const idx = histogram.findIndex((h) => h.bucket === r.bucket);
      if (idx >= 0) histogram[idx].count = parseInt(r.count, 10);
    });

    const campus = campusRes.rows.map((r) => ({
      name: r.name,
      count: parseInt(r.count, 10),
      totalFtr: Number(r.total_ftr),
    }));

    const salaryBands = salaryBandsRes.rows.map((r) => ({
      department: r.name ?? '',
      band: r.band ?? '',
      count: parseInt(r.count, 10),
    }));

    const concentration = concentrationRes.rows.map((r) => ({
      pctEmployees: Number(r.pct_employees),
      pctPayroll: Number(r.pct_payroll),
    }));

    const professorSalaries = professorSalariesRes.rows.map((r) => ({
      department: r.name ?? '',
      profCount: parseInt(r.prof_count, 10),
      avgFtr: Number(r.avg_ftr),
    }));

    res.json({
      yearKey: yk,
      overview,
      topEarners,
      departments,
      yearOverYear,
      histogram,
      campus,
      salaryBands,
      concentration,
      professorSalaries,
    });
  } finally {
    client.release();
  }
}
