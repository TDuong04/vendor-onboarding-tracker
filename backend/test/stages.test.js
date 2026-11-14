import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMoveAllowed, isStuck, daysInStage } from '../src/stages.js';

const NOW = new Date('2026-08-10T12:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

test('moves: one step forward or back is allowed', () => {
  assert.equal(isMoveAllowed('Contract Sent', 'Contract Signed'), true);
  assert.equal(isMoveAllowed('KYC Verified', 'KYC Docs Received'), true);
});

test('moves: skipping a stage is not allowed (no Active without KYC)', () => {
  assert.equal(isMoveAllowed('Contract Signed', 'Active'), false);
});

test('moves: same stage and unknown stages are not allowed', () => {
  assert.equal(isMoveAllowed('Active', 'Active'), false);
  assert.equal(isMoveAllowed('Active', 'Nonsense'), false);
});

test('stuck: exactly 7 days is not stuck, 8 days is', () => {
  assert.equal(isStuck('KYC Docs Received', daysAgo(7), NOW), false);
  assert.equal(isStuck('KYC Docs Received', daysAgo(8), NOW), true);
});

test('stuck: Active is never stuck, however old', () => {
  assert.equal(isStuck('Active', daysAgo(100), NOW), false);
});

test('days in stage counts whole days', () => {
  assert.equal(daysInStage(daysAgo(3), NOW), 3);
});
