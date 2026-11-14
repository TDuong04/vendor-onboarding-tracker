// HTTP layer: login + three endpoints. Thin on purpose; the rules live in vendors.js.
import crypto from 'node:crypto';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { openDb, seed, COORDINATORS } from './db.js';
import { listVendors, getHistory, changeStage, addNote, AppError } from './vendors.js';
import { STAGES, STUCK_AFTER_DAYS } from './stages.js';

// Mock accounts: every coordinator uses the same demo password. Not for production.
const DEMO_PASSWORD = 'password';

// getNow is a parameter so tests (or a demo) can freeze the clock.
export function createApp(db, getNow = () => new Date()) {
  const app = express();
  app.use(express.json());
  app.use(express.static(fileURLToPath(new URL('../../frontend', import.meta.url))));

  const sessions = new Map(); // token -> coordinator name (lost on restart, fine for a demo)

  app.post('/api/login', (req, res) => {
    const { username, password } = req.body ?? {};
    if (!COORDINATORS.includes(username) || password !== DEMO_PASSWORD) {
      return res.status(401).json({ error: 'Wrong username or password' });
    }
    const token = crypto.randomUUID();
    sessions.set(token, username);
    res.json({ token, user: username });
  });

  // Everything below needs a logged-in coordinator.
  app.use('/api', (req, res, next) => {
    const token = (req.get('Authorization') ?? '').replace('Bearer ', '');
    const user = sessions.get(token);
    if (!user) return res.status(401).json({ error: 'Please log in' });
    req.user = user;
    next();
  });

  app.get('/api/vendors', (req, res) => {
    res.json({ stages: STAGES, stuckAfterDays: STUCK_AFTER_DAYS, vendors: listVendors(db, getNow()) });
  });

  app.get('/api/vendors/:id/history', (req, res) => {
    res.json(getHistory(db, Number(req.params.id)));
  });

  app.post('/api/vendors/:id/stage', (req, res) => {
    const { expectedStage, newStage, note } = req.body ?? {};
    const vendor = changeStage(db, {
      vendorId: Number(req.params.id),
      expectedStage,
      newStage,
      note,
      user: req.user, // who changed it comes from the login, never from the request body
      now: getNow(),
    });
    res.json(vendor);
  });

  // Log a note without changing the stage (e.g. a failed KYC review).
  app.post('/api/vendors/:id/note', (req, res) => {
    const { expectedStage, note } = req.body ?? {};
    const vendor = addNote(db, {
      vendorId: Number(req.params.id),
      expectedStage,
      note,
      user: req.user,
      now: getNow(),
    });
    res.json(vendor);
  });

  // One place turns our errors into HTTP responses.
  app.use((err, req, res, next) => {
    if (err instanceof AppError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });

  return app;
}

// Only start listening when run directly (npm start), not when imported by tests.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = openDb(); // in-memory: resets on restart, seeded fresh each time
  seed(db);
  const port = process.env.PORT ?? 3000;
  createApp(db).listen(port, () => console.log(`http://localhost:${port}`));
}
