const $ = (id) => document.getElementById(id);

let token = sessionStorage.getItem('token');
let user = sessionStorage.getItem('user');
let stages = [];

// Small helper: el('td', {class: 'x'}, 'text', childNode)
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.append(...children);
  return node;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  if (res.status === 401) { logout(); throw new Error(body.error); }
  if (!res.ok) throw new Error(body.error);
  return body;
}

// ---- login / logout ----

$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: $('username').value, password: $('password').value }),
  });
  const body = await res.json();
  if (!res.ok) { $('login-error').textContent = body.error; return; }
  token = body.token;
  user = body.user;
  sessionStorage.setItem('token', token);
  sessionStorage.setItem('user', user);
  start();
});

function logout() {
  token = user = null;
  sessionStorage.clear();
  start();
}
$('logout').addEventListener('click', logout);

// ---- vendor table ----

async function loadVendors() {
  const data = await api('/api/vendors');
  stages = data.stages;
  const stuckCount = data.vendors.filter((v) => v.stuck).length;
  $('summary').textContent =
    `${data.vendors.length} vendors, ${stuckCount} stuck (more than ${data.stuckAfterDays} days in the same stage).`;
  $('vendors').replaceChildren(...data.vendors.map(vendorRow));
}

function vendorRow(v) {
  const stageCell = el('td', {}, v.stage);
  if (v.stuck) stageCell.append(el('span', { class: 'badge' }, 'STUCK'));
  if (v.note) stageCell.append(el('div', {}, `${v.note} (${v.note_by})`));

  const historyBox = el('div');
  const historyButton = el('button', {}, 'History');
  historyButton.addEventListener('click', () => toggleHistory(v.id, historyBox));

  const row = el('tr', v.stuck ? { class: 'stuck' } : {},
    el('td', {}, v.name),
    el('td', {}, v.region),
    el('td', {}, v.coordinator),
    stageCell,
    el('td', {}, String(v.days_in_stage)),
    el('td', { class: 'moves' }, ...moveControls(v)),
    el('td', {}, historyButton, historyBox),
  );
  return row;
}

// A note box, one step back, one step forward (if they exist), and "Log note" (note without moving).
function moveControls(v) {
  const i = stages.indexOf(v.stage);
  const note = el('input', { placeholder: 'Note' });
  const buttons = [];
  for (const target of [stages[i - 1], stages[i + 1]]) {
    if (!target) continue;
    const arrow = stages.indexOf(target) > i ? `${target} →` : `← ${target}`;
    const button = el('button', {}, arrow);
    button.addEventListener('click', () => send(v, 'stage', { newStage: target, note: note.value }));
    buttons.push(button);
  }
  const logNote = el('button', {}, 'Log note');
  logNote.addEventListener('click', () => send(v, 'note', { note: note.value }));
  return [note, ...buttons, logNote];
}

// Sends a change for one vendor. kind is "stage" or "note".
async function send(vendor, kind, body) {
  $('message').textContent = '';
  try {
    await api(`/api/vendors/${vendor.id}/${kind}`, {
      method: 'POST',
      body: JSON.stringify({ expectedStage: vendor.stage, ...body }),
    });
  } catch (err) {
    $('message').textContent = err.message; // e.g. someone else already moved it
  }
  loadVendors(); // always reload so the screen matches the server
}

async function toggleHistory(vendorId, box) {
  if (box.hasChildNodes()) { box.replaceChildren(); return; }
  const changes = await api(`/api/vendors/${vendorId}/history`);
  const items = changes.map((c) => {
    const when = new Date(c.changed_at).toLocaleString();
    const noteOnly = c.from_stage === c.to_stage;
    const move = noteOnly ? `Note at ${c.to_stage}` : c.from_stage ? `${c.from_stage} → ${c.to_stage}` : `Started at ${c.to_stage}`;
    return el('li', {}, `${when} - ${c.changed_by}: ${move}${c.note ? ` (${c.note})` : ''}`);
  });
  box.replaceChildren(el('ul', { class: 'history' }, ...items));
}

// ---- start ----

function start() {
  $('login-view').hidden = Boolean(token);
  $('app-view').hidden = !token;
  if (token) {
    $('current-user').textContent = user;
    loadVendors().catch((err) => ($('message').textContent = err.message));
  }
}
start();
