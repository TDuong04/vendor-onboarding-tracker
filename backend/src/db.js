// Database setup and seed data. Uses Node's built-in SQLite, so no native install.
import { DatabaseSync } from 'node:sqlite';

// Two tables is the whole model:
//   vendors        - who the vendor is (never holds the stage)
//   stage_changes  - every stage the vendor has been in. The newest row is the current stage.
// Keeping the stage only in the history means the two can never disagree.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS vendors (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    region      TEXT NOT NULL,
    coordinator TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS stage_changes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_id  INTEGER NOT NULL REFERENCES vendors(id),
    from_stage TEXT,            -- NULL for the first row of a vendor
    to_stage   TEXT NOT NULL,
    changed_by TEXT NOT NULL,
    changed_at TEXT NOT NULL,   -- ISO timestamp
    note       TEXT
  );
`;

export const COORDINATORS = ['Linh', 'Huy', 'Mai'];

export function openDb(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

// Seed dates are "days ago" so the demo always shows some stuck vendors.
const SEED_VENDORS = [
  { name: 'Company A', region: 'HCMC',     coordinator: 'Linh', stage: 'Active',            daysAgo: 20 },
  { name: 'Company B', region: 'Can Tho',  coordinator: 'Huy',  stage: 'KYC Docs Received', daysAgo: 12, note: 'Waiting on business license re-upload' },
  { name: 'Company C', region: 'Hanoi',    coordinator: 'Linh', stage: 'Contract Signed',   daysAgo: 3 },
  { name: 'Company D', region: 'HCMC',     coordinator: 'Mai',  stage: 'KYC Verified',      daysAgo: 9 },
  { name: 'Company E', region: 'Da Nang',  coordinator: 'Huy',  stage: 'KYC Docs Received', daysAgo: 7 },
  { name: 'Company F', region: 'HCMC',     coordinator: 'Mai',  stage: 'Contract Sent',     daysAgo: 1 },
];

// Gives each vendor a single history row, as if it had just entered its stage.
export function seed(db, now = new Date()) {
  if (db.prepare('SELECT COUNT(*) AS n FROM vendors').get().n > 0) return;
  const addVendor = db.prepare('INSERT INTO vendors (name, region, coordinator) VALUES (?, ?, ?)');
  const addChange = db.prepare(
    'INSERT INTO stage_changes (vendor_id, from_stage, to_stage, changed_by, changed_at, note) VALUES (?, NULL, ?, ?, ?, ?)'
  );
  for (const v of SEED_VENDORS) {
    const { lastInsertRowid } = addVendor.run(v.name, v.region, v.coordinator);
    const when = new Date(now.getTime() - v.daysAgo * 24 * 60 * 60 * 1000).toISOString();
    addChange.run(lastInsertRowid, v.stage, v.coordinator, when, v.note ?? null);
  }
}
