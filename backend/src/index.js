import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { getYears } from './routes/years.js';
import { getCampuses } from './routes/campuses.js';
import { getDepartments } from './routes/departments.js';
import { getTitles } from './routes/titles.js';
import {
  searchByName,
  searchByTitle,
  searchByDepartment,
  getPerson,
} from './routes/records.js';
import { getAnalytics } from './routes/analytics.js';

const app = express();

const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX) || 100;

const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  message: { error: 'Too many requests; please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(cors());
app.use(express.json());
app.use('/api', apiLimiter);

app.get('/api/years', getYears);
app.get('/api/campuses', getCampuses);
app.get('/api/departments', getDepartments);
app.get('/api/titles', getTitles);
app.get('/api/search/name', searchByName);
app.get('/api/search/title', searchByTitle);
app.get('/api/search/department', searchByDepartment);
app.get('/api/person', getPerson);
app.get('/api/analytics', getAnalytics);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
