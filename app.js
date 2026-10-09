/* Concept Transformer — a public, stripped-down copy of Hyper Studio's Develop tab.
 * Every press goes through relay.php, which holds the move prompts and the owner's free keys.
 * A visitor's own key rides along with their press, is used for that one request, and is never stored there.
 * This page only knows the move names, descriptions and examples (moves.json). */
'use strict';

// ── Config: every model name lives here. ───────────────────────────────────
const CONFIG = {
  relayUrl: 'relay.php',
  maxConcept: 500,
  shared: {
    gemini: { label: 'Gemini Flash' },
    groq: { label: 'Groq GPT OSS' },
  },
  own: {   // model names live in relay.php / the server config
    gemini: { label: 'Gemini' },
    groq: { label: 'Groq' },
    claude: { label: 'Claude' },
    openai: { label: 'OpenAI' },
  },
  keyLink: 'https://aistudio.google.com/apikey',
};

const LS = {
  engine: 'ct.engine', provider: 'ct.ownProvider', keyPrefix: 'ct.key.', useOwn: 'ct.useOwn', changes: 'ct.showChanges',
};
const lsGet = (k, d = null) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
const lsSet = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private mode */ } };

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null) n.append(c);
  return n;
};

let MOVES = null;   // moves.json
let busy = false;
const state = {
  engine: lsGet(LS.engine, 'gemini'),
  provider: lsGet(LS.provider, 'gemini'),
  useOwn: lsGet(LS.useOwn) === '1',
  showChanges: lsGet(LS.changes, '1') === '1',
  mode: lsGet('ct.mode', ''),   // "image" or "ideas"; checked once moves.json has loaded
};
// Length slider: a maximum word count per mode, 0 = that mode's own default (shown, not sent).
const DEFAULT_WORDS = { image: 16, ideas: 30 };
// Stacking: with "Stack moves" on, move buttons are picked (two or three) and run together by Transform.
state.stacking = false;
state.stack = [];
const wordsFor = (mode) => parseInt(lsGet('ct.words.' + mode, '0'), 10) || 0;
if (!CONFIG.shared[state.engine]) state.engine = 'gemini';
if (!CONFIG.own[state.provider]) state.provider = 'gemini';
// A visitor's key lives only for this visit (sessionStorage, gone when the tab closes) unless they tick
// "Remember on this computer" (localStorage). It is never sent anywhere except with their own presses.
const ssGet = (k) => { try { return sessionStorage.getItem(k) || ''; } catch { return ''; } };
const ssSet = (k, v) => { try { v ? sessionStorage.setItem(k, v) : sessionStorage.removeItem(k); } catch { /* blocked */ } };
const ownKey = (p = state.provider) => ssGet(LS.keyPrefix + p) || lsGet(LS.keyPrefix + p, '');
const keyRemembered = (p = state.provider) => !!lsGet(LS.keyPrefix + p, '');
function saveKey(p, k, remember) {
  ssSet(LS.keyPrefix + p, k);
  lsSet(LS.keyPrefix + p, remember ? k : null);
}
function forgetKey(p) { ssSet(LS.keyPrefix + p, null); lsSet(LS.keyPrefix + p, null); }

// ── Change view: word-level diff (longest common subsequence), as in the studio. ──
const TAG_RE = /^\s*\[[^\]]*\]\s*/;
const normWord = (w) => w.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
function wordDiff(before, after) {
  const a = before.split(/\s+/).filter(Boolean), b = after.split(/\s+/).filter(Boolean);
  const an = a.map(normWord), bn = b.map(normWord);
  const L = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      L[i][j] = an[i] && an[i] === bn[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const parts = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (an[i] && an[i] === bn[j]) { parts.push({ w: b[j], k: 'same' }); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { parts.push({ w: a[i], k: 'del' }); i++; }
    else { parts.push({ w: b[j], k: 'add' }); j++; }
  }
  while (i < a.length) parts.push({ w: a[i++], k: 'del' });
  while (j < b.length) parts.push({ w: b[j++], k: 'add' });
  return { parts, shared: a.length ? L[0][0] / a.length : 0 };
}
function renderText(node, before, after, showChanges) {
  node.textContent = '';
  if (!showChanges || !before) {
    const t = (after.match(TAG_RE) || [''])[0];
    node.textContent = t ? `${after.slice(t.length)} ${t.trim()}` : after;
    return;
  }
  // A leading "[Broke: …]" / "[Po: …]" tag shows plain, AFTER the result, outside the diff.
  const tag = (after.match(TAG_RE) || [''])[0];
  const { parts, shared } = wordDiff(before.replace(TAG_RE, ''), after.slice(tag.length));
  const rewrite = shared < 0.25;  // near-total rewrite: a wall of strike-outs is noise
  let first = true;
  for (const p of parts) {
    if (rewrite && p.k === 'del') continue;
    if (!first) node.append(' ');
    first = false;
    node.append(p.k === 'same' ? p.w : el('span', { class: p.k }, p.w));
  }
  if (tag) node.append(' ', el('span', { class: 'tag' }, tag.trim()));
}

class FriendlyError extends Error {
  constructor(message, opts = {}) { super(message); this.openKey = !!opts.openKey; }
}

async function fetchJson(url, init, who) {
  let r;
  try { r = await fetch(url, init); }
  catch { throw new FriendlyError(`Couldn't reach ${who}. Check your connection and try again.`); }
  let body = null;
  const text = await r.text();
  try { body = JSON.parse(text); } catch { body = null; }
  return { ok: r.ok, status: r.status, body, text };
}

// ownProvider: null for the free engines, else the visitor's provider (their key goes with this one press).
async function callRelay(move, concept, field, ownProvider) {
  const body = { engine: ownProvider ? `own:${ownProvider}` : state.engine, move: move.id, mode: state.mode, concept };
  const words = wordsFor(state.mode);
  if (words) body.words = words;
  if (field) body.field = field;
  if (move.moves) body.moves = move.moves;
  if (ownProvider) body.key = ownKey(ownProvider);
  const res = await fetchJson(CONFIG.relayUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, 'the site');
  const b = res.body || {};
  if (res.ok && Array.isArray(b.variants) && b.variants.length) {
    return { variants: b.variants.slice(0, move.count || 3), engine: b.engine || '', note: b.note || '' };
  }
  const msg = b.message || 'Something went wrong. Press the move again.';
  const openKey = ownProvider ? b.error === 'key' : ['allowance', 'rate', 'busy'].includes(b.error);
  throw new FriendlyError(msg, { openKey });
}

// ── UI ──────────────────────────────────────────────────────────────────────
// A move's label, blurb or example in the current result mode.
const T = (m, key) => (m[key] && typeof m[key] === 'object' ? m[key][state.mode] : m[key]) || '';
function tip(m) { return `${T(m, 'blurb')}\n\ne.g. ${T(m, 'example')}`; }

const fieldInputs = {};
function moveControl(m) {
  const btn = el('button', {
    type: 'button', title: tip(m), 'data-move': m.id,
    onclick: () => (state.stacking ? toggleStack(m) : run(m)),
  }, T(m, 'label'));
  if (state.stack.includes(m.id)) { btn.classList.add('picked'); btn.setAttribute('aria-pressed', 'true'); }
  if (!m.field) return btn;
  const input = el('input', {
    type: 'text', class: 'field', maxlength: String(m.field.max || 100), placeholder: m.field.placeholder || '',
    'aria-label': m.field.label, 'data-field': m.id,
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(m); });
  if (fieldInputs[m.id]) input.value = fieldInputs[m.id].value;   // keep what was typed across mode switches
  fieldInputs[m.id] = input;
  return el('span', { class: 'withField' }, btn, input);
}

function buildMoves() {
  queueMicrotask(applyStackUI);
  const root = $('moves');
  root.textContent = '';
  for (const g of MOVES.groups) {
    root.append(el('div', { class: 'group' },
      el('h2', {}, g),
      el('div', { class: 'btns' }, MOVES.moves.filter((m) => m.group === g).map(moveControl))));
  }
  const body = $('explainBody');
  body.textContent = '';
  body.append(el('p', { class: 'anchor' }, `Every example starts from: ${MOVES.modes[state.mode].anchor}`));
  for (const g of MOVES.groups) {
    body.append(el('h3', {}, g));
    body.append(el('dl', {}, MOVES.moves.filter((m) => m.group === g).flatMap((m) => [
      el('dt', {}, T(m, 'label')),
      el('dd', {}, T(m, 'blurb'), el('br'), 'e.g. ', el('span', { class: 'eg' }, T(m, 'example'))),
    ])));
  }
}

function updateEngineUI() {
  const own = state.useOwn && ownKey(state.useOwnProvider || state.provider);
  document.querySelectorAll('#engineSeg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.engine === state.engine)));
  $('engineSeg').classList.toggle('off', !!own);
  const status = $('engineStatus');
  status.textContent = '';
  if (own) {
    const p = state.useOwnProvider || state.provider;
    status.append(`Using your ${CONFIG.own[p].label} key. `,
      el('button', { type: 'button', class: 'link', onclick: () => { state.useOwn = false; lsSet(LS.useOwn, '0'); updateEngineUI(); } }, 'Back to the free engines'));
  } else {
    status.textContent = 'Free, shared allowance.';
  }
  $('ownProvider').value = state.provider;
  $('ownKey').value = ownKey();
  $('ownKeyForget').disabled = !ownKey();
  $('ownKeyRemember').checked = keyRemembered();
}

const KEY_HELP = {
  gemini: ['In Google AI Studio, create the key in a NEW project and do not set up billing on it. It then runs on the free tier and nothing can be charged.',
    'https://aistudio.google.com/apikey', 'Google AI Studio keys'],
  groq: ['Groq keys on the free plan have no card attached, so nothing can be charged. Make a key just for this site and delete it when you are done.',
    'https://console.groq.com/keys', 'Groq keys'],
  claude: ['In the Claude Console, make a separate workspace with a low monthly spend limit, and create the key inside it.',
    'https://console.anthropic.com/settings/workspaces', 'Claude Console workspaces'],
  openai: ['In the OpenAI dashboard, make a separate project with a low monthly budget, and create the key inside that project.',
    'https://platform.openai.com/settings/organization/projects', 'OpenAI projects'],
};
function showKeyHelp() {
  const [text, href, label] = KEY_HELP[state.provider] || KEY_HELP.gemini;
  const box = $('keyHelpBody');
  box.textContent = '';
  box.append(el('p', {}, text, ' ', el('a', { href, target: '_blank', rel: 'noopener noreferrer' }, label), '.'),
    el('p', {}, 'Use a key made only for this site, and delete it when you have finished trying the site.'));
}

function openKeyPanel(open = true) {
  $('ownKeyPanel').hidden = !open;
  $('ownKeyToggle').setAttribute('aria-expanded', String(open));
  if (open) $('ownKey').focus({ preventScroll: true });
}

function setBusy(b) {
  busy = b;
  document.querySelectorAll('#moves button').forEach((x) => { x.disabled = b; });
  applyStackUI();
}

// ── Stacking ──
const moveById = (id) => MOVES.moves.find((m) => m.id === id);
function toggleStack(m) {
  if (!m.stackable) return;
  const i = state.stack.indexOf(m.id);
  if (i >= 0) state.stack.splice(i, 1);
  else if (state.stack.length < (MOVES.stack_max || 3)) state.stack.push(m.id);
  else { $('stackHint').textContent = `Up to ${MOVES.stack_max || 3} moves. Unpick one first.`; return; }
  buildMoves();
}
function applyStackUI() {
  if (!MOVES) return;
  const n = state.stack.length, max = MOVES.stack_max || 3;
  document.querySelectorAll('#moves [data-move]').forEach((b) => {
    const m = moveById(b.dataset.move);
    if (state.stacking && m && !m.stackable) b.disabled = true;
  });
  document.querySelectorAll('#moves input.field').forEach((x) => { x.disabled = state.stacking; });
  $('stackGo').hidden = !state.stacking;
  $('stackGo').disabled = busy || n < 2;
  $('stackGo').textContent = n >= 2 ? `Transform with ${n} moves` : 'Transform';
  $('stackHint').textContent = !state.stacking ? ''
    : n === 0 ? `Pick two or three moves from SCAMPER and Transforms.`
    : n < 2 ? 'Pick one more.'
    : state.stack.map((id) => T(moveById(id), 'label')).join(' + ');
  void max;
}
function runStack() {
  if (state.stack.length < 2) return;
  const parts = state.stack.map(moveById);
  const label = {};
  for (const mode of Object.keys(MOVES.modes)) label[mode] = parts.map((m) => (typeof m.label === 'object' ? m.label[mode] : m.label)).join(' + ');
  run({ id: 'stack', label, count: 3, moves: [...state.stack] });
}

let speaking = null;
function speak(text, btn) {
  const synth = window.speechSynthesis;
  if (!synth) return;
  const was = speaking === btn;
  synth.cancel();
  document.querySelectorAll('.card .say').forEach((x) => { x.textContent = 'Read aloud'; });
  speaking = null;
  if (was) return;  // second press stops
  const u = new SpeechSynthesisUtterance(text.replace(TAG_RE, ''));
  u.onend = u.onerror = () => { if (speaking === btn) { btn.textContent = 'Read aloud'; speaking = null; } };
  speaking = btn;
  btn.textContent = 'Stop';
  synth.speak(u);
}

async function copyText(text, btn, label = 'Copy') {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const t = el('textarea', {}, text); document.body.append(t); t.select();
    try { document.execCommand('copy'); } catch { /* ignore */ }
    t.remove();
  }
  btn.textContent = 'Copied';
  setTimeout(() => { btn.textContent = label; }, 1200);
}

function useThis(text, nodeId) {
  if (nodeId && window.CTMap) CTMap.setCurrent(nodeId);
  const c = $('concept');
  c.value = text.replace(TAG_RE, '').slice(0, CONFIG.maxConcept);
  updateCount();
  c.focus();
  c.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderCard(v, before, nodeId) {
  const text = el('div', { class: 'text' });
  text.dataset.before = before; text.dataset.after = v;
  renderText(text, before, v, state.showChanges);
  const say = el('button', { type: 'button', class: 'say' }, 'Read aloud');
  say.addEventListener('click', () => speak(v, say));
  const copy = el('button', { type: 'button' }, 'Copy');
  copy.addEventListener('click', () => { const t = (v.match(TAG_RE) || [''])[0]; copyText(t ? `${v.slice(t.length)} ${t.trim()}` : v, copy); });
  return el('div', { class: 'card' }, text,
    el('div', { class: 'acts' }, copy, say, el('button', { type: 'button', onclick: () => useThis(v, nodeId) }, 'Use this')));
}

// Results arrive best first: show the best, keep the rest behind a "more" link (shared with the map).
function renderCards(box, before, variants, nodeIds = []) {
  if (!variants.length) return;
  box.append(renderCard(variants[0], before, nodeIds[0]));
  const rest = variants.slice(1);
  if (!rest.length) return;
  const more = el('div', { class: 'more' });
  rest.forEach((v, i) => more.append(renderCard(v, before, nodeIds[i + 1])));
  const press = nodeIds[0] && window.CTMap ? CTMap.pressOf(nodeIds[0]) : null;
  const opened = !!(press && CTMap.graph().open && CTMap.graph().open[press]);
  more.hidden = !opened;
  const label = (open) => (open ? 'Hide the other results' : `${rest.length} more`);
  const toggle = el('button', { type: 'button', class: 'link moreToggle' }, label(opened));
  toggle.addEventListener('click', () => {
    more.hidden = !more.hidden;
    toggle.textContent = label(!more.hidden);
    if (press) CTMap.setOpen(press, !more.hidden);
  });
  box.append(toggle, more);
}

async function run(move) {
  if (busy) return;
  const concept = $('concept').value.trim().replace(/\s+/g, ' ');
  if (!concept) { $('concept').focus(); return; }
  const field = move.field ? fieldInputs[move.id].value.trim().replace(/\s+/g, ' ') : '';
  if (move.field && !field) { fieldInputs[move.id].focus(); return; }
  const ownProvider = state.useOwn && ownKey(state.useOwnProvider || state.provider) ? (state.useOwnProvider || state.provider) : null;
  const engineName = (ownProvider ? `your ${CONFIG.own[ownProvider].label} key` : CONFIG.shared[state.engine].label)
    + ` · ${MOVES.modes[state.mode].label}`;
  const label = T(move, 'label');
  const box = el('div', { class: 'run' },
    el('div', { class: 'head' }, el('span', { class: 'mv' }, move.field ? `${label.replace(/ with$/, '')} · ${field}` : label),
      el('span', { class: 'from' }, concept), el('span', { class: 'eng' }, engineName)));
  const working = el('div', { class: 'working' }, 'Working…');
  box.append(working);
  $('results').prepend(box);
  $('clearResults').hidden = false;
  setBusy(true);
  try {
    const { variants, engine, note } = await callRelay(move, concept, field, ownProvider);
    working.remove();
    // The free engines may hand a press to Groq when Gemini is out for the day: name who answered.
    if (!ownProvider && CONFIG.shared[engine] && engine !== state.engine) {
      box.querySelector('.eng').textContent = `${CONFIG.shared[engine].label} · ${MOVES.modes[state.mode].label}`;
    }
    if (note) box.append(el('div', { class: 'note' }, note));
    const answeredBy = box.querySelector('.eng').textContent;
    const moveLabel = move.field ? `${label.replace(/ with$/, '')} → ${field}` : label;
    const nodeIds = window.CTMap ? CTMap.recordPress({ concept, move: moveLabel, mode: state.mode, engine: answeredBy, variants }) : [];
    renderCards(box, move.diff === false ? '' : concept, variants, nodeIds);
  } catch (e) {
    working.remove();
    const msg = e instanceof FriendlyError ? e.message : 'Something went wrong. Press the move again.';
    const err = el('div', { class: 'err' }, msg);
    if (e.openKey && !ownProvider) {
      err.append(' ', el('a', { href: CONFIG.keyLink, target: '_blank', rel: 'noopener' }, 'Get a free Gemini key'), '.');
      openKeyPanel(true);
    } else if (e.openKey) openKeyPanel(true);
    box.append(err);
    if (!(e instanceof FriendlyError)) console.error(e);
  } finally {
    setBusy(false);
  }
}

function rerenderAll() {
  document.querySelectorAll('.card .text').forEach((t) => renderText(t, t.dataset.before, t.dataset.after, state.showChanges));
}

function updateCount() {
  const n = $('concept').value.length;
  $('count').textContent = n > CONFIG.maxConcept - 60 ? `${n} / ${CONFIG.maxConcept}` : '';
}

function wire() {
  document.querySelectorAll('#engineSeg button').forEach((b) => b.addEventListener('click', () => {
    state.engine = b.dataset.engine; lsSet(LS.engine, state.engine);
    state.useOwn = false; lsSet(LS.useOwn, '0');
    updateEngineUI();
  }));
  $('ownKeyToggle').addEventListener('click', () => openKeyPanel($('ownKeyPanel').hidden));
  $('ownProvider').addEventListener('change', (e) => {
    state.provider = e.target.value; lsSet(LS.provider, state.provider);
    $('ownKey').value = ownKey(); $('ownKeyForget').disabled = !ownKey(); $('ownKeyRemember').checked = keyRemembered();
    showKeyHelp();
  });
  $('ownKeyUse').addEventListener('click', () => {
    const k = $('ownKey').value.trim();
    if (!k) { $('ownKey').focus(); return; }
    saveKey(state.provider, k, $('ownKeyRemember').checked);
    state.useOwn = true; state.useOwnProvider = state.provider;
    lsSet(LS.useOwn, '1'); lsSet('ct.useOwnProvider', state.provider);
    updateEngineUI();
    openKeyPanel(false);
  });
  $('ownKeyForget').addEventListener('click', () => {
    forgetKey(state.provider);
    if (state.useOwnProvider === state.provider) { state.useOwn = false; lsSet(LS.useOwn, '0'); }
    updateEngineUI();
  });
  $('ownKey').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('ownKeyUse').click(); });
  $('ownKeyRemember').addEventListener('change', (e) => {
    const k = ownKey();
    if (k) saveKey(state.provider, k, e.target.checked);
  });
  $('showChanges').checked = state.showChanges;
  $('showChanges').addEventListener('change', (e) => {
    state.showChanges = e.target.checked; lsSet(LS.changes, state.showChanges ? '1' : '0'); rerenderAll();
  });
  $('clearResults').addEventListener('click', () => {
    const mapNodes = window.CTMap ? CTMap.count() : 0;
    if (mapNodes && !window.confirm('Clear the results and the map?')) return;
    window.speechSynthesis?.cancel();
    $('results').textContent = '';
    if (window.CTMap) CTMap.clear();
    $('clearResults').hidden = true;
  });
  $('concept').addEventListener('input', updateCount);
  $('words').addEventListener('input', (e) => {
    lsSet('ct.words.' + state.mode, e.target.value);
    showWords();
  });
  $('wordsReset').addEventListener('click', () => { lsSet('ct.words.' + state.mode, null); showWords(); });
  $('stackToggle').addEventListener('change', (e) => {
    state.stacking = e.target.checked;
    if (!state.stacking) state.stack = [];
    buildMoves();
  });
  $('stackGo').addEventListener('click', runStack);
}

function buildModes() {
  const seg = $('modeSeg');
  seg.textContent = '';
  for (const [id, m] of Object.entries(MOVES.modes)) {
    seg.append(el('button', {
      type: 'button', role: 'radio', 'data-mode': id, 'aria-checked': String(id === state.mode),
      onclick: () => setMode(id),
    }, m.label));
  }
}

function showWords() {
  const custom = wordsFor(state.mode);
  const n = custom || DEFAULT_WORDS[state.mode] || 16;
  $('words').value = String(n);
  $('wordsOut').textContent = `up to ${n} words${custom ? '' : ' (default)'}`;
  $('wordsReset').hidden = !custom;
}

function setMode(id) {
  if (!MOVES.modes[id]) return;
  state.mode = id;
  lsSet('ct.mode', id);
  document.querySelectorAll('#modeSeg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === id)));
  $('concept').placeholder = MOVES.modes[id].placeholder;
  showWords();
  buildMoves();
  if (busy) setBusy(true);
}

async function init() {
  state.useOwnProvider = lsGet('ct.useOwnProvider', state.provider);
  wire();
  updateEngineUI();
  showKeyHelp();
  if (lsGet('ct.map.v1', '')) $('clearResults').hidden = false;
  try {
    const r = await fetch('moves.json', { cache: 'no-cache' });
    MOVES = await r.json();
    if (!MOVES.modes[state.mode]) state.mode = MOVES.default_mode;
    buildModes();
    setMode(state.mode);
  } catch {
    $('moves').textContent = 'The moves did not load. Reload the page.';
  }
}
init();
