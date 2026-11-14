// Business logic: read vendors, change a stage, log a note. No HTTP in here.
import { STAGES, isMoveAllowed, daysInStage, isStuck } from './stages.js';

const MAX_NOTE_LENGTH = 500;

// An error that carries the HTTP status the server should answer with.
export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Every history row is either a stage change (from_stage differs from to_stage, or is NULL
// for a vendor's first row) or a note-only row (from_stage equals to_stage).
// "id" always grows, so the highest id is the newest. Three "newest" rows are used:
//   c = newest row of any kind          -> current stage, who touched it last
//   e = newest row that changed stage   -> when the vendor entered this stage (stuck clock)
//   n = newest row that has a note      -> the note to show in the list
// A note-only row does not reset the stuck clock: logging "asked vendor to resend" is not progress.
const CURRENT_STAGE_SQL = `
  SELECT v.id, v.name, v.region, v.coordinator,
         c.to_stage AS stage, c.changed_by AS last_changed_by,
         e.changed_at AS entered_at,
         n.note AS note, n.changed_by AS note_by
  FROM vendors v
  JOIN stage_changes c ON c.id = (
    SELECT MAX(id) FROM stage_changes WHERE vendor_id = v.id
  )
  JOIN stage_changes e ON e.id = (
    SELECT MAX(id) FROM stage_changes
    WHERE vendor_id = v.id AND (from_stage IS NULL OR from_stage != to_stage)
  )
  LEFT JOIN stage_changes n ON n.id = (
    SELECT MAX(id) FROM stage_changes WHERE vendor_id = v.id AND note IS NOT NULL
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

// Notes are optional text, up to MAX_NOTE_LENGTH characters.
function checkNote(note) {
  if (note != null && (typeof note !== 'string' || note.length > MAX_NOTE_LENGTH)) {
    throw new AppError(400, `Note must be text of at most ${MAX_NOTE_LENGTH} characters`);
  }
}

// Reads the vendor and writes a history row in one transaction, so two requests
// cannot both pass the check. `decide` gets the current vendor and returns the row to insert.
// expectedStage is the stage the coordinator was looking at. If someone else changed
// the vendor in the meantime, we refuse instead of silently overwriting their work.
function writeHistory(db, { vendorId, expectedStage, user, now }, decide) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const current = getVendor(db, vendorId);

    if (typeof expectedStage !== 'string') throw new AppError(400, 'expectedStage is required');
    if (current.stage !== expectedStage) {
      throw new AppError(409, `Vendor is now "${current.stage}" (changed by ${current.last_changed_by}). Refresh and try again.`);
    }

    const { toStage, note } = decide(current);
    db.prepare(
      'INSERT INTO stage_changes (vendor_id, from_stage, to_stage, changed_by, changed_at, note) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(vendorId, current.stage, toStage, user, now.toISOString(), note || null);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return withStuckInfo(getVendor(db, vendorId), now);
}

// Moves a vendor to a new stage and records who/when/from/to.
export function changeStage(db, { vendorId, expectedStage, newStage, user, now, note }) {
  if (!STAGES.includes(newStage)) throw new AppError(400, `Unknown stage: ${newStage}`);
  checkNote(note);

  return writeHistory(db, { vendorId, expectedStage, user, now }, (current) => {
    if (!isMoveAllowed(current.stage, newStage)) {
      throw new AppError(400, `Cannot move from "${current.stage}" to "${newStage}". Move one step at a time.`);
    }
    return { toStage: newStage, note };
  });
}

// Records a note without changing the stage, e.g. "KYC failed, asked vendor to resend license".
// Stored as a history row where from_stage equals to_stage. It does not restart the stuck clock.
export function addNote(db, { vendorId, expectedStage, user, now, note }) {
  checkNote(note);
  const text = typeof note === 'string' ? note.trim() : '';
  if (!text) throw new AppError(400, 'Note is required');

  return writeHistory(db, { vendorId, expectedStage, user, now }, (current) => ({
    toStage: current.stage,
    note: text,
  }));
}
