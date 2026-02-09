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

// Required when behind a proxy (Azure Front Door, load balancer) so rate limiting uses client IP
app.set('trust proxy', 1);

const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX) || 100;

const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  message: { error: 'Too many requests; please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Restrict CORS to allowed origins only (e.g. GitHub Pages). Comma-separated list.
// If unset, all origins are allowed (e.g. local dev). Set in production to lock down.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    if (ALLOWED_ORIGINS.length === 0) {
      callback(null, true);
      return;
    }
    if (!origin) {
      callback(null, true);
      return;
    }
    if (ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

// Optional: reject API requests (except health) when Origin/Referer is present but not allowed
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next();
  if (ALLOWED_ORIGINS.length === 0) return next();
  const origin = req.get('Origin');
  const referer = req.get('Referer');
  if (!origin && !referer) return next();
  const allowed = [origin, referer].filter(Boolean).some((v) => {
    try {
      const u = new URL(v);
      return ALLOWED_ORIGINS.includes(u.origin);
    } catch {
      return false;
    }
  });
  if (allowed) return next();
  res.status(403).json({ error: 'Forbidden: origin not allowed' });
});

app.use(express.json());
// Health before rate limiter so probes and checks don't consume the limit
app.get('/api/health', (_req, res) => res.json({ ok: true }));
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
