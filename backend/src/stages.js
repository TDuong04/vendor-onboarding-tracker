// Workflow rules. Pure functions only: no database, no clock, easy to test.

export const STAGES = [
  'Contract Sent',
  'Contract Signed',
  'KYC Docs Received',
  'KYC Verified',
  'Active',
];

// A vendor is "stuck" after this many days in one stage.
export const STUCK_AFTER_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

// A move is allowed only one step forward or one step back.
// Forward = normal progress. Back = fixing a mistake (the history keeps the record).
// Skipping stages is not allowed, so nobody can reach Active without KYC.
export function isMoveAllowed(from, to) {
  const a = STAGES.indexOf(from);
  const b = STAGES.indexOf(to);
  if (a === -1 || b === -1) return false;
  return Math.abs(a - b) === 1;
}

// Whole days spent in the current stage.
export function daysInStage(enteredAt, now) {
  return Math.floor((now - new Date(enteredAt)) / DAY_MS);
}

// Stuck = strictly more than the limit. Active is the end of the line, so never stuck.
export function isStuck(stage, enteredAt, now, limit = STUCK_AFTER_DAYS) {
  if (stage === 'Active') return false;
  return daysInStage(enteredAt, now) > limit;
}
