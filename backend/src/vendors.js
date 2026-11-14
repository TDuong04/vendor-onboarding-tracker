// Business logic: read vendors, change a stage. No HTTP in here.
import { STAGES, isMoveAllowed, daysInStage, isStuck } from './stages.js';

// An error that carries the HTTP status the server should answer with.
export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Newest history row per vendor = current stage. "id" always grows, so the highest id is the newest.
const CURRENT_STAGE_SQL = `
  SELECT v.id, v.name, v.region, v.coordinator,
         c.to_stage AS stage, c.changed_at AS entered_at, c.changed_by AS last_changed_by, c.note
  FROM vendors v
  JOIN stage_changes c ON c.id = (
    SELECT MAX(id) FROM stage_changes WHERE vendor_id = v.id
  )
`;

function withStuckInfo(row, now) {
  return {
    ...row,
    days_in_stage: daysInStage(row.entered_at, now),
    stuck: isStuck(row.stage, row.entered_at, now),
  };
}

export function listVendors(db, now) {
  return db.prepare(CURRENT_STAGE_SQL + ' ORDER BY v.id').all().map((row) => withStuckInfo(row, now));
}

export function getHistory(db, vendorId) {
  getVendor(db, vendorId); // 404 if the vendor does not exist
  return db
    .prepare('SELECT * FROM stage_changes WHERE vendor_id = ? ORDER BY id DESC')
    .all(vendorId);
}

function getVendor(db, vendorId) {
  const row = db.prepare(CURRENT_STAGE_SQL + ' WHERE v.id = ?').get(vendorId);
  if (!row) throw new AppError(404, 'Vendor not found');
  return row;
}

// Moves a vendor to a new stage and records who/when/from/to.
// expectedStage is the stage the coordinator was looking at. If someone else changed
// the vendor in the meantime, we refuse instead of silently overwriting their work.
export function changeStage(db, { vendorId, expectedStage, newStage, user, now, note }) {
  if (!STAGES.includes(newStage)) throw new AppError(400, `Unknown stage: ${newStage}`);

  // The read and the write happen together, so two requests cannot both pass the check.
  db.exec('BEGIN IMMEDIATE');
  try {
    const current = getVendor(db, vendorId);

    if (current.stage !== expectedStage) {
      throw new AppError(409, `Vendor is now "${current.stage}" (changed by ${current.last_changed_by}). Refresh and try again.`);
    }
    if (!isMoveAllowed(current.stage, newStage)) {
      throw new AppError(400, `Cannot move from "${current.stage}" to "${newStage}". Move one step at a time.`);
    }

    db.prepare(
      'INSERT INTO stage_changes (vendor_id, from_stage, to_stage, changed_by, changed_at, note) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(vendorId, current.stage, newStage, user, now.toISOString(), note || null);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return withStuckInfo(getVendor(db, vendorId), now);
}
