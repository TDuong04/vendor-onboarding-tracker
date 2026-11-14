import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, seed } from '../src/db.js';
import { listVendors, getHistory, changeStage, addNote } from '../src/vendors.js';

const NOW = new Date('2026-08-10T12:00:00Z');

// Fresh in-memory database for every test, so tests never affect each other.
function setup() {
  const db = openDb();
  seed(db, NOW);
  return db;
}
const find = (db, name) => listVendors(db, NOW).find((v) => v.name === name);

test('seeded vendors show a stage and days in stage', () => {
  const db = setup();
  const b = find(db, 'Company B');
  assert.equal(b.stage, 'KYC Docs Received');
  assert.equal(b.days_in_stage, 12);
  assert.equal(b.stuck, true);
  assert.equal(find(db, 'Company F').stuck, false);
});

test('changing a stage records who, when, from and to', () => {
  const db = setup();
  const f = find(db, 'Company F');
  changeStage(db, { vendorId: f.id, expectedStage: 'Contract Sent', newStage: 'Contract Signed', user: 'Huy', now: NOW });

  const latest = getHistory(db, f.id)[0]; // newest first
  assert.equal(latest.changed_by, 'Huy');
  assert.equal(latest.changed_at, NOW.toISOString());
  assert.equal(latest.from_stage, 'Contract Sent');
  assert.equal(latest.to_stage, 'Contract Signed');
});

test('changing a stage restarts the stuck clock', () => {
  const db = setup();
  const b = find(db, 'Company B'); // stuck for 12 days
  changeStage(db, { vendorId: b.id, expectedStage: 'KYC Docs Received', newStage: 'KYC Verified', user: 'Mai', now: NOW });
  const after = find(db, 'Company B');
  assert.equal(after.days_in_stage, 0);
  assert.equal(after.stuck, false);
});

test('history keeps every change, newest first', () => {
  const db = setup();
  const f = find(db, 'Company F');
  changeStage(db, { vendorId: f.id, expectedStage: 'Contract Sent', newStage: 'Contract Signed', user: 'Linh', now: NOW });
  changeStage(db, { vendorId: f.id, expectedStage: 'Contract Signed', newStage: 'Contract Sent', user: 'Mai', now: NOW });
  const history = getHistory(db, f.id);
  assert.deepEqual(history.map((h) => h.to_stage), ['Contract Sent', 'Contract Signed', 'Contract Sent']);
});

test('skipping a stage is rejected and nothing is written', () => {
  const db = setup();
  const c = find(db, 'Company C');
  assert.throws(
    () => changeStage(db, { vendorId: c.id, expectedStage: 'Contract Signed', newStage: 'Active', user: 'Linh', now: NOW }),
    { status: 400 }
  );
  assert.equal(getHistory(db, c.id).length, 1);
});

test('stale update is rejected (two coordinators, same vendor)', () => {
  const db = setup();
  const f = find(db, 'Company F');
  // Linh and Huy both see "Contract Sent". Linh saves first.
  changeStage(db, { vendorId: f.id, expectedStage: 'Contract Sent', newStage: 'Contract Signed', user: 'Linh', now: NOW });
  // Huy's screen is out of date, so his change must fail instead of overwriting.
  assert.throws(
    () => changeStage(db, { vendorId: f.id, expectedStage: 'Contract Sent', newStage: 'Contract Signed', user: 'Huy', now: NOW }),
    { status: 409 }
  );
  assert.equal(getHistory(db, f.id).length, 2);
});

test('unknown vendor and unknown stage are rejected', () => {
  const db = setup();
  assert.throws(() => changeStage(db, { vendorId: 999, expectedStage: 'x', newStage: 'Active', user: 'Linh', now: NOW }), { status: 404 });
  assert.throws(() => changeStage(db, { vendorId: 1, expectedStage: 'Active', newStage: 'Bogus', user: 'Linh', now: NOW }), { status: 400 });
});

test('bad notes are rejected and nothing is written', () => {
  const db = setup();
  const f = find(db, 'Company F');
  const move = (note) => () =>
    changeStage(db, { vendorId: f.id, expectedStage: 'Contract Sent', newStage: 'Contract Signed', user: 'Linh', now: NOW, note });
  assert.throws(move({ a: 1 }), { status: 400 }); // not text
  assert.throws(move('x'.repeat(501)), { status: 400 }); // too long
  assert.equal(getHistory(db, f.id).length, 1);
  move('x'.repeat(500))(); // exactly the limit is fine
  assert.equal(getHistory(db, f.id).length, 2);
});

test('a note without moving keeps the stage and does NOT restart the stuck clock', () => {
  const db = setup();
  const b = find(db, 'Company B'); // KYC Docs Received for 12 days
  addNote(db, { vendorId: b.id, expectedStage: 'KYC Docs Received', user: 'Mai', now: NOW, note: 'KYC failed, asked vendor to resend license' });

  const after = find(db, 'Company B');
  assert.equal(after.stage, 'KYC Docs Received');
  assert.equal(after.days_in_stage, 12);
  assert.equal(after.stuck, true);
  assert.equal(after.note, 'KYC failed, asked vendor to resend license');
  assert.equal(after.note_by, 'Mai');

  const latest = getHistory(db, b.id)[0];
  assert.equal(latest.from_stage, 'KYC Docs Received');
  assert.equal(latest.to_stage, 'KYC Docs Received');
  assert.equal(latest.changed_by, 'Mai');
});

test('a note-only row does not hide the real stage change from the stuck clock', () => {
  const db = setup();
  const f = find(db, 'Company F');
  changeStage(db, { vendorId: f.id, expectedStage: 'Contract Sent', newStage: 'Contract Signed', user: 'Linh', now: NOW });
  const later = new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000);
  addNote(db, { vendorId: f.id, expectedStage: 'Contract Signed', user: 'Linh', now: later, note: 'chasing vendor' });
  assert.equal(listVendors(db, later).find((v) => v.name === 'Company F').days_in_stage, 3);
});

test('an older note stays visible after a move without a note', () => {
  const db = setup();
  const b = find(db, 'Company B'); // seeded with a note
  changeStage(db, { vendorId: b.id, expectedStage: 'KYC Docs Received', newStage: 'KYC Verified', user: 'Mai', now: NOW });
  const after = find(db, 'Company B');
  assert.equal(after.note, 'Waiting on business license re-upload');
  assert.equal(after.note_by, 'Huy');
});

test('note-only: empty note, stale stage and bad types are rejected', () => {
  const db = setup();
  const f = find(db, 'Company F');
  const add = (over) => () => addNote(db, { vendorId: f.id, expectedStage: 'Contract Sent', user: 'Linh', now: NOW, note: 'ok', ...over });
  assert.throws(add({ note: '   ' }), { status: 400 });
  assert.throws(add({ note: undefined }), { status: 400 });
  assert.throws(add({ note: { a: 1 } }), { status: 400 });
  assert.throws(add({ expectedStage: 'Active' }), { status: 409 });
  assert.throws(add({ vendorId: 999 }), { status: 404 });
  assert.equal(getHistory(db, f.id).length, 1);
});

test('missing expectedStage is a 400, not a stale-update 409', () => {
  const db = setup();
  const f = find(db, 'Company F');
  assert.throws(
    () => changeStage(db, { vendorId: f.id, newStage: 'Contract Signed', user: 'Linh', now: NOW }),
    { status: 400 }
  );
  assert.throws(() => addNote(db, { vendorId: f.id, user: 'Linh', now: NOW, note: 'x' }), { status: 400 });
});
