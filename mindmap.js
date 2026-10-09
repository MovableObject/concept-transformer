/* Concept Transformer — the map (version 2: the map is the app).
 *
 * Three kinds of box: a CONCEPT (typed, or a result), a TRANSFORM (the move that was applied), and the
 * results of that transform, which are concepts again and can be transformed in turn. One press makes
 * one transform node with three results; the transform shows one result at a time and its "1 of 3 ▸"
 * button rotates through them. Everything lives in the visitor's browser (localStorage); nothing on
 * this map is ever sent to the server except the one concept a press is about.
 *
 * Boxes keep their places: new boxes go into the first free spot beside their parent, so nothing
 * moves by itself. Dragging a box moves its whole branch. "Tidy up" lays the whole map out again.
 * Drawn as SVG by this file, no outside code (the page's security policy allows only its own scripts).
 * Loaded after app.js; uses its helpers ($, el, lsGet, lsSet, TAG_RE, CONFIG, MOVES, state, updateCount)
 * and calls back into it through window.CTApp. */
'use strict';

const CTMap = (() => {
  const KEY = 'ct.map.v2', OLD_KEY = 'ct.map.v1';
  const MAX_NODES = 900;
  const C_W = 230, T_W = 150;                     // concept and transform box widths
  const LINE_H = 17, PAD_X = 10, PAD_Y = 8;
  const GAP_X = 46;                               // between a box and the next column
  const GAP_Y = 16, ROOT_GAP = 36, CLEAR = 10;    // vertical spacing; minimum clearance around boxes
  const MAX_LINES = 3;

  // ── the graph ──────────────────────────────────────────────────────────────
  // {v: 2, nodes: {id: node}, order: [ids, oldest first], selected: id|null}
  // concept:   {id, kind: 'concept', parent: transformId|null, rank: null|0|1|2, text, plain, tag, x, y, time}
  // transform: {id, kind: 'transform', parent: conceptId, move, moveIds, field, mode, words, engine,
  //             note, status: 'working'|'done'|'error', error, shown, x, y, time}
  let graph = load();
  const N = () => graph.nodes;
  const newId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const children = (id) => graph.order.filter((k) => N()[k].parent === id);
  const roots = () => graph.order.filter((k) => !N()[k].parent);
  const count = () => graph.order.length;
  const node = (id) => (id && N()[id]) || null;
  const results = (tid) => children(tid).filter((k) => N()[k].kind === 'concept').sort((a, b) => (N()[a].rank || 0) - (N()[b].rank || 0));
  const shownResult = (tid) => { const r = results(tid); const t = N()[tid]; return r[Math.min(t.shown || 0, r.length - 1)] || null; };

  function load() {
    try {
      const g = JSON.parse(lsGet(KEY, '') || 'null');
      if (g && g.v === 2 && g.nodes && Array.isArray(g.order)) return g;
    } catch { /* fall through */ }
    return migrate() || { v: 2, nodes: {}, order: [], selected: null };
  }
  function save() {
    trim();
    lsSet(KEY, JSON.stringify(graph));
  }

  /** Version 1 maps (one node per result, grouped by press) become version 2 (transform nodes).
   *  Positions are filled in by tidy() once the map is ready (see init). */
  function migrate() {
    let g1;
    try { g1 = JSON.parse(lsGet(OLD_KEY, '') || 'null'); } catch { return null; }
    if (!g1 || !g1.nodes || !Array.isArray(g1.order) || !g1.order.length) return null;
    const g = { v: 2, nodes: {}, order: [], selected: null, needsTidy: true };
    const tOf = {};
    for (const id of g1.order) {
      const o = g1.nodes[id];
      if (!o) continue;
      if (!o.parent) {
        g.nodes[id] = { id, kind: 'concept', parent: null, rank: null, text: o.text, plain: o.plain || o.text, tag: '', time: o.time || 0 };
        g.order.push(id);
        continue;
      }
      let tid = tOf[o.press];
      if (!tid) {
        tid = 't' + o.press;
        tOf[o.press] = tid;
        g.nodes[tid] = { id: tid, kind: 'transform', parent: o.parent, move: o.move || '', moveIds: [], field: '', mode: o.mode || 'image',
          words: 0, engine: o.engine || '', note: '', status: 'done', error: '', shown: (g1.shown && g1.shown[o.press]) || 0, time: o.time || 0 };
        g.order.push(tid);
      }
      const rank = o.rank != null ? o.rank : Object.values(g.nodes).filter((n) => n.parent === tid).length;
      g.nodes[id] = { id, kind: 'concept', parent: tid, rank, text: o.text, plain: o.plain || o.text, tag: o.tag || '', time: o.time || 0 };
      g.order.push(id);
    }
    return g;
  }

  function descendants(id) {
    const out = [];
    const walk = (k) => { for (const c of children(k)) { out.push(c); walk(c); } };
    walk(id);
    return out;
  }
  function remove(id) {
    const gone = new Set([id, ...descendants(id)]);
    graph.order = graph.order.filter((k) => !gone.has(k));
    for (const k of gone) delete N()[k];
    if (gone.has(graph.selected)) graph.selected = null;
  }
  /** Drop whole trees, oldest first, until the map is under its size cap. */
  function trim() {
    while (graph.order.length > MAX_NODES && roots().length > 1) remove(roots()[0]);
  }

  /** The boxes that are drawn: a result only while it is its transform's shown option, and only if
   *  everything above it is drawn too. */
  function visibleSet() {
    const vis = new Set();
    const walk = (id) => {
      vis.add(id);
      if (N()[id].kind === 'transform') { const r = shownResult(id); if (r) walk(r); }
      else for (const t of children(id)) walk(t);
    };
    for (const r of roots()) walk(r);
    return vis;
  }

  // ── sizes and text ─────────────────────────────────────────────────────────
  let measureCtx = null;
  const family = () => getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim() || 'system-ui, sans-serif';
  function wrap(text, font, width, maxLines) {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = font;
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (measureCtx.measureText(test).width <= width || !line) line = test;
      else { lines.push(line); line = w; }
      if (lines.length === maxLines) break;
    }
    if (lines.length < maxLines && line) lines.push(line);
    const used = lines.join(' ').split(/\s+/).filter(Boolean).length;
    if (used < words.length && lines.length) {
      let last = lines[lines.length - 1];
      while (last && measureCtx.measureText(last + '…').width > width) last = last.replace(/\s*\S+$/, '');
      lines[lines.length - 1] = last + '…';
    }
    return lines.length ? lines : [''];
  }
  const sizeCache = new Map();
  function size(id) {
    const n = N()[id];
    if (n.kind === 'transform') {
      const r = shownResult(id);
      const tag = r && N()[r].tag ? N()[r].tag.replace(/^\[|\]$/g, '') : '';
      const status = n.status === 'working' ? 'working…' : n.status === 'error' ? 'failed, select for details' : '';
      const total = results(id).length;
      const key = `t|${n.move}|${tag}|${status}|${total}|${family()}`;
      if (sizeCache.has(key)) return sizeCache.get(key);
      const lines = wrap(n.move, `600 12px ${family()}`, T_W - PAD_X * 2, 2);
      const tagLines = tag ? wrap(tag, `11px ${family()}`, T_W - PAD_X * 2, 2) : [];
      const extra = (status ? 1 : 0) + tagLines.length;
      const s = { w: T_W, h: PAD_Y * 2 + lines.length * 15 + extra * 14 + (total > 1 ? 20 : 0), lines, tagLines, status };
      sizeCache.set(key, s);
      return s;
    }
    const key = `c|${n.plain}|${family()}`;
    if (sizeCache.has(key)) return sizeCache.get(key);
    const lines = wrap(n.plain || n.text, `13px ${family()}`, C_W - PAD_X * 2, MAX_LINES);
    const s = { w: C_W, h: PAD_Y * 2 + lines.length * LINE_H, lines };
    sizeCache.set(key, s);
    return s;
  }
  const rect = (id) => { const n = N()[id], s = size(id); return { x: n.x || 0, y: n.y || 0, w: s.w, h: s.h }; };

  // ── placement: new boxes never move old ones ───────────────────────────────
  function hits(r, ignore) {
    for (const k of graph.order) {
      if (ignore.has(k)) continue;
      if (N()[k].x == null) continue;
      const o = rect(k);
      if (r.x < o.x + o.w + CLEAR && o.x < r.x + r.w + CLEAR && r.y < o.y + o.h + CLEAR && o.y < r.y + r.h + CLEAR) return true;
    }
    return false;
  }
  /** Put a transform (and its results, which share one spot) beside its concept, in the nearest free row. */
  function placePress(tid) {
    const t = N()[tid], p = rect(t.parent);
    const ts = size(tid);
    const rIds = results(tid);
    const rs = rIds.length ? size(rIds[0]) : { w: C_W, h: 40 };
    const tx = p.x + p.w + GAP_X, rx = tx + T_W + GAP_X;
    const cy = p.y + p.h / 2;
    const ignore = new Set([tid, ...rIds, ...rIds.flatMap(descendants)]);
    const laterPress = children(t.parent).filter((k) => k !== tid).length > 0;
    for (let i = 0; i < 600; i++) {
      const off = laterPress ? i * 8 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 8;   // a later press goes below the earlier ones
      const ty = cy + off - ts.h / 2, ry = cy + off - rs.h / 2;
      if (!hits({ x: tx, y: ty, w: T_W, h: ts.h }, ignore) && !hits({ x: rx, y: ry, w: rs.w, h: rs.h }, ignore)) {
        t.x = tx; t.y = ty;
        for (const r of rIds) { N()[r].x = rx; N()[r].y = ry; }
        return;
      }
    }
    t.x = tx; t.y = cy; for (const r of rIds) { N()[r].x = rx; N()[r].y = cy; }
  }
  function placeRoot(id) {
    const n = N()[id];
    const others = graph.order.filter((k) => k !== id && N()[k].x != null);
    if (!others.length) { n.x = 0; n.y = 0; return; }
    const rootXs = roots().filter((k) => k !== id && N()[k].x != null).map((k) => N()[k].x);
    n.x = rootXs.length ? Math.min(...rootXs) : 0;
    n.y = Math.max(...others.map((k) => rect(k).y + rect(k).h)) + ROOT_GAP;
  }

  /** Lay the whole map out again as tidy left-to-right trees. Hidden options share their shown sibling's spot. */
  function tidy(redraw = true) {
    sizeCache.clear();
    const sub = {};
    const measure = (id) => {
      const n = N()[id], s = size(id);
      if (n.kind === 'transform') {
        const r = shownResult(id);
        for (const o of results(id)) measure(o);
        sub[id] = Math.max(s.h, r ? sub[r] : 0);
      } else {
        const ts = children(id);
        const kh = ts.reduce((acc, t, i) => acc + measure(t) + (i ? GAP_Y : 0), 0);
        sub[id] = Math.max(s.h, kh);
      }
      return sub[id];
    };
    const place = (id, x, top) => {
      const n = N()[id], s = size(id);
      n.x = x; n.y = top + (sub[id] - s.h) / 2;
      if (n.kind === 'transform') {
        for (const o of results(id)) place(o, x + T_W + GAP_X, top + (sub[id] - sub[o]) / 2);
      } else {
        const ts = children(id);
        let y = top + (sub[id] - ts.reduce((acc, t, i) => acc + sub[t] + (i ? GAP_Y : 0), 0)) / 2;
        for (const t of ts) { place(t, x + C_W + GAP_X, y); y += sub[t] + GAP_Y; }
      }
    };
    let top = 0;
    for (const r of roots()) { measure(r); place(r, 0, top); top += sub[r] + ROOT_GAP; }
    if (redraw) { save(); draw(); fit(); }
  }

  // ── presses ────────────────────────────────────────────────────────────────
  /** The box a move applies to: the selected concept, or a selected transform's shown result
   *  (or its source while it has none). A freshly typed concept is planted first by ensureTarget. */
  function target() {
    const n = node(graph.selected);
    if (!n) return null;
    if (n.kind === 'concept') return n;
    return node(shownResult(n.id)) || node(n.parent);
  }
  function ensureTarget() {
    const typed = $('concept').value.trim();
    if (typed) return plant(typed);
    return target();
  }
  function plant(text) {
    const clean = text.replace(/\s+/g, ' ').slice(0, CONFIG.maxConcept);
    const id = newId('c');
    N()[id] = { id, kind: 'concept', parent: null, rank: null, text: clean, plain: clean, tag: '', time: Date.now() };
    graph.order.push(id);
    placeRoot(id);
    graph.selected = id;
    $('concept').value = '';
    updateCount();
    save();
    if (!isMap()) setView('map');
    draw();
    centerOn(id, true);
    return N()[id];
  }
  function plantFromBox() {
    const typed = $('concept').value.trim();
    if (!typed) { $('concept').focus(); return; }
    plant(typed);
  }

  function beginPress(conceptId, info) {
    const id = newId('t');
    N()[id] = { id, kind: 'transform', parent: conceptId, move: info.move, moveIds: info.moveIds, field: info.field || '',
      mode: info.mode, words: info.words || 0, engine: info.engine, note: '', status: 'working', error: '', shown: 0, time: Date.now() };
    graph.order.push(id);
    placePress(id);
    graph.selected = id;
    closePicker();
    save();
    if (!isMap()) setView('map');
    draw();
    centerOn(id, true);
    return id;
  }
  function finishPress(tid, { variants, engine, note }) {
    const t = node(tid);
    if (!t) return;
    t.status = 'done'; t.engine = engine || t.engine; t.note = note || '';
    variants.forEach((v, rank) => {
      const tagRaw = (v.match(TAG_RE) || [''])[0];
      const id = newId('c');
      N()[id] = { id, kind: 'concept', parent: tid, rank, text: v, plain: v.slice(tagRaw.length).trim(), tag: tagRaw.trim(), time: Date.now() };
      graph.order.push(id);
    });
    placePress(tid);                       // placed again now the result's real size is known
    graph.selected = shownResult(tid);     // ready to chain: the best result is selected
    save();
    draw();
    centerOn(graph.selected, true);
  }
  function failPress(tid, message) {
    const t = node(tid);
    if (!t) return;
    t.status = 'error'; t.error = message;
    graph.selected = tid;
    save();
    draw();
  }

  /** Rotate a transform to its next (or a given) option. If one of its options was selected, the
   *  newly shown option becomes the selection, so the next move applies to what is on screen. */
  function show(tid, index) {
    const t = node(tid);
    const opts = results(tid);
    if (!t || opts.length < 2) return;
    const i = ((index % opts.length) + opts.length) % opts.length;
    const wasSelected = opts.includes(graph.selected);
    t.shown = i;
    if (wasSelected) graph.selected = opts[i];
    save();
    draw();
  }
  const rotate = (tid) => { const t = node(tid); if (t) show(tid, (t.shown || 0) + 1); };

  function deleteBranch(id) {
    const n = node(id);
    if (!n) return;
    const what = n.kind === 'concept' && n.parent ? n.parent : id;    // a result's branch is its whole press
    const parent = node(what).parent;
    if (!window.confirm('Delete this box and everything that grew from it?')) return;
    remove(what);
    graph.selected = node(parent) ? parent : null;
    closePicker();
    save();
    draw();
  }
  function undoLastPress() {
    const ts = graph.order.filter((k) => N()[k].kind === 'transform');
    if (!ts.length) return;
    const last = ts.reduce((a, b) => (N()[a].time >= N()[b].time ? a : b));
    const parent = N()[last].parent;
    remove(last);
    graph.selected = node(parent) ? parent : null;
    closePicker();
    save();
    draw();
  }
  function clear() {
    graph = { v: 2, nodes: {}, order: [], selected: null };
    lsSet(OLD_KEY, null);
    save();
    closePicker();
    draw();
  }

  // ── drawing ────────────────────────────────────────────────────────────────
  const SVGNS = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs = {}, ...kids) => {
    const n = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, String(v));
    for (const c of kids.flat()) if (c != null) n.append(c);
    return n;
  };
  let view = { x: 40, y: 40, k: 1 };
  let vis = new Set();
  const isMap = () => !$('mapView').hidden;

  function draw() {
    refreshTarget();
    refreshPanel();
    if (!$('outlineView').hidden) buildOutline();
    const svg = $('mapSvg');
    svg.textContent = '';
    $('mapEmpty').hidden = count() > 0;
    for (const id of graph.order) {
      const n = N()[id];
      if (n.x != null) continue;
      if (n.kind === 'transform') placePress(id); else if (!n.parent) placeRoot(id);
    }
    vis = visibleSet();
    const g = sv('g', { id: 'mapViewport' });
    const edges = sv('g', { class: 'mm-edges' });
    const boxes = sv('g', { class: 'mm-nodes' });
    for (const id of graph.order) {
      if (!vis.has(id)) continue;
      const n = N()[id];
      if (!n.parent || !vis.has(n.parent)) continue;
      const a = rect(n.parent), b = rect(id);
      const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2, mx = (x1 + x2) / 2;
      edges.append(sv('path', { d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}` }));
    }
    for (const id of graph.order) {
      if (!vis.has(id)) continue;
      boxes.append(N()[id].kind === 'transform' ? drawTransform(id) : drawConcept(id));
    }
    g.append(edges, boxes);
    svg.append(g);
    applyView();
  }

  function drawConcept(id) {
    const n = N()[id], b = rect(id), s = size(id);
    const cls = ['mm-node', 'mm-concept', n.parent ? 'mm-result' : 'mm-root', id === graph.selected ? 'mm-selected' : ''].join(' ');
    const gEl = sv('g', { class: cls, 'data-id': id, transform: `translate(${b.x},${b.y})`, tabindex: 0, role: 'button' });
    gEl.append(sv('rect', { width: b.w, height: b.h, rx: 4 }));
    const text = sv('text', { x: PAD_X, y: PAD_Y + 13, class: 'mm-text' });
    s.lines.forEach((ln, i) => text.append(sv('tspan', { x: PAD_X, dy: i ? LINE_H : 0 }, ln)));
    gEl.append(text, sv('title', {}, n.plain || n.text));
    if (id === graph.selected) {
      gEl.append(sv('g', { class: 'mm-plus', 'data-plus': id },
        sv('title', {}, 'Transform this: open the moves'),
        sv('rect', { x: b.w + 4, y: b.h / 2 - 11, width: 22, height: 22, rx: 4 }),
        sv('text', { x: b.w + 15, y: b.h / 2 + 5, 'text-anchor': 'middle' }, '+')));
    }
    return gEl;
  }

  function drawTransform(id) {
    const n = N()[id], b = rect(id), s = size(id);
    const cls = ['mm-node', 'mm-transform', `mm-${n.status}`, id === graph.selected ? 'mm-selected' : ''].join(' ');
    const gEl = sv('g', { class: cls, 'data-id': id, transform: `translate(${b.x},${b.y})`, tabindex: 0, role: 'button' });
    gEl.append(sv('rect', { width: b.w, height: b.h, rx: 4 }));
    let y = PAD_Y + 12;
    const mv = sv('text', { x: PAD_X, y, class: 'mm-move' });
    s.lines.forEach((ln, i) => mv.append(sv('tspan', { x: PAD_X, dy: i ? 15 : 0 }, ln)));
    gEl.append(mv);
    y += (s.lines.length - 1) * 15 + 14;
    for (const ln of s.tagLines) { gEl.append(sv('text', { x: PAD_X, y, class: 'mm-tag' }, ln)); y += 14; }
    if (s.status) gEl.append(sv('text', { x: PAD_X, y, class: 'mm-status' }, s.status));
    const total = results(id).length;
    if (total > 1) {
      gEl.append(sv('g', { class: 'mm-rot', 'data-rotate': id },
        sv('title', {}, 'Show the next option from this press'),
        sv('rect', { x: PAD_X - 2, y: b.h - 22, width: 66, height: 17, rx: 3 }),
        sv('text', { x: PAD_X + 31, y: b.h - 9.5, 'text-anchor': 'middle' }, `${(n.shown || 0) + 1} of ${total} ▸`)));
    }
    gEl.append(sv('title', {}, `${n.move}${n.engine ? ' — ' + n.engine : ''}`));
    return gEl;
  }

  // ── the panel above the map: the selected box in full, with its actions ───
  const movesReady = () => typeof MOVES !== 'undefined' && MOVES;
  function refreshPanel() {
    const box = $('nodePanel');
    box.textContent = '';
    const n = node(graph.selected);
    if (!n) {
      if (count()) box.append(el('span', { class: 'muted' }, 'Select a box to see it in full and to transform it.'));
      return;
    }
    const acts = el('div', { class: 'acts' });
    if (n.kind === 'concept') {
      const t = n.parent ? node(n.parent) : null;
      const src = t ? node(t.parent) : null;
      const text = el('div', { class: 'text' });
      CTApp.renderText(text, src ? (src.plain || src.text) : '', n.text, state.showChanges && !!src);
      box.append(el('div', { class: 'meta' }, t ? `${t.move}${t.engine ? ' · ' + t.engine : ''}` : 'Typed concept'), text);
      const say = el('button', { type: 'button', class: 'say' }, 'Read aloud');
      say.addEventListener('click', () => CTApp.speak(n.plain || n.text, say));
      const copy = el('button', { type: 'button' }, 'Copy');
      copy.addEventListener('click', () => CTApp.copyText(n.tag ? `${n.plain} ${n.tag}` : (n.plain || n.text), copy));
      acts.append(el('button', { type: 'button', class: 'primary', onclick: () => openPicker(n.id) }, 'Transform this…'), copy, say);
      if (t && results(t.id).length > 1) acts.append(el('button', { type: 'button', onclick: () => rotate(t.id) }, `Next option (${(t.shown || 0) + 1} of ${results(t.id).length})`));
      acts.append(el('button', { type: 'button', class: 'ghost', onclick: () => deleteBranch(n.id) }, 'Delete branch'));
    } else {
      const blurbs = movesReady() ? (n.moveIds || []).map((m) => CTApp.moveById(m)).filter(Boolean)
        .map((m) => (typeof m.blurb === 'object' ? m.blurb[n.mode] : m.blurb)).join(' ') : '';
      box.append(el('div', { class: 'meta' }, n.engine || 'Transform'), el('div', { class: 'text tmove' }, n.move));
      if (blurbs) box.append(el('p', { class: 'blurb' }, blurbs));
      if (n.note) box.append(el('p', { class: 'note' }, n.note));
      if (n.status === 'error') box.append(el('p', { class: 'err' }, n.error));
      if (n.status === 'working') box.append(el('p', { class: 'note' }, 'Working…'));
      if (n.moveIds && n.moveIds.length && movesReady()) acts.append(el('button', { type: 'button', class: 'primary', disabled: n.status === 'working' || busy, onclick: () => CTApp.runAgain(n) }, 'Run again'));
      if (results(n.id).length > 1) acts.append(el('button', { type: 'button', onclick: () => rotate(n.id) }, `Next option (${(n.shown || 0) + 1} of ${results(n.id).length})`));
      acts.append(el('button', { type: 'button', class: 'ghost', onclick: () => deleteBranch(n.id) }, 'Delete branch'));
    }
    box.append(acts);
  }

  /** The line on the left that says what the moves will apply to. */
  function refreshTarget() {
    const line = $('targetLine');
    if (!line) return;
    const typed = $('concept').value.trim();
    const t = target();
    line.textContent = '';
    if (typed) line.append('A move adds this as a new concept on the map and transforms it.');
    else if (t) {
      const txt = t.plain || t.text;
      line.append('Moves apply to: ', el('b', {}, txt.length > 90 ? txt.slice(0, 90) + '…' : txt));
    } else line.append('Type a concept above, or select a box on the map.');
  }

  // ── the "+" picker on a box ────────────────────────────────────────────────
  let pickerFor = null;
  function openPicker(id) {
    if (!node(id)) return;
    graph.selected = id;
    pickerFor = id;
    if (!isMap()) setView('map');
    save();
    draw();
    const p = $('picker');
    CTApp.buildPicker(p);
    p.hidden = false;
    positionPicker();
    const first = p.querySelector('button[data-move]:not(:disabled)');
    if (first) first.focus({ preventScroll: true });
  }
  function closePicker() { pickerFor = null; const p = $('picker'); if (p) p.hidden = true; }
  function refreshPicker() { if (pickerFor && !$('picker').hidden) CTApp.buildPicker($('picker')); }
  function positionPicker() {
    const p = $('picker');
    if (!pickerFor || p.hidden) return;
    if (!node(pickerFor)) { closePicker(); return; }
    if (window.matchMedia('(max-width: 700px)').matches) { p.style.left = ''; p.style.top = ''; return; }   // phone: a bottom sheet
    const r = rect(pickerFor), svg = $('mapSvg');
    const W = svg.clientWidth, H = svg.clientHeight;
    const pw = p.offsetWidth || 330, ph = p.offsetHeight || 300;
    let left = view.x + (r.x + r.w + 34) * view.k, top = view.y + r.y * view.k - 10;
    if (left + pw > W - 8) left = Math.max(8, view.x + r.x * view.k - pw - 12);
    top = Math.max(8, Math.min(top, H - ph - 8));
    p.style.left = `${Math.round(left)}px`;
    p.style.top = `${Math.round(top)}px`;
  }

  // ── pan, zoom, fit, select, drag ───────────────────────────────────────────
  function applyView() {
    const g = $('mapViewport');
    if (g) g.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.k})`);
    positionPicker();
  }
  function bounds(ids) {
    const rs = ids.map(rect);
    return { minX: Math.min(...rs.map((r) => r.x)), minY: Math.min(...rs.map((r) => r.y)),
      maxX: Math.max(...rs.map((r) => r.x + r.w)), maxY: Math.max(...rs.map((r) => r.y + r.h)) };
  }
  function fit() {
    const ids = [...vis];
    if (!ids.length) return;
    const svg = $('mapSvg');
    const W = svg.clientWidth || 800, H = svg.clientHeight || 500;
    const b = bounds(ids);
    const k = Math.min(1.15, Math.max(0.2, Math.min((W - 70) / (b.maxX - b.minX + 40), (H - 60) / (b.maxY - b.minY + 30))));
    view = { k, x: (W - (b.maxX - b.minX) * k) / 2 - b.minX * k, y: (H - (b.maxY - b.minY) * k) / 2 - b.minY * k };
    applyView();
  }
  /** Bring a box into view if it is off screen (without changing the zoom). */
  function centerOn(id, onlyIfHidden = false) {
    if (!node(id) || !isMap()) return;
    const svg = $('mapSvg');
    const W = svg.clientWidth || 800, H = svg.clientHeight || 500;
    const r = rect(id);
    const sx = view.x + r.x * view.k, sy = view.y + r.y * view.k, sw = r.w * view.k, sh = r.h * view.k;
    if (onlyIfHidden && sx > 20 && sy > 20 && sx + sw < W - 40 && sy + sh < H - 20) return;
    view.x = W / 2 - (r.x + r.w / 2) * view.k;
    view.y = H / 2 - (r.y + r.h / 2) * view.k;
    applyView();
  }
  function zoomAt(px, py, factor) {
    const k = Math.min(3, Math.max(0.15, view.k * factor));
    const f = k / view.k;
    view = { k, x: px - (px - view.x) * f, y: py - (py - view.y) * f };
    applyView();
  }

  function select(id) {
    if (!node(id)) return;
    graph.selected = id;
    if (pickerFor && pickerFor !== id) closePicker();
    save();
    draw();
  }

  function wirePointer() {
    const svg = $('mapSvg');
    const pts = new Map();
    let mode = null;           // 'pan' | 'drag' | 'pinch'
    let start = null, last = null, pinch = null, moved = false, downTarget = null, dragOrig = null;
    svg.addEventListener('pointerdown', (e) => {
      if (pts.size === 0) downTarget = e.target;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      svg.setPointerCapture(e.pointerId);
      moved = false;
      if (pts.size === 1) {
        start = last = { x: e.clientX, y: e.clientY };
        const box = downTarget.closest && downTarget.closest('.mm-node');
        const onButton = downTarget.closest && downTarget.closest('[data-rotate],[data-plus]');
        if (box && !onButton) {
          mode = 'drag';
          const id = box.getAttribute('data-id');
          dragOrig = [id, ...descendants(id)].map((k) => ({ k, x: N()[k].x, y: N()[k].y }));
        } else mode = 'pan';
      }
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k };
        mode = 'pinch';
        if (dragOrig) { for (const o of dragOrig) { N()[o.k].x = o.x; N()[o.k].y = o.y; } dragOrig = null; draw(); }
      }
    });
    svg.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (mode === 'pinch' && pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        const r = svg.getBoundingClientRect();
        zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, (pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d) / view.k);
        moved = true;
        return;
      }
      if (!last) return;
      if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 4) return;
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      moved = true;
      last = { x: e.clientX, y: e.clientY };
      if (mode === 'drag' && dragOrig) {
        const tx = (e.clientX - start.x) / view.k, ty = (e.clientY - start.y) / view.k;
        for (const o of dragOrig) { N()[o.k].x = o.x + tx; N()[o.k].y = o.y + ty; }
        draw();
      } else if (mode === 'pan') {
        view.x += dx; view.y += dy;
        applyView();
      }
    });
    const end = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (!pts.size) {
        const wasDrag = mode === 'drag' && moved && dragOrig;
        mode = null; last = null; dragOrig = null;
        if (wasDrag) save();
      }
    };
    svg.addEventListener('pointerup', (e) => {
      const t = downTarget && downTarget.closest ? downTarget : null;
      const wasMoved = moved;
      end(e);
      downTarget = null;
      if (wasMoved || !t) return;
      const rot = t.closest('[data-rotate]');
      if (rot) { rotate(rot.getAttribute('data-rotate')); return; }
      const plus = t.closest('[data-plus]');
      if (plus) { openPicker(plus.getAttribute('data-plus')); return; }
      const box = t.closest('.mm-node');
      if (box) select(box.getAttribute('data-id'));
      else if (pickerFor) closePicker();
    });
    svg.addEventListener('pointercancel', end);
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });
    svg.addEventListener('dblclick', (e) => {
      const box = e.target.closest && e.target.closest('.mm-concept');
      if (box) openPicker(box.getAttribute('data-id'));
    });
    svg.addEventListener('keydown', (e) => {
      const box = e.target.closest && e.target.closest('.mm-node');
      if (!box) return;
      const id = box.getAttribute('data-id');
      if (e.key === 'Enter') { e.preventDefault(); if (graph.selected === id && N()[id].kind === 'concept') openPicker(id); else select(id); }
      else if (e.key === ' ') { e.preventDefault(); select(id); }
      else if (e.key === 'Delete') { e.preventDefault(); deleteBranch(id); }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pickerFor) closePicker(); });
  }

  // ── outline, save and open, picture ────────────────────────────────────────
  function outlineLines() {
    const lines = [];
    const walk = (id, depth) => {
      const n = N()[id];
      if (n.kind === 'concept') {
        lines.push({ depth, id, kind: 'concept', text: n.plain || n.text });
        for (const t of children(id)) walk(t, depth + 1);
      } else {
        const opts = results(id).length;
        const r = shownResult(id);
        const tag = r && N()[r].tag ? N()[r].tag.replace(/^\[|\]$/g, '') : '';
        lines.push({ depth, id, kind: 'transform', text: n.move, tag: [tag, opts > 1 ? `option ${(n.shown || 0) + 1} of ${opts}` : ''].filter(Boolean).join(' · ') });
        if (r) walk(r, depth + 1);
      }
    };
    for (const r of roots()) walk(r, 0);
    return lines;
  }
  const outlineText = () => outlineLines()
    .map((l) => `${'  '.repeat(l.depth)}${l.kind === 'transform' ? '→ ' : '- '}${l.text}${l.tag ? ` (${l.tag})` : ''}`).join('\n');
  function buildOutline() {
    const body = $('outlineBody');
    body.textContent = '';
    const lines = outlineLines();
    if (!lines.length) { body.append(el('p', { class: 'muted' }, 'Nothing on the map yet.')); return; }
    for (const l of lines) {
      const row = el('div', { class: `oline o-${l.kind}${l.id === graph.selected ? ' o-selected' : ''}` });
      row.style.paddingLeft = `${l.depth * 22}px`;
      const txt = el('span', { class: 'otext', role: 'button', tabindex: 0 }, l.kind === 'transform' ? `→ ${l.text}` : l.text);
      txt.addEventListener('click', () => { graph.selected = l.id; save(); draw(); });
      row.append(txt);
      if (l.tag) row.append(el('span', { class: 'otag' }, l.tag));
      if (l.kind === 'concept') {
        const copy = el('button', { type: 'button', class: 'mini' }, 'Copy');
        copy.addEventListener('click', () => CTApp.copyText(l.text, copy));
        const say = el('button', { type: 'button', class: 'mini say' }, 'Read aloud');
        say.addEventListener('click', () => CTApp.speak(l.text, say));
        row.append(copy, say);
      }
      body.append(row);
    }
  }

  function saveFile() {
    if (!count()) return;
    const data = JSON.stringify({ app: 'concept-transformer', v: 2, saved: new Date().toISOString(), graph }, null, 1);
    const a = el('a', { href: 'data:application/json;charset=utf-8,' + encodeURIComponent(data), download: `concept-map-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove();
  }
  function openFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const d = JSON.parse(String(reader.result));
        const g = d && d.graph;
        const ok = g && g.v === 2 && g.nodes && Array.isArray(g.order)
          && g.order.every((k) => g.nodes[k] && (g.nodes[k].kind === 'concept' || g.nodes[k].kind === 'transform'));
        if (!ok) throw new Error('not a map');
        if (count() && !window.confirm('Replace the map on screen with the one in this file?')) return;
        for (const k of g.order) {     // keep only plain values; nothing from the file runs
          const n = g.nodes[k];
          for (const f of ['text', 'plain', 'tag', 'move', 'engine', 'note', 'error', 'field', 'mode']) if (n[f] != null) n[f] = String(n[f]);
          for (const f of ['x', 'y', 'shown', 'rank', 'words', 'time']) if (n[f] != null) n[f] = Number(n[f]) || 0;
          n.moveIds = Array.isArray(n.moveIds) ? n.moveIds.map(String) : [];
        }
        graph = { v: 2, nodes: g.nodes, order: g.order, selected: null };
        sizeCache.clear();
        save();
        draw();
        fit();
      } catch {
        window.alert('That file is not a Concept Transformer map.');
      }
    };
    reader.readAsText(file);
  }

  function pngStyle() {
    const v = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return `
    .mm-edges path{fill:none;stroke:${v('--input')};stroke-width:1.2}
    .mm-concept rect{fill:${v('--card')};stroke:${v('--input')}}
    .mm-root rect{fill:${v('--secondary')};stroke:${v('--muted-foreground')}}
    .mm-transform>rect{fill:${v('--background')};stroke:${v('--chart-3')};stroke-dasharray:4 3}
    .mm-selected>rect{stroke:${v('--primary')};stroke-width:1.8;stroke-dasharray:none}
    .mm-text{fill:${v('--foreground')};font:13px system-ui,sans-serif}
    .mm-move{fill:${v('--chart-1')};font:600 12px system-ui,sans-serif}
    .mm-tag,.mm-status{fill:${v('--muted-foreground')};font:11px system-ui,sans-serif}
    .mm-rot rect{fill:${v('--card')};stroke:${v('--input')}}
    .mm-rot text{fill:${v('--muted-foreground')};font:10px system-ui,sans-serif}`;
  }
  function downloadPicture(btn) {
    const ids = [...vis];
    if (!ids.length) return;
    const b = bounds(ids);
    const minX = b.minX - 20, minY = b.minY - 20, w = b.maxX - b.minX + 50, h = b.maxY - b.minY + 40, scale = 2;
    const clone = $('mapViewport').cloneNode(true);
    clone.setAttribute('transform', `translate(${-minX},${-minY})`);
    clone.querySelectorAll('title, .mm-plus').forEach((t) => t.remove());
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--background').trim();
    const svg = sv('svg', { xmlns: SVGNS, width: w, height: h, viewBox: `0 0 ${w} ${h}` },
      sv('style', {}, pngStyle()), sv('rect', { width: w, height: h, fill: bg }), clone);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = Math.ceil(w * scale); c.height = Math.ceil(h * scale);
      const ctx = c.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      const a = el('a', { href: c.toDataURL('image/png'), download: 'concept-map.png' });
      document.body.append(a); a.click(); a.remove();
      if (btn) { btn.textContent = 'Saved'; setTimeout(() => { btn.textContent = 'Download picture'; }, 1200); }
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
  }

  // ── wiring ─────────────────────────────────────────────────────────────────
  function setView(which) {
    const map = which !== 'outline';
    $('mapView').hidden = !map;
    $('outlineView').hidden = map;
    document.querySelectorAll('#viewSeg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.view === (map ? 'map' : 'outline'))));
    ['mapFit', 'mapTidy', 'mapPicture'].forEach((id) => { $(id).disabled = !map; });
    lsSet('ct.view2', map ? 'map' : 'outline');
    if (map) draw(); else { closePicker(); buildOutline(); }
  }

  function init() {
    if (graph.needsTidy) { delete graph.needsTidy; tidy(false); save(); }
    document.querySelectorAll('#viewSeg button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
    $('mapFit').addEventListener('click', fit);
    $('mapTidy').addEventListener('click', () => tidy(true));
    $('mapUndo').addEventListener('click', undoLastPress);
    $('mapSave').addEventListener('click', saveFile);
    $('mapOpen').addEventListener('click', () => $('mapFile').click());
    $('mapFile').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; if (f) openFile(f); e.target.value = ''; });
    $('mapPicture').addEventListener('click', (e) => downloadPicture(e.currentTarget));
    $('outlineCopy').addEventListener('click', (e) => CTApp.copyText(outlineText(), e.currentTarget, 'Copy all'));
    wirePointer();
    setView(lsGet('ct.view2', 'map') === 'outline' ? 'outline' : 'map');
    if (count()) requestAnimationFrame(fit);
    window.addEventListener('resize', positionPicker);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { sizeCache.clear(); draw(); });
  }

  return { init, node, target, ensureTarget, plantFromBox, beginPress, finishPress, failPress, show, rotate,
    clear, count, refreshPanel, refreshTarget, refreshPicker, closePicker, openPicker, tidy, outlineText, graph: () => graph };
})();

window.CTMap = CTMap;
CTMap.init();
