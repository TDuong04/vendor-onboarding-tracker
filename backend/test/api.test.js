import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, seed } from '../src/db.js';
import { createApp } from '../src/server.js';

const NOW = new Date('2026-08-10T12:00:00Z');
let server, base;

before(async () => {
  const db = openDb();
  seed(db, NOW);
  server = createApp(db, () => NOW).listen(0); // port 0 = any free port
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

async function call(path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

test('API needs login', async () => {
  assert.equal((await call('/api/vendors')).status, 401);
  assert.equal((await call('/api/login', { body: { username: 'Linh', password: 'wrong' } })).status, 401);
});

test('who changed it comes from the login, not from the request', async () => {
  const { json: login } = await call('/api/login', { body: { username: 'Mai', password: 'password' } });
  // Try to pretend to be Linh by sending changed_by in the body. It must be ignored.
  const move = await call('/api/vendors/6/stage', {
    token: login.token,
    body: { expectedStage: 'Contract Sent', newStage: 'Contract Signed', user: 'Linh', changed_by: 'Linh' },
  });
  assert.equal(move.status, 200);
  const history = await call('/api/vendors/6/history', { token: login.token });
  assert.equal(history.json[0].changed_by, 'Mai');
});

test('invalid JSON body gets 400, not 500', async () => {
  const res = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
  assert.equal(res.status, 400);
});

test('POST note keeps the stage; missing expectedStage is 400; stale is 409', async () => {
  const { json: login } = await call('/api/login', { body: { username: 'Huy', password: 'password' } });
  const token = login.token;
  const before = await call('/api/vendors', { token });
  const e = before.json.vendors.find((v) => v.name === 'Company E');

  const ok = await call(`/api/vendors/${e.id}/note`, { token, body: { expectedStage: e.stage, note: 'asked to resend' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.stage, e.stage);
  assert.equal(ok.json.days_in_stage, e.days_in_stage);

  assert.equal((await call(`/api/vendors/${e.id}/note`, { token, body: { note: 'x' } })).status, 400);
  assert.equal((await call(`/api/vendors/${e.id}/note`, { token, body: { expectedStage: 'Active', note: 'x' } })).status, 409);
  assert.equal((await call(`/api/vendors/${e.id}/stage`, { token, body: { newStage: 'KYC Verified' } })).status, 400);
});
