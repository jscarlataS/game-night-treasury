/*
 * app.js — rendering and routing. All computation comes from scoring.js and
 * all copy from strings.js; this file only builds DOM from their output.
 */
import * as S from './scoring.js';
import { STRINGS as T } from './strings.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
let DATA = null;
let tableCounter = 0;

// ---------------------------------------------------------------------------
// DOM helpers. Everything is built with createElement; no innerHTML anywhere,
// so nicknames and game names are always plain text.
// ---------------------------------------------------------------------------

function applyAttrs(node, attrs) {
  if (!attrs) return;
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'style' && typeof value === 'object') {
      for (const [prop, v] of Object.entries(value)) node.style.setProperty(prop, v);
    } else node.setAttribute(key, value === true ? '' : String(value));
  }
}

function appendChildren(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

function el(tag, attrs = null, ...children) {
  const node = document.createElement(tag);
  applyAttrs(node, attrs);
  appendChildren(node, children);
  return node;
}

function svg(tag, attrs = null, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  applyAttrs(node, attrs);
  appendChildren(node, children);
  return node;
}

function fragment(...children) {
  const f = document.createDocumentFragment();
  appendChildren(f, children);
  return f;
}

// ---------------------------------------------------------------------------
// Formatting.
// ---------------------------------------------------------------------------

const fmt = S.formatTenths;
const fmtP = (P) => P.toFixed(1);
const pad2 = (n) => String(n).padStart(2, '0');
const fill = (template, vars) => template.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function ordinal(p) {
  const v = p % 100;
  const suffix = v >= 11 && v <= 13 ? T.ordinal.other : (T.ordinal[p % 10] || T.ordinal.other);
  return `${p}${suffix}`;
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${T.monthsShort[m - 1]} ${y}`;
}

function formatShortDate(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${T.monthsShort[m - 1]}`;
}

function formatMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return `${T.months[m - 1]} ${y}`;
}

function formatShortMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return `${T.monthsShort[m - 1]} ${y}`;
}

/** A date that wraps once, between day and year, never inside either. */
function dateCell(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return el('span', { class: 'date-cell' }, el('span', { class: 'd-day' }, `${d} ${T.monthsShort[m - 1]}`), ' ', el('span', { class: 'd-year' }, y));
}

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

const currentMonth = () => localToday().slice(0, 7);
const monthHref = (month) => (month === currentMonth() ? '#/' : `#/month/${month}`);

const playerOf = (id) => DATA.playerById.get(id) || { id, nickname: id, hex: '#888888' };
const gameName = (id) => DATA.gameNames.get(id) || id;

// ---------------------------------------------------------------------------
// Shared components.
// ---------------------------------------------------------------------------

/** A faceted gem in the given colour: the player's mark. */
function gemMark(colour, size = 16, label = null) {
  const node = svg('svg', {
    class: 'gem', width: size, height: size, viewBox: '0 0 24 24', focusable: 'false',
    'aria-hidden': label ? null : 'true', role: label ? 'img' : null,
  });
  if (label) node.append(svg('title', null, label));
  node.append(
    svg('polygon', { class: 'gem-body', points: '5,2.5 19,2.5 23,9 12,22 1,9', style: { fill: colour } }),
    svg('polygon', { class: 'gem-light', points: '5,2.5 19,2.5 23,9 1,9' }),
    svg('polygon', { class: 'gem-shade', points: '8,9 16,9 12,22' }),
    svg('polygon', { class: 'gem-glint', points: '1,9 8,9 12,22' }),
    svg('polyline', { class: 'gem-edge', points: '1,9 23,9' }),
  );
  return node;
}

function chevron() {
  return svg('svg', { class: 'chev', width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false' },
    svg('path', { d: 'M4 6l4 4 4-4', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
}

function playerLink(id, size = 16) {
  const p = playerOf(id);
  return el('a', { class: 'player', href: `#/player/${id}` }, gemMark(p.hex, size), el('span', { class: 'nick' }, p.nickname));
}

function whoCell(rank, id) {
  return el('span', { class: 'who' }, el('span', { class: 'rank' }, rank), playerLink(id));
}

function viewHead(title, rule) {
  return el('header', { class: 'view-head' }, el('h1', null, title), rule ? el('p', { class: 'rule' }, rule) : null);
}

function kv(label, value) {
  return el('div', { class: 'kv-row' }, el('dt', null, label), el('dd', null, value));
}

function statList(pairs) {
  return el('dl', { class: 'kv' }, pairs.map(([k, v]) => kv(k, v)));
}

function stat(label, value) {
  return el('div', { class: 'stat' }, el('dt', null, label), el('dd', null, value));
}

/**
 * A table with at most four columns. A row with `details` expands in place
 * (tap anywhere on the row or use the button) instead of scrolling sideways.
 */
function dataTable({ columns, rows, caption }) {
  const id = `t${++tableCounter}`;
  const table = el('table', { class: 'board' });
  if (caption) table.append(el('caption', { class: 'visually-hidden' }, caption));
  table.append(el('thead', null, el('tr', null, columns.map((c) => el('th', { scope: 'col', class: c.numeric ? 'num' : null }, c.label)))));
  const tbody = el('tbody');
  rows.forEach((row, i) => {
    const tr = el('tr', { class: 'row' });
    row.cells.forEach((cell, j) => tr.append(el('td', { class: columns[j].numeric ? 'num' : null }, cell)));
    if (!row.details) {
      tbody.append(tr);
      return;
    }
    const detailId = `${id}-${i}`;
    const button = el('button', { class: 'expander', type: 'button', 'aria-expanded': 'false', 'aria-controls': detailId, 'aria-label': T.ui.expand }, chevron());
    tr.lastElementChild.append(button);
    const cell = el('td', { colspan: columns.length });
    const detail = el('tr', { class: 'detail', id: detailId, hidden: true }, cell);
    let built = false;
    const toggle = () => {
      const open = detail.hidden;
      if (open && !built) {
        cell.append(row.details());
        built = true;
      }
      detail.hidden = !open;
      tr.classList.toggle('open', open);
      button.setAttribute('aria-expanded', String(open));
      button.setAttribute('aria-label', open ? T.ui.collapse : T.ui.expand);
    };
    tr.addEventListener('click', (event) => {
      if (event.target.closest('a, button')) return;
      toggle();
    });
    button.addEventListener('click', toggle);
    tbody.append(tr, detail);
  });
  table.append(tbody);
  return el('div', { class: 'table-wrap' }, table);
}

/** Show-the-math for one player-result. */
function mathPanel(r) {
  const m = S.mathOf(r);
  const f3 = m.frac.toFixed(3);
  const spread = S.round1(m.spreadPart).toFixed(1);
  const score = S.round1(m.score).toFixed(1);
  const row = (label, value) => el('div', { class: 'math-row' }, el('dt', null, label), el('dd', null, value));
  return el('dl', { class: 'math' },
    row(T.math.seats, String(m.n)),
    row(T.math.place, ordinal(m.p)),
    row(T.math.frac, `(${m.n} − ${m.p}) / (${m.n} − 1) = ${f3}`),
    row(T.math.floor, String(m.floor)),
    row(T.math.spread, `${S.SPREAD} × ${f3} = ${spread}`),
    row(T.math.bonus, String(m.bonus)),
    row(T.math.score, `${m.floor} + ${spread} + ${m.bonus} = ${score}`),
    row(T.math.weight, String(m.weight)),
    row(T.math.points, `${m.weight} × ${score} / 100 = ${fmt(m.points10)}`),
  );
}

function placeChip(r) {
  const state = r.win ? 'win' : r.last ? 'last' : 'other';
  return el('span', { class: `place ${state}` }, `${ordinal(r.p)} ${T.ui.of} ${r.n}`);
}

function seatmatesNote(r) {
  if (!r.seatmates.length) return null;
  return el('p', { class: 'muted small seatmates' }, `${T.ui.shared} `, r.seatmates.map((id, i) => [i ? ', ' : null, playerLink(id, 14)]));
}

/** One result as a collapsible line with its math inside. */
function resultDetails(r) {
  const summary = el('summary', null,
    el('span', { class: 'r-date' }, formatShortDate(r.date)),
    el('span', { class: 'r-game' }, gameName(r.game)),
    placeChip(r),
    el('span', { class: 'r-points num' }, fmt(r.points10)),
  );
  return el('details', { class: 'result' }, summary, el('div', { class: 'r-body' }, mathPanel(r), seatmatesNote(r)));
}

// ---------------------------------------------------------------------------
// Monthly board.
// ---------------------------------------------------------------------------

function monthSwitcher(month) {
  const list = [...new Set([currentMonth(), ...S.monthsWithGames(DATA.playerResults), month])].sort().reverse();
  const i = list.indexOf(month);
  const older = list[i + 1];
  const newer = i > 0 ? list[i - 1] : undefined;
  const link = (target, label, glyph, cls) => (target
    ? el('a', { class: `switch ${cls}`, href: monthHref(target), 'aria-label': `${label}: ${formatMonth(target)}` }, glyph)
    : el('span', { class: `switch ${cls} disabled`, 'aria-hidden': 'true' }, glyph));
  return el('nav', { class: 'switcher', 'aria-label': T.month.title },
    link(older, T.month.prev, '‹', 'prev'),
    el('h2', { class: 'month-name' }, formatMonth(month)),
    link(newer, T.month.next, '›', 'next'));
}

function podium(resolved) {
  const top = resolved.order.slice(0, 3);
  return el('ol', { class: 'podium', 'aria-label': T.month.podium }, top.map((row, i) => {
    const p = playerOf(row.player);
    return el('li', { class: `step place-${i + 1}`, style: { '--gem': p.hex } },
      el('span', { class: 'step-rank' }, ordinal(i + 1)),
      el('a', { class: 'step-player', href: `#/player/${row.player}` }, gemMark(p.hex, i === 0 ? 40 : 30), el('span', { class: 'nick' }, p.nickname)),
      el('span', { class: 'step-points num' }, fmt(row.total10)));
  }));
}

function niceStep(maxValue) {
  for (const step of [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000]) if (maxValue / step <= 5) return step;
  return 10000;
}

/** Inline SVG race chart: cumulative totals per player per game date. */
function buildRace(race, width) {
  const n = race.dates.length;
  const wide = width >= 600;
  const H = 280;
  const m = { top: 16, right: wide ? 130 : 14, bottom: 34, left: 40 };
  const plotW = width - m.left - m.right;
  const plotH = H - m.top - m.bottom;
  const maxValue = Math.max(10, ...race.series.map((s) => s.final10)) / 10;
  const step = niceStep(maxValue);
  const top = Math.max(step, Math.ceil(maxValue / step) * step);
  const xOf = (i) => m.left + (i / n) * plotW; // i = 0 is the start point
  const yOf = (v10) => m.top + plotH - (v10 / 10 / top) * plotH;

  const root = svg('svg', {
    class: 'race-svg', width, height: H, viewBox: `0 0 ${width} ${H}`, role: 'img',
    'aria-label': `${T.month.chartTitle}. ${T.month.chartCaption}`,
  });

  const grid = svg('g', { class: 'grid' });
  for (let v = 0; v <= top; v += step) {
    const y = yOf(v * 10);
    grid.append(svg('line', { x1: m.left, x2: width - m.right, y1: y, y2: y }));
    grid.append(svg('text', { class: 'axis-label', x: m.left - 8, y, 'text-anchor': 'end', 'dominant-baseline': 'middle' }, v));
  }
  root.append(grid);

  const stride = Math.max(1, Math.ceil((n + 1) / Math.max(2, Math.floor(plotW / 56))));
  const xLabels = svg('g', { class: 'x-labels' });
  for (let i = 0; i <= n; i++) {
    if (i % stride !== 0 && i !== n) continue;
    if (i !== n && i !== 0 && n - i < stride) continue; // keep room for the last label
    xLabels.append(svg('text', {
      class: 'axis-label', x: xOf(i), y: H - m.bottom + 18,
      'text-anchor': i === 0 ? 'start' : i === n ? 'end' : 'middle',
    }, i === 0 ? T.month.chartStart : formatShortDate(race.dates[i - 1])));
  }
  root.append(xLabels);

  const lines = svg('g', { class: 'lines' });
  const markers = svg('g', { class: 'markers' });
  for (const s of [...race.series].reverse()) { // leader drawn last, so on top
    const hex = playerOf(s.player).hex;
    const pts = [[xOf(0), yOf(0)], ...s.values.map((v, i) => [xOf(i + 1), yOf(v)])];
    lines.append(svg('path', {
      d: pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' '),
      fill: 'none', stroke: hex, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));
    s.values.forEach((v, i) => {
      const x = xOf(i + 1), y = yOf(v);
      markers.append(svg('path', {
        class: 'marker', 'data-col': i + 1, fill: hex,
        d: `M${x.toFixed(1)} ${(y - 5.5).toFixed(1)}L${(x + 5.5).toFixed(1)} ${y.toFixed(1)}L${x.toFixed(1)} ${(y + 5.5).toFixed(1)}L${(x - 5.5).toFixed(1)} ${y.toFixed(1)}Z`,
      }));
    });
  }
  root.append(lines, markers);

  if (wide) { // direct labels for the top three, skipped where they would collide
    const labels = svg('g', { class: 'end-labels' });
    let lastY = -Infinity;
    for (const s of race.series.slice(0, 3)) {
      const y = yOf(s.final10);
      if (y - lastY < 14) continue;
      lastY = y;
      labels.append(svg('text', { class: 'end-label', x: xOf(n) + 10, y, 'dominant-baseline': 'middle' }, playerOf(s.player).nickname));
    }
    root.append(labels);
  }

  // hover and tap: crosshair on the nearest date plus a tooltip with every player's total
  const cross = svg('line', { class: 'crosshair', y1: m.top, y2: m.top + plotH, visibility: 'hidden' });
  const tip = el('div', { class: 'chart-tip', hidden: true });
  const overlay = svg('rect', { class: 'overlay', x: m.left, y: m.top, width: plotW, height: plotH, fill: 'transparent' });
  const show = (clientX) => {
    const rect = root.getBoundingClientRect();
    const i = Math.max(0, Math.min(n, Math.round(((clientX - rect.left - m.left) / plotW) * n)));
    const cx = xOf(i);
    cross.setAttribute('x1', cx);
    cross.setAttribute('x2', cx);
    cross.setAttribute('visibility', 'visible');
    for (const mk of markers.children) mk.classList.toggle('active', Number(mk.dataset.col) === i);
    const entries = race.series.map((s) => ({ player: s.player, v: i === 0 ? 0 : s.values[i - 1] })).sort((a, b) => b.v - a.v);
    tip.replaceChildren(
      el('div', { class: 'tip-title' }, i === 0 ? capitalise(T.month.chartStart) : formatDate(race.dates[i - 1])),
      el('ul', null, entries.map((e) => el('li', null, gemMark(playerOf(e.player).hex, 12), el('span', { class: 'tip-name' }, playerOf(e.player).nickname), el('span', { class: 'tip-val num' }, fmt(e.v))))),
    );
    tip.hidden = false;
    const tw = tip.offsetWidth;
    let left = cx + 12;
    if (left + tw > width) left = cx - 12 - tw;
    if (left < 0) left = 0;
    tip.style.left = `${left}px`;
    tip.style.top = `${m.top}px`;
  };
  const hide = () => {
    cross.setAttribute('visibility', 'hidden');
    tip.hidden = true;
    for (const mk of markers.children) mk.classList.remove('active');
  };
  overlay.addEventListener('pointermove', (e) => show(e.clientX));
  overlay.addEventListener('pointerdown', (e) => show(e.clientX));
  overlay.addEventListener('pointerleave', hide);
  root.append(cross, overlay);
  return [root, tip];
}

function raceChart(race) {
  const wrap = el('div', { class: 'chart' });
  const legend = el('ul', { class: 'legend' }, race.series.map((s) => el('li', null, playerLink(s.player, 14))));
  const figure = el('figure', { class: 'race' },
    el('figcaption', null, el('span', { class: 'chart-title' }, T.month.chartTitle), el('span', { class: 'chart-caption' }, T.month.chartCaption)),
    wrap, legend);
  let lastWidth = 0;
  const draw = () => {
    const w = Math.floor(wrap.clientWidth);
    if (!w || w === lastWidth) return;
    lastWidth = w;
    wrap.replaceChildren(...buildRace(race, w));
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver(draw).observe(wrap);
  else {
    requestAnimationFrame(draw);
    window.addEventListener('resize', draw);
  }
  return figure;
}

function viewMonth(month) {
  const pr = DATA.playerResults;
  const resolved = S.resolveMonth(pr, month);
  const parts = [viewHead(T.month.title, T.month.rule), monthSwitcher(month)];
  if (!resolved) {
    parts.push(el('p', { class: 'empty' }, pr.length ? T.month.empty : T.month.emptyNoData));
  } else {
    parts.push(el('section', { class: 'card podium-card' },
      el('h2', { class: 'visually-hidden' }, T.month.podium),
      podium(resolved),
      resolved.step > 1 ? el('p', { class: 'note' }, `${T.month.decidedBy} ${T.tiebreak[resolved.step - 1]}.`) : null,
      el('p', { class: 'prize muted small' }, T.month.prize)));
    parts.push(raceChart(S.raceData(pr, month)));
    parts.push(el('section', null,
      el('h2', null, T.month.standings),
      dataTable({
        caption: `${T.month.standings}, ${formatMonth(month)}`,
        columns: [{ label: T.month.cols.player }, { label: T.month.cols.points, numeric: true }, { label: T.month.cols.wins, numeric: true }, { label: T.month.cols.games, numeric: true }],
        rows: resolved.rows.map((row) => ({
          cells: [whoCell(row.rank, row.player), fmt(row.total10), row.wins, row.games],
          details: () => el('div', null, el('h3', { class: 'detail-title' }, T.month.results), el('div', { class: 'results' }, row.results.map(resultDetails))),
        })),
      })));
  }
  return { node: fragment(parts), title: formatMonth(month), nav: 'month' };
}

// ---------------------------------------------------------------------------
// Performance, wins, player, hall.
// ---------------------------------------------------------------------------

function viewPerformance() {
  const pr = DATA.playerResults;
  const rows = S.performanceRows(pr);
  const parts = [viewHead(T.performance.title, T.performance.rule)];
  if (!rows.length) parts.push(el('p', { class: 'empty' }, T.performance.empty));
  else {
    parts.push(el('p', { class: 'muted small' }, `${T.performance.groupMean}: ${fmtP(S.groupMean(pr))}`));
    parts.push(dataTable({
      caption: T.performance.title,
      columns: [{ label: T.performance.cols.player }, { label: T.performance.cols.p, numeric: true }, { label: T.performance.cols.games, numeric: true }],
      rows: rows.map((row) => ({
        cells: [whoCell(row.rank, row.player), fmtP(row.P), row.games],
        details: () => statList([[T.performance.rawMean, fmtP(row.rawMean)], [T.performance.weightPlayed, row.weightPlayed], [T.performance.wins, row.wins]]),
      })),
    }));
  }
  return { node: fragment(parts), title: T.performance.title, nav: 'performance' };
}

/**
 * Per-game filter: a dropdown built from page elements rather than a native
 * <select>, so the list opens inside the page and never depends on a native
 * popup. Choosing a game navigates to #/wins/<game>, so the route stays
 * shareable. Keyboard: arrows open and move, Enter or Space choose, Escape closes.
 */
function gameFilter(gameId) {
  const options = [{ id: null, label: T.wins.allGames }, ...DATA.gameOrder.map((id) => ({ id, label: gameName(id) }))];
  const selected = Math.max(0, options.findIndex((o) => o.id === gameId));
  const listId = 'game-filter-list';
  const button = el('button', {
    class: 'select-btn', type: 'button', id: 'game-filter',
    'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-controls': listId, 'aria-labelledby': 'game-filter-label game-filter',
  }, el('span', { class: 'select-value' }, options[selected].label), chevron());
  const items = options.map((o, i) => el('li', {
    class: 'select-option', role: 'option', id: `game-option-${o.id || 'all'}`, 'aria-selected': i === selected ? 'true' : 'false',
  }, o.label));
  const list = el('ul', { class: 'select-list', id: listId, role: 'listbox', tabindex: '-1', 'aria-labelledby': 'game-filter-label', hidden: true }, items);
  const wrap = el('div', { class: 'select' }, button, list);
  let open = false;
  let active = selected;
  const setActive = (i) => {
    active = (i + options.length) % options.length;
    items.forEach((li, j) => li.classList.toggle('active', j === active));
    list.setAttribute('aria-activedescendant', items[active].id);
    if (items[active].scrollIntoView) items[active].scrollIntoView({ block: 'nearest' });
  };
  const onOutside = (e) => { if (!wrap.contains(e.target)) hide(false); };
  const show = () => {
    if (open) return;
    open = true;
    list.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    setActive(selected);
    list.focus({ preventScroll: true });
    document.addEventListener('pointerdown', onOutside, true);
  };
  const hide = (refocus) => {
    if (!open) return;
    open = false;
    list.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside, true);
    if (refocus) button.focus({ preventScroll: true });
  };
  const choose = (i) => {
    hide(true);
    const o = options[i];
    if (o.id !== gameId) location.hash = o.id ? `#/wins/${o.id}` : '#/wins';
  };
  button.addEventListener('click', () => (open ? hide(true) : show()));
  button.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); show(); }
  });
  list.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(options.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape') { e.preventDefault(); hide(true); }
    else if (e.key === 'Tab') hide(false);
  });
  items.forEach((li, i) => {
    li.addEventListener('click', () => choose(i));
    li.addEventListener('pointermove', () => { if (i !== active) setActive(i); });
  });
  return el('div', { class: 'filter' }, el('span', { class: 'filter-label', id: 'game-filter-label' }, T.wins.filter), wrap);
}

function viewWins(gameId) {
  if (gameId !== null && !DATA.gameOrder.includes(gameId)) return viewNotFound();
  const rows = S.winsRows(DATA.playerResults, gameId);
  const parts = [viewHead(T.wins.title, T.wins.rule), gameFilter(gameId)];
  if (!rows.length) parts.push(el('p', { class: 'empty' }, T.wins.empty));
  else {
    parts.push(dataTable({
      caption: gameId ? `${T.wins.title}: ${gameName(gameId)}` : T.wins.title,
      columns: [{ label: T.wins.cols.player }, { label: T.wins.cols.wins, numeric: true }, { label: T.wins.cols.games, numeric: true }, { label: T.wins.cols.weighted, numeric: true }],
      rows: rows.map((row) => ({
        cells: [whoCell(row.rank, row.player), row.wins, row.games, row.weightedWins],
        details: () => {
          const games = DATA.gameOrder.filter((g) => row.winsByGame.has(g));
          return el('div', null, el('h3', { class: 'detail-title' }, T.wins.byGame),
            games.length ? statList(games.map((g) => [gameName(g), row.winsByGame.get(g)])) : el('p', { class: 'muted small' }, T.wins.none));
        },
      })),
    }));
  }
  return { node: fragment(parts), title: gameId ? `${T.wins.title}: ${gameName(gameId)}` : T.wins.title, nav: 'wins' };
}

function formDots(form, hex) {
  return el('ol', { class: 'form', style: { '--gem': hex } }, form.map((r) => {
    const state = r.win ? 'win' : r.last ? 'last' : 'other';
    return el('li', { class: `dot ${state}`, title: `${formatDate(r.date)} · ${gameName(r.game)} · ${ordinal(r.p)} ${T.ui.of} ${r.n}` },
      el('span', { class: 'visually-hidden' }, T.player.formStates[state]));
  }));
}

function gameLine(g) {
  return g ? `${gameName(g.game)}, ${T.ui.meanScore} ${S.round1(g.mean).toFixed(1)}` : '—';
}

function viewPlayer(id) {
  const p = DATA.playerById.get(id);
  if (!p) return viewNotFound();
  const sum = S.playerSummary(DATA.playerResults, id);
  const parts = [el('header', { class: 'view-head player-head', style: { '--gem': p.hex } },
    gemMark(p.hex, 56, capitalise(id)),
    el('div', null, el('p', { class: 'kicker' }, fill(T.player.seat, { gem: id })), el('h1', null, p.nickname)))];
  if (!sum.games) parts.push(el('p', { class: 'empty' }, T.player.empty));
  else {
    parts.push(el('section', { class: 'card' },
      el('dl', { class: 'stats' }, stat(T.player.games, sum.games), stat(T.player.wins, sum.wins), stat(T.player.currentStreak, sum.currentStreak), stat(T.player.longestStreak, sum.longestStreak)),
      el('div', { class: 'form-row' }, el('span', { class: 'label' }, T.player.form), formDots(sum.form, p.hex), el('span', { class: 'muted small' }, T.player.formLegend)),
      el('dl', { class: 'kv' }, kv(T.player.bestGame, gameLine(sum.bestGame)), kv(T.player.worstGame, gameLine(sum.worstGame)))));
    parts.push(el('section', null,
      el('h2', null, T.player.results),
      dataTable({
        caption: `${T.player.results}: ${p.nickname}`,
        columns: [{ label: T.player.cols.date }, { label: T.player.cols.game }, { label: T.player.cols.place }, { label: T.player.cols.points, numeric: true }],
        rows: [...sum.results].reverse().map((r) => ({
          cells: [dateCell(r.date), gameName(r.game), placeChip(r), fmt(r.points10)],
          details: () => el('div', null, el('h3', { class: 'detail-title' }, T.math.title), mathPanel(r), seatmatesNote(r)),
        })),
      })));
  }
  return { node: fragment(parts), title: p.nickname, nav: null };
}

function viewHall() {
  const hall = S.hallRows(DATA.playerResults);
  const parts = [viewHead(T.hall.title, T.hall.rule)];
  if (!hall.length) parts.push(el('p', { class: 'empty' }, T.hall.empty));
  else {
    parts.push(dataTable({
      caption: T.hall.title,
      columns: [{ label: T.hall.cols.month }, { label: T.hall.cols.winner }, { label: T.hall.cols.total, numeric: true }, { label: T.hall.cols.margin, numeric: true }],
      rows: hall.map((h) => ({
        cells: [
          el('a', { href: monthHref(h.month), 'aria-label': formatMonth(h.month) }, formatShortMonth(h.month)),
          el('span', { class: 'who' }, playerLink(h.winner.player), h.step > 1 ? el('span', { class: 'chip' }, T.hall.tieChip) : null),
          fmt(h.winner.total10),
          h.margin10 === null ? T.hall.noRival : fmt(h.margin10),
        ],
        details: () => statList([
          [T.hall.runnerUp, h.runnerUp ? el('span', { class: 'who' }, playerLink(h.runnerUp.player, 14), el('span', { class: 'num' }, fmt(h.runnerUp.total10))) : '—'],
          [T.hall.decidedBy, capitalise(T.tiebreak[h.step - 1])],
        ]),
      })),
    }));
  }
  return { node: fragment(parts), title: T.hall.title, nav: 'hall' };
}

function viewNotFound() {
  return {
    node: fragment(viewHead(T.notFound.title, T.notFound.body), el('p', null, el('a', { class: 'button', href: '#/' }, T.ui.backHome))),
    title: T.notFound.title,
    nav: null,
  };
}

// ---------------------------------------------------------------------------
// Chrome, routing, boot.
// ---------------------------------------------------------------------------

function renderChrome() {
  document.getElementById('brand').replaceChildren(gemMark('var(--accent)', 24), el('span', null, T.site.title));
  document.getElementById('tagline').textContent = T.site.tagline;
  const nav = document.getElementById('nav');
  nav.setAttribute('aria-label', T.nav.label);
  nav.replaceChildren(...[['month', '#/'], ['performance', '#/performance'], ['wins', '#/wins'], ['hall', '#/hall']]
    .map(([key, href]) => el('a', { href, 'data-nav': key }, T.nav[key])));
  document.getElementById('foot').replaceChildren(el('p', null, T.site.footer), el('p', { class: 'muted small' }, T.site.computed));
  const skip = document.getElementById('skip');
  skip.textContent = T.site.skip;
  skip.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('main').focus();
  });
}

function parseRoute() {
  const hash = location.hash || '#/';
  let parts;
  try {
    parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return viewNotFound();
  }
  if (parts.length === 0) return viewMonth(currentMonth());
  if (parts[0] === 'month' && parts.length === 2 && S.isValidMonth(parts[1])) return viewMonth(parts[1]);
  if (parts[0] === 'performance' && parts.length === 1) return viewPerformance();
  if (parts[0] === 'wins' && parts.length <= 2) return viewWins(parts[1] ?? null);
  if (parts[0] === 'player' && parts.length === 2) return viewPlayer(parts[1]);
  if (parts[0] === 'hall' && parts.length === 1) return viewHall();
  return viewNotFound();
}

function route() {
  const view = parseRoute();
  const focusedId = document.activeElement ? document.activeElement.id : '';
  document.getElementById('main').replaceChildren(view.node);
  if (focusedId) {
    const again = document.getElementById(focusedId);
    if (again) again.focus({ preventScroll: true });
  }
  document.title = `${view.title} · ${T.site.title}`;
  for (const a of document.querySelectorAll('#nav a')) {
    if (a.dataset.nav === view.nav) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);
  document.body.dataset.state = 'ready';
}

/** The fail-loud banner: file and line for every problem, and nothing else renders. */
function showBanner(errors) {
  document.getElementById('main').replaceChildren(el('div', { class: 'banner', role: 'alert' },
    el('h1', null, T.error.title),
    el('p', null, T.error.intro),
    el('ul', null, errors.map((e) => {
      const where = e.file ? (e.line ? `${e.file}, line ${e.line}` : e.file) : null;
      return el('li', null, where ? el('code', null, where) : null, where ? ': ' : null, e.detail || e.message);
    }))));
  document.body.dataset.state = 'error';
}

async function main() {
  renderChrome();
  document.getElementById('main').replaceChildren(el('p', { class: 'loading' }, T.site.loading));
  const texts = {};
  const fetchErrors = [];
  await Promise.all(Object.entries(S.FILES).map(async ([key, file]) => {
    try {
      const res = await fetch(file, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      texts[key] = await res.text();
    } catch (e) {
      fetchErrors.push({ file, line: null, detail: `${T.error.fetch} (${e.message})` });
    }
  }));
  if (fetchErrors.length) {
    showBanner(fetchErrors);
    return;
  }
  const { errors, data } = S.build(texts, localToday());
  if (errors.length) {
    showBanner(errors);
    return;
  }
  DATA = data;
  window.addEventListener('hashchange', route);
  route();
}

main().catch((e) => showBanner([{ file: null, line: null, detail: `${T.error.unexpected}: ${e.message}` }]));
