import pool from '../db/pool.js';

function rowToRecord(row) {
  return {
    id: row.id,
    firstName: row.first_name ?? '',
    lastName: row.last_name ?? '',
    title: row.title ?? '',
    department: row.department ?? '',
    fiscalYear: row.fiscal_year ?? '',
    yearKey: row.year_key,
    campus: row.campus ?? '',
    campusId: row.campus_id,
    ftr: Number(row.ftr),
    gf: Number(row.gf),
    periodFte: row.period_fte ?? undefined,
    changeFromLastYearPct: row.change_from_last_year_pct != null ? Number(row.change_from_last_year_pct) : undefined,
  };
}

export async function searchByName(req, res) {
  const lastName = (req.query.lastName || '').trim();
  const firstName = (req.query.firstName || '').trim();
  const yearKey = parseInt(req.query.year, 10);
  const campusId = req.query.campus != null ? parseInt(req.query.campus, 10) : 0;

  if (!lastName) {
    return res.status(400).json({ error: 'lastName is required' });
  }

  const yk = isNaN(yearKey) ? 0 : yearKey;
  const client = await pool.connect();
  try {
    let query = `
      SELECT * FROM salary_records
      WHERE LOWER(last_name) LIKE LOWER($1)
      AND ($2::text = '' OR LOWER(first_name) LIKE LOWER($2))
      AND year_key = $3
    `;
    const params = [`%${lastName}%`, firstName ? `%${firstName}%` : '', yk];

    if (campusId !== 0 && !isNaN(campusId)) {
      query += ` AND (campus_id = $4 OR campus_id IS NULL)`;
      params.push(campusId);
    }

    query += ` ORDER BY last_name, first_name LIMIT 30`;

    const result = await client.query(query, params);
    const items = result.rows.map(rowToRecord);
    res.json({ items, totalCount: items.length });
  } finally {
    client.release();
  }
}

export async function searchByTitle(req, res) {
  const title = (req.query.title || '').trim();
  const yearKey = parseInt(req.query.year, 10);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 30));

  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }

  const yk = isNaN(yearKey) ? 0 : yearKey;
  const client = await pool.connect();
  try {
    const countResult = await client.query(
      `SELECT COUNT(*) AS cnt,
              MIN(ftr) AS min_salary,
              MAX(ftr) AS max_salary,
              AVG(ftr)::NUMERIC(14,2) AS avg_salary
       FROM salary_records
       WHERE year_key = $1 AND LOWER(title) LIKE LOWER($2)`,
      [yk, `%${title}%`]
    );
    const countRow = countResult.rows[0];
    const totalCount = parseInt(countRow.cnt, 10);
    const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const offset = (page - 1) * pageSize;

    const listResult = await client.query(
      `SELECT * FROM salary_records
       WHERE year_key = $1 AND LOWER(title) LIKE LOWER($2)
       ORDER BY ftr DESC
       LIMIT $3 OFFSET $4`,
      [yk, `%${title}%`, pageSize, offset]
    );

    const items = listResult.rows.map(rowToRecord);
    res.json({
      items,
      totalCount,
      page,
      pageSize,
      totalPages,
      aggregates: {
        count: totalCount,
        minSalary: countRow.min_salary != null ? Number(countRow.min_salary) : 0,
        maxSalary: countRow.max_salary != null ? Number(countRow.max_salary) : 0,
        avgSalary: countRow.avg_salary != null ? Number(countRow.avg_salary) : 0,
      },
    });
  } finally {
    client.release();
  }
}

export async function searchByDepartment(req, res) {
  const department = (req.query.department || '').trim();
  const yearKey = parseInt(req.query.year, 10);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 30));

  if (!department) {
    return res.status(400).json({ error: 'department is required' });
  }

  const yk = isNaN(yearKey) ? 0 : yearKey;
  const client = await pool.connect();
  try {
    const countResult = await client.query(
      `SELECT COUNT(*) AS cnt,
              MIN(ftr) AS min_salary,
              MAX(ftr) AS max_salary,
              AVG(ftr)::NUMERIC(14,2) AS avg_salary
       FROM salary_records
       WHERE year_key = $1 AND LOWER(department) LIKE LOWER($2)`,
      [yk, `%${department}%`]
    );
    const countRow = countResult.rows[0];
    const totalCount = parseInt(countRow.cnt, 10);
    const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const offset = (page - 1) * pageSize;

    const listResult = await client.query(
      `SELECT * FROM salary_records
       WHERE year_key = $1 AND LOWER(department) LIKE LOWER($2)
       ORDER BY ftr DESC
       LIMIT $3 OFFSET $4`,
      [yk, `%${department}%`, pageSize, offset]
    );

    const items = listResult.rows.map(rowToRecord);
    res.json({
      items,
      totalCount,
      page,
      pageSize,
      totalPages,
      aggregates: {
        count: totalCount,
        minSalary: countRow.min_salary != null ? Number(countRow.min_salary) : 0,
        maxSalary: countRow.max_salary != null ? Number(countRow.max_salary) : 0,
        avgSalary: countRow.avg_salary != null ? Number(countRow.avg_salary) : 0,
      },
    });
  } finally {
    client.release();
  }
}

export async function getPerson(req, res) {
  const lastName = (req.query.lastName || '').trim();
  const firstName = (req.query.firstName || '').trim();

  if (!lastName) {
    return res.status(400).json({ error: 'lastName is required' });
  }

  const client = await pool.connect();
  try {
    let query = `
      SELECT * FROM salary_records
      WHERE LOWER(last_name) = LOWER($1)
    `;
    const params = [lastName];
    if (firstName) {
      query += ` AND LOWER(first_name) = LOWER($2)`;
      params.push(firstName);
    }
    query += ` ORDER BY year_key ASC`;  // 0 = latest, so newest first

    const result = await client.query(query, params);
    const salaryHistory = result.rows.map(rowToRecord);
    if (salaryHistory.length === 0) {
      return res.status(404).json({ error: 'Person not found' });
    }
    const first = result.rows[0];
    res.json({
      firstName: first.first_name ?? '',
      lastName: first.last_name ?? '',
      salaryHistory,
    });
  } finally {
    client.release();
  }
}
