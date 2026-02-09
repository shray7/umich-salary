import 'dotenv/config';
import pool from './pool.js';
import { initDb } from './pool.js';

const FISCAL_YEARS = [
  '2025-26', '2024-25', '2023-24', '2022-23', '2021-22', '2020-21',
  '2019-20', '2018-19', '2017-18', '2016-17', '2015-16', '2014-15',
];

async function main() {
  await initDb();

  const sampleRecords = [
    { last: 'Smith', first: 'Aaron', title: 'Admin Coord/Project Coord', dept: "Treasurer's Office", ftr: 55702.40, gf: 0 },
    { last: 'Smith', first: 'Aaron B', title: 'Business Systems Analyst Inter', dept: 'MM Microbiol Pathology', ftr: 98955.04, gf: 0 },
    { last: 'Smith', first: 'Aaron David', title: 'NP CRITICAL CARE', dept: 'MM Neurosurgery Spine Support', ftr: 168979, gf: 0 },
    { last: 'Smith', first: 'Amanda', title: 'REGISTERED NURSE - LEVEL C', dept: 'MM CW 12E', ftr: 90459.20, gf: 0 },
    { last: 'Smith', first: 'Amanda', title: 'Administrative Assistant Inter', dept: 'Sexual Assault Prev and Aware', ftr: 47230.30, gf: 47230.30 },
    { last: 'May', first: 'Dusty', title: 'HEAD BASKETBALL COACH', dept: 'Athletics', ftr: 4600000, gf: 0 },
    { last: 'Martindale', first: 'Donald', title: 'ASST FOOTBALL COACH', dept: 'Athletics', ftr: 2500000, gf: 0 },
    { last: 'Manuel', first: 'Warde Joseph', title: 'DIRECTOR OF ATHLETICS', dept: 'Athletics', ftr: 1957000, gf: 0 },
    { last: 'Moore', first: 'Sherrone', title: 'HEAD FOOTBALL COACH', dept: 'Athletics', ftr: 510000, gf: 0 },
    { last: 'McDonald', first: 'Terrence J', title: 'PROFESSOR', dept: 'LSA History', ftr: 583089, gf: 583089 },
    { last: 'McCauley', first: 'Laurie Kay', title: 'PROFESSOR', dept: 'DENT Periodontics and Oral Med', ftr: 577012.46, gf: 21078.84 },
    { last: 'Curzan', first: 'Anne Leslie', title: 'PROFESSOR', dept: 'LSA English Language & Lit.', ftr: 459973, gf: 459973 },
    { last: 'Jones', first: 'Andrea', title: 'HORTICULTURIST', dept: 'OUA Recruitment Administration', ftr: 52000, gf: 0 },
    { last: 'Johnson', first: 'Sabrina', title: 'Ph', dept: 'HR Comp', ftr: 65000, gf: 0 },
  ];

  const client = await pool.connect();
  try {
    await client.query('DELETE FROM salary_records');
    for (let yearKey = 0; yearKey < Math.min(3, FISCAL_YEARS.length); yearKey++) {
      const fiscalYear = FISCAL_YEARS[yearKey];
      for (const r of sampleRecords) {
        const ftr = yearKey === 0 ? r.ftr : Math.round(r.ftr * (0.97 + yearKey * 0.02) * 100) / 100;
        await client.query(
          `INSERT INTO salary_records (last_name, first_name, title, department, fiscal_year, year_key, campus, campus_id, ftr, gf, period_fte)
           VALUES ($1, $2, $3, $4, $5, $6, 'UM_ANN-ARBOR', 1, $7, $8, '12-Month1.00')`,
          [r.last, r.first, r.title, r.dept, fiscalYear, yearKey, ftr, r.gf]
        );
      }
    }
    console.log('Seed data inserted.');
  } finally {
    client.release();
    await pool.end();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
