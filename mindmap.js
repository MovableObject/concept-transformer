/* Concept Transformer — the mind map.
 * Every press is recorded as a small graph in the visitor's browser: the concept is a node, each
 * result is a child node, and the line between them carries the move that made it. "Use this" (in
 * the list or on the map) makes a result the current concept, so the next results grow out of it.
 * The map view draws that graph as a left-to-right tree in SVG, with no outside code (the page's
 * security policy allows only this site's own scripts). Nothing here is ever sent to the server.
 * Loaded after app.js and uses its helpers ($, el, lsGet, lsSet, TAG_RE, copyText). */
'use strict';

const CTMap = (() => {
  const KEY = 'ct.map.v1';
  const MAX_NODES = 400;
  const NODE_W = 230, LINE_H = 17, PAD_X = 10, PAD_Y = 8, TAG_H = 15;
  const GAP_X = 150, GAP_Y = 14, ROOT_GAP = 44, MAX_LINES = 3;

  // ── the graph ──────────────────────────────────────────────────────────────
  // {nodes: {id: node}, order: [ids, oldest first], current: id|null}
  // node: {id, text, plain, tag, parent, press, move, mode, engine, time, folded}
  let graph = load();

  function load() {
    try {
      const g = JSON.parse(lsGet(KEY, '') || 'null');
      if (g && g.nodes && Array.isArray(g.order)) return g;
    } catch { /* fall through */ }
    return { nodes: {}, order: [], current: null };
  }
  function save() {
    trim();
    lsSet(KEY, JSON.stringify(graph));
  }
  const newId = () => 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const norm = (t) => String(t || '').replace(TAG_RE, '').trim().replace(/\s+/g, ' ').toLowerCase();
  const kids = (id) => graph.order.filter((k) => graph.nodes[k].parent === id);
  const roots = () => graph.order.filter((k) => !graph.nodes[k].parent);
  const count = () => graph.order.length;

  /** Drop whole trees, oldest first, until the map is under its size cap. */
  function trim() {
    while (graph.order.length > MAX_NODES) {
      const oldest = roots()[0];
      if (!oldest) break;
      const gone = new Set([oldest]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const k of graph.order) {
          if (!gone.has(k) && gone.has(graph.nodes[k].parent)) { gone.add(k); grew = true; }
        }
      }
      graph.order = graph.order.filter((k) => !gone.has(k));
      for (const k of gone) delete graph.nodes[k];
      if (gone.has(graph.current)) graph.current = null;
    }
  }

  /** The node a press starts from: the current node if it still matches the concept box, else the
   *  newest node with the same text, else a new root (a freshly typed concept starts a new tree). */
  function conceptNode(concept, mode) {
    const want = norm(concept);
    const cur = graph.nodes[graph.current];
    if (cur && cur.plain && norm(cur.plain) === want) return cur;
    for (let i = graph.order.length - 1; i >= 0; i--) {
      const n = graph.nodes[graph.order[i]];
      if (norm(n.plain) === want) return n;
    }
    const n = { id: newId(), text: concept, plain: concept, tag: '', parent: null, press: null,
      move: '', mode, engine: '', time: Date.now(), folded: false };
    graph.nodes[n.id] = n;
    graph.order.push(n.id);
    return n;
  }

  /** Record one press; returns the new result nodes' ids in the order of the variants. */
  function recordPress({ concept, move, mode, engine, variants }) {
    const parent = conceptNode(concept, mode);
    parent.folded = false;
    const press = newId();
    const ids = variants.map((v) => {
      const tag = (v.match(TAG_RE) || [''])[0].trim();
      const n = { id: newId(), text: v, plain: v.slice((v.match(TAG_RE) || [''])[0].length).trim(), tag,
        parent: parent.id, press, move, mode, engine, time: Date.now(), folded: false };
      graph.nodes[n.id] = n;
      graph.order.push(n.id);
      return n.id;
    });
    graph.current = parent.id;
    save();
    if (visible()) draw();
    return ids;
  }

  function setCurrent(id) {
    if (!graph.nodes[id]) return;
    graph.current = id;
    save();
    if (visible()) draw();
  }

  function clear() {
    graph = { nodes: {}, order: [], current: null };
    save();
    if (visible()) draw();
  }

  // ── layout ─────────────────────────────────────────────────────────────────
  let measureCtx = null;
  function wrap(text, font, width, maxLines) {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = font;
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (measureCtx.measureText(test).width <= width || !line) line = test;
      else { lines.push(line); line = w; }
      if (lines.length === maxLines) break;
    }
    if (lines.length < maxLines && line) lines.push(line);
    const used = lines.join(' ').split(/\s+/).length;
    if (used < words.length && lines.length) {
      let last = lines[lines.length - 1];
      while (last && measureCtx.measureText(last + '…').width > width) last = last.replace(/\s*\S+$/, '');
      lines[lines.length - 1] = last + '…';
    }
    return lines;
  }
  const FONT = '13px system-ui, -apple-system, "Segoe UI", sans-serif';
  const TAG_FONT = '11px system-ui, -apple-system, "Segoe UI", sans-serif';

  /** Positions every visible node: {id: {x, y, w, h, lines, tagLine}}. */
  function layout() {
    const box = {};
    const sizeOf = (id) => {
      const n = graph.nodes[id];
      const lines = wrap(n.plain || n.text, FONT, NODE_W - PAD_X * 2, MAX_LINES);
      const tagLine = n.tag ? wrap(n.tag.replace(/^\[|\]$/g, ''), TAG_FONT, NODE_W - PAD_X * 2, 1)[0] : '';
      const h = PAD_Y * 2 + lines.length * LINE_H + (tagLine ? TAG_H : 0);
      return { w: NODE_W, h, lines, tagLine };
    };
    const showKids = (id) => (graph.nodes[id].folded ? [] : kids(id));
    // subtree height
    const sub = {};
    const measure = (id) => {
      box[id] = sizeOf(id);
      const k = showKids(id);
      const kh = k.reduce((s, c, i) => s + measure(c) + (i ? GAP_Y : 0), 0);
      sub[id] = Math.max(box[id].h, kh);
      return sub[id];
    };
    const place = (id, x, top) => {
      const b = box[id];
      b.x = x;
      b.y = top + (sub[id] - b.h) / 2;
      let y = top + (sub[id] - showKids(id).reduce((s, c, i) => s + sub[c] + (i ? GAP_Y : 0), 0)) / 2;
      for (const c of showKids(id)) { place(c, x + NODE_W + GAP_X, y); y += sub[c] + GAP_Y; }
    };
    let top = 0;
    for (const r of roots()) { measure(r); place(r, 0, top); top += sub[r] + ROOT_GAP; }
    return box;
  }

  // ── drawing ────────────────────────────────────────────────────────────────
  const SVGNS = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs = {}, ...kidsEls) => {
    const n = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, String(v));
    for (const c of kidsEls.flat()) if (c != null) n.append(c);
    return n;
  };
  let view = { x: 20, y: 20, k: 1 };
  let boxes = {};
  const visible = () => !$('mapView').hidden;

  function draw() {
    const svg = $('mapSvg');
    svg.textContent = '';
    $('mapEmpty').hidden = count() > 0;
    if (!count()) { $('mapInfo').textContent = ''; return; }
    boxes = layout();
    const g = sv('g', { id: 'mapViewport' });
    const edges = sv('g', { class: 'mm-edges' });
    const labels = sv('g', { class: 'mm-labels' });
    const nodes = sv('g', { class: 'mm-nodes' });
    // edges, and one move label per press (the three results of one press share it)
    const pressDone = new Set();
    for (const id of graph.order) {
      const n = graph.nodes[id];
      if (!n.parent || !boxes[id] || !boxes[n.parent]) continue;
      const a = boxes[n.parent], b = boxes[id];
      const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2, mx = (x1 + x2) / 2;
      edges.append(sv('path', { d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}` }));
      if (!pressDone.has(n.press)) {
        pressDone.add(n.press);
        const sibs = graph.order.filter((k) => graph.nodes[k].press === n.press && boxes[k]);
        const ys = sibs.map((k) => boxes[k].y + boxes[k].h / 2);
        const ly = (Math.min(...ys) + Math.max(...ys)) / 2;
        const lx = x1 + 12;
        const label = wrap(n.move, '600 11px system-ui, sans-serif', GAP_X - 24, 2);
        const t = sv('text', { x: lx, y: ly - (label.length - 1) * 7 + 4, class: 'mm-move' });
        label.forEach((ln, i) => t.append(sv('tspan', { x: lx, dy: i ? 14 : 0 }, ln)));
        labels.append(sv('rect', { x: lx - 4, y: ly - label.length * 7 - 3, width: GAP_X - 16, height: label.length * 14 + 6, rx: 3, class: 'mm-move-bg' }), t);
      }
    }
    for (const id of graph.order) {
      const b = boxes[id];
      if (!b) continue;
      const n = graph.nodes[id];
      const cls = ['mm-node', n.parent ? '' : 'mm-root', id === graph.current ? 'mm-current' : ''].join(' ').trim();
      const node = sv('g', { class: cls, 'data-id': id, transform: `translate(${b.x},${b.y})`, tabindex: 0, role: 'button' });
      node.append(sv('rect', { width: b.w, height: b.h, rx: 4 }));
      const text = sv('text', { x: PAD_X, y: PAD_Y + 13, class: 'mm-text' });
      b.lines.forEach((ln, i) => text.append(sv('tspan', { x: PAD_X, dy: i ? LINE_H : 0 }, ln)));
      node.append(text);
      if (b.tagLine) node.append(sv('text', { x: PAD_X, y: PAD_Y + b.lines.length * LINE_H + 11, class: 'mm-tag' }, b.tagLine));
      node.append(sv('title', {}, fullInfo(n)));
      const k = kids(id).length;
      if (k) {
        const fx = b.w, fy = b.h / 2;
        node.append(sv('g', { class: 'mm-fold', 'data-fold': id },
          sv('circle', { cx: fx, cy: fy, r: 16, class: 'mm-hit' }),
          sv('circle', { cx: fx, cy: fy, r: 8 }),
          sv('text', { x: fx, y: fy + 4, 'text-anchor': 'middle' }, n.folded ? String(k) : '–')));
      }
      nodes.append(node);
    }
    g.append(edges, labels, nodes);
    svg.append(g);
    applyView();
    showInfo(graph.nodes[graph.current]);
  }

  function fullInfo(n) {
    if (!n) return '';
    const how = n.parent ? `${n.move}${n.tag ? ' — ' + n.tag : ''}` : 'Typed concept';
    const by = n.engine ? `\n${n.engine}` : '';
    return `${n.plain || n.text}\n\n${how}${by}`;
  }
  function showInfo(n) {
    const box = $('mapInfo');
    box.textContent = '';
    if (!n) return;
    box.append(el('span', { class: 'lbl' }, n.id === graph.current ? 'Current concept: ' : ''), n.plain || n.text);
    if (n.parent) box.append(el('span', { class: 'how' }, ` · ${n.move}${n.tag ? ' ' + n.tag : ''}`));
  }

  // ── pan, zoom, fit ─────────────────────────────────────────────────────────
  function applyView() {
    const g = $('mapViewport');
    if (g) g.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.k})`);
  }
  function fit() {
    const ids = Object.keys(boxes);
    if (!ids.length) return;
    const svg = $('mapSvg');
    const W = svg.clientWidth || 800, H = svg.clientHeight || 500;
    const minX = Math.min(...ids.map((i) => boxes[i].x)), minY = Math.min(...ids.map((i) => boxes[i].y));
    const maxX = Math.max(...ids.map((i) => boxes[i].x + boxes[i].w)), maxY = Math.max(...ids.map((i) => boxes[i].y + boxes[i].h));
    const k = Math.min(1.2, Math.max(0.2, Math.min((W - 40) / (maxX - minX + 20), (H - 40) / (maxY - minY + 20))));
    view = { k, x: (W - (maxX - minX) * k) / 2 - minX * k, y: (H - (maxY - minY) * k) / 2 - minY * k };
    applyView();
  }
  function zoomAt(px, py, factor) {
    const k = Math.min(3, Math.max(0.15, view.k * factor));
    const f = k / view.k;
    view = { k, x: px - (px - view.x) * f, y: py - (py - view.y) * f };
    applyView();
  }

  function wirePanZoom() {
    const svg = $('mapSvg');
    const pts = new Map();
    let last = null, pinch = null, moved = false, downTarget = null;
    svg.addEventListener('pointerdown', (e) => {
      if (pts.size === 0) downTarget = e.target;   // what was pressed, before capture redirects events
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      svg.setPointerCapture(e.pointerId);
      moved = false;
      if (pts.size === 1) last = { x: e.clientX, y: e.clientY };
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k };
      }
    });
    svg.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        const r = svg.getBoundingClientRect();
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, (pinch.k * d / pinch.d) / view.k);
        moved = true;
      } else if (pts.size === 1 && last) {
        const dx = e.clientX - last.x, dy = e.clientY - last.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
        view.x += dx; view.y += dy; last = { x: e.clientX, y: e.clientY };
        applyView();
      }
    });
    const up = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (!pts.size) last = null;
    };
    svg.addEventListener('pointerup', (e) => {
      up(e);
      if (moved) return;
      // a click (not a drag): fold toggle, or a node
      const target = downTarget && downTarget.closest ? downTarget : null;
      downTarget = null;
      const fold = target && target.closest('[data-fold]');
      if (fold) { toggleFold(fold.getAttribute('data-fold')); return; }
      const node = target && target.closest('.mm-node');
      if (node) useNode(node.getAttribute('data-id'));
    });
    svg.addEventListener('pointercancel', up);
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });
    svg.addEventListener('pointerover', (e) => {
      const node = e.target.closest && e.target.closest('.mm-node');
      if (node) showInfo(graph.nodes[node.getAttribute('data-id')]);
    });
    svg.addEventListener('keydown', (e) => {
      const node = e.target.closest && e.target.closest('.mm-node');
      if (node && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); useNode(node.getAttribute('data-id')); }
    });
  }

  function toggleFold(id) {
    const n = graph.nodes[id];
    if (!n) return;
    n.folded = !n.folded;
    save();
    draw();
  }

  /** Clicking a node makes it the current concept, like "Use this", without leaving the map. */
  function useNode(id) {
    const n = graph.nodes[id];
    if (!n) return;
    const c = $('concept');
    c.value = (n.plain || n.text).slice(0, CONFIG.maxConcept);
    updateCount();
    setCurrent(id);
  }

  // ── exports ────────────────────────────────────────────────────────────────
  function outline() {
    const out = [];
    const walk = (id, depth) => {
      const n = graph.nodes[id];
      const pad = '  '.repeat(depth);
      if (!n.parent) out.push(`${pad}- ${n.plain || n.text}`);
      else out.push(`${pad}- ${n.plain}${n.tag ? ' ' + n.tag : ''} (${n.move})`);
      for (const k of kids(id)) walk(k, depth + 1);
    };
    for (const r of roots()) walk(r, 0);
    return out.join('\n');
  }

  const PNG_STYLE = `
    .mm-edges path{fill:none;stroke:#55555c;stroke-width:1.2}
    .mm-move{fill:#b9b4a6;font:600 11px system-ui,sans-serif}
    .mm-move-bg{fill:#19191b}
    .mm-node rect{fill:#26262a;stroke:#4a4a50}
    .mm-root rect{fill:#2f2f34;stroke:#8a8a90}
    .mm-current rect{stroke:#d8d4c8;stroke-width:1.6}
    .mm-text{fill:#e4e4e6;font:13px system-ui,sans-serif}
    .mm-tag{fill:#8e8e94;font:11px system-ui,sans-serif}
    .mm-fold circle{fill:#19191b;stroke:#6e6e74}
    .mm-fold text{fill:#9a9aa0;font:11px system-ui,sans-serif}`;

  function downloadPicture(btn) {
    const ids = Object.keys(boxes);
    if (!ids.length) return;
    const minX = Math.min(...ids.map((i) => boxes[i].x)) - 20, minY = Math.min(...ids.map((i) => boxes[i].y)) - 20;
    const maxX = Math.max(...ids.map((i) => boxes[i].x + boxes[i].w)) + 30, maxY = Math.max(...ids.map((i) => boxes[i].y + boxes[i].h)) + 20;
    const w = maxX - minX, h = maxY - minY, scale = 2;
    const clone = $('mapViewport').cloneNode(true);
    clone.setAttribute('transform', `translate(${-minX},${-minY})`);
    clone.querySelectorAll('title').forEach((t) => t.remove());
    const svg = sv('svg', { xmlns: SVGNS, width: w, height: h, viewBox: `0 0 ${w} ${h}` },
      sv('style', {}, PNG_STYLE), sv('rect', { width: w, height: h, fill: '#19191b' }), clone);
    const data = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
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
    img.src = data;
  }

  // ── wiring ─────────────────────────────────────────────────────────────────
  function setView(which) {
    const map = which === 'map';
    $('results').hidden = map;
    $('mapView').hidden = !map;
    document.querySelectorAll('#viewSeg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.view === which)));
    lsSet('ct.view', which);
    if (map) { draw(); fit(); }
  }

  function init() {
    document.querySelectorAll('#viewSeg button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
    $('mapFit').addEventListener('click', fit);
    $('mapOutline').addEventListener('click', (e) => copyText(outline(), e.currentTarget, 'Copy as outline'));
    $('mapPicture').addEventListener('click', (e) => downloadPicture(e.currentTarget));
    wirePanZoom();
    setView(lsGet('ct.view', 'list') === 'map' ? 'map' : 'list');
    window.addEventListener('resize', () => { if (visible()) fit(); });
  }

  return { init, recordPress, setCurrent, clear, count, outline, graph: () => graph };
})();

window.CTMap = CTMap;
CTMap.init();
