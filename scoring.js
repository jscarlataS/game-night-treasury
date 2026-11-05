/*
 * scoring.js — the ledger logic of the treasury.
 *
 * Pure functions only: no DOM, no fetch, no globals. Imported by app.js in the
 * browser and by tests.js under Node. Each rule is explainable in one sentence,
 * and the sentence sits next to the code that implements it.
 *
 * Point values are carried as integer tenths (names end in `10`) so that sums
 * are exact and the displayed totals add up.
 */

// ---------------------------------------------------------------------------
// Constants (requirements sections 4, 6, 7).
// Policy: these are frozen, because they price every old score: the monthly
// boards of Sep and Oct 2026 and the Performance board. They are not data and
// are not effective-dated.
// ---------------------------------------------------------------------------

/** Placement score for showing up: "ten for playing". */
export const FLOOR = 10;
/** Placement score split by how many opponents you finished above: "sixty split". */
export const SPREAD = 60;
/** Placement score for the win: "thirty for the win". */
export const BONUS = 30;
/** Phantom weight added at the group's mean in the performance formula:
 *  "ten phantom Dune games at the group's average" (10 games × weight 100). */
export const K = 1000;
/** The rules of the monthly boards: that ladder, with no seat fee. */
export const MONTHLY_RULES = { floor: FLOOR, spread: SPREAD, bonus: BONUS, fee: 0 };
/** Length of a season in calendar months. */
export const SEASON_MONTHS = 2;
/**
 * Season rules, oldest first. A row holds from its `from`, the first day of a
 * season, until the next row. Rules change between seasons by adding a row and
 * never during one, and a row is not edited once its season has results.
 */
export const SEASON_RULES = [
  { from: '2026-11-01', floor: 35, spread: 30, bonus: 0, fee: 49, stake: 100, minGames: 5 },
];

/** Data files, relative to index.html, and their exact headers. */
export const FILES = {
  gems: 'data/gems.csv',
  players: 'data/players.csv',
  games: 'data/games.csv',
  results: 'data/results.csv',
};
export const HEADERS = {
  gems: ['id', 'hex'],
  players: ['id', 'nickname'],
  games: ['id', 'name', 'weight', 'from'],
  results: ['date', 'game', 'round', 'place', 'players'],
};

// ---------------------------------------------------------------------------
// Placement score and points (sections 4 and 5).
// ---------------------------------------------------------------------------

/** Share of opponents finished above: (n − p) / (n − 1). */
export function frac(n, p) {
  return (n - p) / (n - 1);
}

/** Placement score on the 0–100 scale, unrounded. */
export function score(n, p, rules = MONTHLY_RULES) {
  return rules.floor + rules.spread * frac(n, p) + (p === 1 ? rules.bonus : 0);
}

/**
 * Points in tenths: round1(weight × score / 100) × 10, computed in integer
 * arithmetic so that exact halves round up regardless of floating point.
 */
export function points10(weight, n, p, rules = MONTHLY_RULES) {
  // weight × score × (n − 1), which is an integer whenever the constants are
  const num = weight * (rules.floor * (n - 1) + rules.spread * (n - p) + (p === 1 ? rules.bonus * (n - 1) : 0));
  const den = 100 * (n - 1);
  // tenths = 10·num/den; half up: floor(10·num/den + 1/2) = floor((20·num + den) / (2·den))
  return Math.floor((20 * num + den) / (2 * den));
}

/** A seat's fee in tenths: round1(weight × fee / 100) × 10, half up in integer arithmetic. */
export function fee10(weight, rules) {
  return Math.floor((2 * weight * rules.fee + 10) / 20);
}

/** Points as a number with one decimal (display convenience; sums use points10). */
export function points(weight, n, p) {
  return points10(weight, n, p) / 10;
}

/** Round half up to one decimal. Used for display of non-point values. */
export function round1(x) {
  return Math.round(x * 10 + 1e-9) / 10;
}

/** Format integer tenths as "12.3". */
export function formatTenths(x10) {
  const sign = x10 < 0 ? '-' : '';
  const a = Math.abs(x10);
  return `${sign}${Math.floor(a / 10)}.${a % 10}`;
}

/** Show-the-math breakdown for one player-result. */
export function mathOf(r) {
  const f = frac(r.n, r.p);
  return {
    n: r.n,
    p: r.p,
    frac: f,
    rules: r.rules,
    floor: r.rules.floor,
    spread: r.rules.spread,
    spreadPart: r.rules.spread * f,
    bonus: r.p === 1 ? r.rules.bonus : 0,
    score: score(r.n, r.p, r.rules),
    weight: r.weight,
    points10: r.points10,
    fee10: r.fee10,
  };
}

// ---------------------------------------------------------------------------
// Dates.
// ---------------------------------------------------------------------------

/** True for a real calendar date written YYYY-MM-DD. */
export function isValidDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return d <= daysInMonth;
}

export function isValidMonth(s) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function monthOf(date) {
  return date.slice(0, 7);
}

export function lastDayOfMonth(month) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(d).padStart(2, '0')}`;
}

/** The weight of `gameId` in effect on `date`: the row with the greatest from <= date. */
export function weightFor(games, gameId, date) {
  let best = null;
  for (const g of games) {
    if (g.id === gameId && g.from <= date && (best === null || g.from > best.from)) best = g;
  }
  return best === null ? null : Number(best.weight);
}

// ---------------------------------------------------------------------------
// Seasons: two calendar months each from 2026-11-01 on. Earlier months stay
// monthly boards.
// ---------------------------------------------------------------------------

const monthCount = (month) => {
  const [y, m] = month.split('-').map(Number);
  return y * 12 + m - 1;
};
const monthAt = (count) => `${Math.floor(count / 12)}-${String((count % 12) + 1).padStart(2, '0')}`;
const FIRST_SEASON_MONTH = monthCount(monthOf(SEASON_RULES[0].from));

/** The season `date` falls in, starting at 1, or null before the first season. */
export function seasonOf(date) {
  const months = monthCount(monthOf(date)) - FIRST_SEASON_MONTH;
  return months < 0 ? null : Math.floor(months / SEASON_MONTHS) + 1;
}

/** First and last day of a season. */
export function seasonSpan(season) {
  const first = FIRST_SEASON_MONTH + (season - 1) * SEASON_MONTHS;
  return { from: `${monthAt(first)}-01`, to: lastDayOfMonth(monthAt(first + SEASON_MONTHS - 1)) };
}

/** The rules of a season: the last row starting on or before its first day. */
export function rulesFor(season, table = SEASON_RULES) {
  const { from } = seasonSpan(season);
  return table.filter((row) => row.from <= from).at(-1);
}

// ---------------------------------------------------------------------------
// CSV parsing and validation (section 11). Errors name file and line.
// ---------------------------------------------------------------------------

export class DataError extends Error {
  constructor(file, line, detail) {
    super(`${file}, line ${line}: ${detail}`);
    this.name = 'DataError';
    this.file = file;
    this.line = line;
    this.detail = detail;
  }
}

/**
 * Parse one CSV file into rows keyed by header name, each with its 1-based
 * `line`. Throws DataError on the first format violation.
 */
export function parseCsv(text, file, header) {
  const expected = header.join(',');
  if (text.charCodeAt(0) === 0xfeff) {
    throw new DataError(file, 1, 'file starts with a byte order mark; save it as UTF-8 without BOM');
  }
  const cr = text.indexOf('\r');
  if (cr !== -1) {
    throw new DataError(file, text.slice(0, cr).split('\n').length, 'carriage return found; use LF line endings');
  }
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop(); // the trailing newline
  if (lines.length === 0) throw new DataError(file, 1, `file is empty; expected the header "${expected}"`);
  if (lines[0] !== expected) throw new DataError(file, 1, `expected the header "${expected}" but found "${lines[0]}"`);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = i + 1;
    const raw = lines[i];
    if (raw === '') throw new DataError(file, line, 'blank line');
    if (raw.includes('"')) throw new DataError(file, line, 'quotes are not allowed');
    const fields = raw.split(',');
    if (fields.length !== header.length) {
      throw new DataError(file, line, `expected ${header.length} fields but found ${fields.length}`);
    }
    const row = { line };
    header.forEach((h, j) => { row[h] = fields[j]; });
    rows.push(row);
  }
  return rows;
}

const POSITIVE_INT = /^[1-9][0-9]*$/;

function describeInstance(r) {
  return `${r.date} ${r.game} round ${r.round}`;
}

/**
 * Validate the parsed files against section 11. Returns every DataError found
 * (empty array when the data is clean). `today` is YYYY-MM-DD.
 */
export function validate(raw, today) {
  const errors = [];
  const fail = (file, line, detail) => errors.push(new DataError(FILES[file], line, detail));

  // 1. gems: ids lowercase and unique, hex well formed
  const gemIds = new Set();
  for (const g of raw.gems) {
    if (!/^[a-z]+$/.test(g.id)) fail('gems', g.line, `id "${g.id}" must be lowercase a-z`);
    else if (gemIds.has(g.id)) fail('gems', g.line, `duplicate id "${g.id}"`);
    else gemIds.add(g.id);
    if (!/^#[0-9A-Fa-f]{6}$/.test(g.hex)) fail('gems', g.line, `hex "${g.hex}" must look like #rrggbb`);
  }

  // 1. players: id in gems and unique, nickname unique and non-empty
  const playerIds = new Set();
  const nicknames = new Set();
  for (const p of raw.players) {
    if (!gemIds.has(p.id)) fail('players', p.line, `id "${p.id}" is not in ${FILES.gems}`);
    if (playerIds.has(p.id)) fail('players', p.line, `duplicate id "${p.id}"`);
    else playerIds.add(p.id);
    if (p.nickname === '') fail('players', p.line, 'nickname is empty');
    else if (nicknames.has(p.nickname)) fail('players', p.line, `duplicate nickname "${p.nickname}"`);
    else nicknames.add(p.nickname);
  }

  // 5. games: id well formed, weight positive integer, from a real date on the 1st, (id, from) unique
  const gameIds = new Set();
  const gameFromKeys = new Set();
  for (const g of raw.games) {
    if (!/^[a-z0-9]+$/.test(g.id)) fail('games', g.line, `id "${g.id}" must be lowercase a-z and 0-9`);
    if (g.name === '') fail('games', g.line, 'name is empty');
    if (!POSITIVE_INT.test(g.weight)) fail('games', g.line, `weight "${g.weight}" must be a positive integer`);
    if (!isValidDate(g.from)) fail('games', g.line, `from "${g.from}" is not a valid YYYY-MM-DD date`);
    else if (!g.from.endsWith('-01')) fail('games', g.line, `from "${g.from}" must be the 1st of a month`);
    const key = `${g.id}|${g.from}`;
    if (gameFromKeys.has(key)) fail('games', g.line, `duplicate (id, from) "${g.id}, ${g.from}"`);
    else gameFromKeys.add(key);
    gameIds.add(g.id);
  }

  // 5. a weight change starts with a season, so one season never mixes two weights; a new game may start any month
  for (const g of raw.games) {
    if (!isValidDate(g.from)) continue;
    const season = seasonOf(g.from);
    const first = raw.games.filter((x) => x.id === g.id && isValidDate(x.from)).map((x) => x.from).sort()[0];
    if (g.from !== first && season !== null && g.from !== seasonSpan(season).from) {
      fail('games', g.line, `from "${g.from}" is inside a season; a weight change must start on the first day of a season`);
    }
  }

  // 2, 3, 5. results: row-level checks
  const instances = new Map();
  for (const r of raw.results) {
    let rowOk = true;
    if (!isValidDate(r.date)) {
      fail('results', r.line, `date "${r.date}" is not a valid YYYY-MM-DD date`);
      rowOk = false;
    } else if (r.date > today) {
      fail('results', r.line, `date "${r.date}" is in the future (today is ${today})`);
    }
    if (!gameIds.has(r.game)) {
      fail('results', r.line, `game "${r.game}" is not in ${FILES.games}`);
      rowOk = false;
    } else if (isValidDate(r.date) && weightFor(raw.games, r.game, r.date) === null) {
      const first = raw.games.filter((g) => g.id === r.game).map((g) => g.from).sort()[0];
      fail('results', r.line, `game "${r.game}" has no weight in effect on ${r.date}; its first from is ${first}`);
    }
    if (!POSITIVE_INT.test(r.round)) {
      fail('results', r.line, `round "${r.round}" must be a positive integer`);
      rowOk = false;
    }
    if (!POSITIVE_INT.test(r.place)) {
      fail('results', r.line, `place "${r.place}" must be a positive integer`);
      rowOk = false;
    }
    const ids = r.players.split('+');
    for (const id of ids) {
      if (id === '') fail('results', r.line, `players "${r.players}" contains an empty id`);
      else if (!playerIds.has(id)) fail('results', r.line, `player "${id}" is not in ${FILES.players}`);
    }
    if (!rowOk) continue;
    const key = `${r.date}|${r.game}|${r.round}`;
    if (!instances.has(key)) instances.set(key, []);
    instances.get(key).push(r);
  }

  // 4. results: per game instance
  for (const rows of instances.values()) {
    const first = rows[0];
    if (rows.length < 2) {
      fail('results', first.line, `game instance ${describeInstance(first)} has one seat; at least 2 are needed`);
    }
    const seen = new Set();
    for (const r of rows) {
      for (const id of r.players.split('+')) {
        if (seen.has(id)) fail('results', r.line, `player "${id}" appears twice in ${describeInstance(first)}`);
        seen.add(id);
      }
    }
    const places = rows.map((r) => Number(r.place));
    for (const r of rows) {
      const place = Number(r.place);
      const above = places.filter((x) => x < place).length;
      if (place !== 1 + above) {
        fail('results', r.line, `place ${place} breaks competition ranking in ${describeInstance(first)}: ${above} seat${above === 1 ? '' : 's'} placed above it, so this seat must be place ${1 + above}`);
        break;
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Derived model: instances and player-results (section 2).
// ---------------------------------------------------------------------------

function byDateThenLine(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.line - b.line;
}

/** Turn validated raw rows into players, games, instances and player-results. */
export function derive(raw) {
  const gemHex = new Map(raw.gems.map((g) => [g.id, g.hex]));
  const players = raw.players.map((p) => ({ id: p.id, nickname: p.nickname, hex: gemHex.get(p.id) }));
  const playerById = new Map(players.map((p) => [p.id, p]));

  const games = raw.games.map((g) => ({ id: g.id, name: g.name, weight: Number(g.weight), from: g.from }));
  const gameOrder = [];
  const gameNames = new Map(); // the name from the latest row wins
  for (const g of games) {
    if (!gameOrder.includes(g.id)) gameOrder.push(g.id);
    const cur = gameNames.get(g.id);
    if (!cur || g.from >= cur.from) gameNames.set(g.id, { name: g.name, from: g.from });
  }
  for (const [id, v] of gameNames) gameNames.set(id, v.name);

  const instMap = new Map();
  for (const r of raw.results) {
    const key = `${r.date}|${r.game}|${r.round}`;
    let inst = instMap.get(key);
    if (!inst) {
      inst = { key, date: r.date, game: r.game, round: Number(r.round), seats: [], line: r.line };
      instMap.set(key, inst);
    }
    inst.seats.push({ place: Number(r.place), players: r.players.split('+'), line: r.line });
  }
  const instances = [...instMap.values()].sort(byDateThenLine);

  const playerResults = [];
  for (const inst of instances) {
    const n = inst.seats.length;
    const maxPlace = Math.max(...inst.seats.map((s) => s.place));
    const weight = weightFor(games, inst.game, inst.date);
    const season = seasonOf(inst.date);
    const rules = season === null ? MONTHLY_RULES : rulesFor(season);
    const fee = fee10(weight, rules);
    inst.n = n;
    inst.weight = weight;
    inst.rules = rules;
    inst.fee10 = fee;
    for (const seat of inst.seats) {
      for (const pid of seat.players) {
        playerResults.push({
          player: pid,
          date: inst.date,
          month: monthOf(inst.date),
          season,
          rules,
          game: inst.game,
          round: inst.round,
          n,
          p: seat.place,
          weight,
          score: score(n, seat.place), // the old ladder, so Performance keeps one scale
          points10: points10(weight, n, seat.place, rules),
          fee10: fee,
          win: seat.place === 1,
          last: seat.place !== 1 && seat.place === maxPlace,
          seatmates: seat.players.filter((x) => x !== pid),
          line: seat.line,
          instance: inst.key,
        });
      }
    }
  }
  playerResults.sort(byDateThenLine);

  return { players, playerById, games, gameOrder, gameNames, gemHex, instances, playerResults };
}

/** Parse, validate and derive all four files. Returns { errors, data }. */
export function build(texts, today) {
  const errors = [];
  const raw = {};
  for (const key of Object.keys(FILES)) {
    try {
      raw[key] = parseCsv(texts[key], FILES[key], HEADERS[key]);
    } catch (e) {
      if (!(e instanceof DataError)) throw e;
      errors.push(e);
      raw[key] = [];
    }
  }
  if (errors.length) return { errors, data: null };
  errors.push(...validate(raw, today));
  if (errors.length) {
    const order = Object.values(FILES);
    errors.sort((a, b) => order.indexOf(a.file) - order.indexOf(b.file) || a.line - b.line);
    return { errors, data: null };
  }
  return { errors: [], data: derive(raw) };
}

// ---------------------------------------------------------------------------
// Ranking helpers.
// ---------------------------------------------------------------------------

/**
 * Sort rows with `cmp` and assign competition ranks: equal rows share the
 * rank and the next rank skips (1, 2, 2, 4).
 */
export function rankSorted(rows, cmp) {
  rows.sort(cmp);
  let rank = 0;
  rows.forEach((row, i) => {
    if (i === 0 || cmp(rows[i - 1], row) !== 0) rank = i + 1;
    row.rank = rank;
  });
  return rows;
}

// ---------------------------------------------------------------------------
// Monthly board (section 7).
// ---------------------------------------------------------------------------

/** Months that have at least one game instance, newest first. */
export function monthsWithGames(playerResults) {
  return [...new Set(playerResults.map((r) => r.month))].sort().reverse();
}

/** Total, wins and games per player over some results, ranked by total with shared ranks. */
function totalsRows(results) {
  const byPlayer = new Map();
  for (const r of results) {
    let row = byPlayer.get(r.player);
    if (!row) {
      row = { player: r.player, total10: 0, fees10: 0, wins: 0, games: 0, results: [] };
      byPlayer.set(r.player, row);
    }
    row.total10 += r.points10;
    row.fees10 += r.fee10;
    row.games += 1;
    if (r.win) row.wins += 1;
    row.results.push(r);
  }
  return rankSorted([...byPlayer.values()], (a, b) => b.total10 - a.total10);
}

/** Monthly board rows: total, wins, games per player, ranked by total with shared ranks. */
export function monthlyRows(playerResults, month) {
  return totalsRows(playerResults.filter((r) => r.month === month));
}

/** The six tiebreak steps, in order. Step numbers are 1-based. */
export const TIEBREAK_KEYS = [
  (r) => -r.total10,       // 1. highest total
  (r) => -r.wins,          // 2. most wins in the month
  (r) => -r.bestWonWeight, // 3. highest weight among games won (0 if none)
  (r) => -r.games,         // 4. most player-results in the month
  (r) => -r.P,             // 5. highest P as of the last day of the month
  (r) => r.player,         // 6. lowest ID alphabetically
];

/**
 * Settle a board: the fully ordered list, the winner, the runner-up, the
 * deciding step and the margin to 2nd in tenths, with P taken as of `asOf`.
 */
function settle(playerResults, rows, asOf) {
  const perf = performanceMap(playerResults.filter((r) => r.date <= asOf));
  for (const row of rows) {
    row.bestWonWeight = Math.max(0, ...row.results.filter((r) => r.win).map((r) => r.weight));
    row.P = perf.get(row.player).P;
  }
  const cmp = (a, b) => {
    for (const key of TIEBREAK_KEYS) {
      const x = key(a), y = key(b);
      if (x < y) return -1;
      if (x > y) return 1;
    }
    return 0;
  };
  const order = [...rows].sort(cmp);
  let step = 1;
  if (order.length > 1) {
    for (let i = 0; i < TIEBREAK_KEYS.length; i++) {
      if (TIEBREAK_KEYS[i](order[0]) !== TIEBREAK_KEYS[i](order[1])) { step = i + 1; break; }
    }
  }
  return {
    order,
    winner: order[0] ?? null,
    runnerUp: order.length > 1 ? order[1] : null,
    step,
    margin10: order.length > 1 ? order[0].total10 - order[1].total10 : null,
  };
}

/** Resolve a month: rows (shared ranks) plus the settled board. Returns null for a month with no games. */
export function resolveMonth(playerResults, month) {
  const rows = monthlyRows(playerResults, month);
  if (rows.length === 0) return null;
  return { month, rows, ...settle(playerResults, rows, lastDayOfMonth(month)) };
}

/** Running totals per player at each distinct date, every line starting at `start10`. */
function raceOf(results, start10) {
  const dates = [...new Set(results.map((r) => r.date))].sort();
  const players = [...new Set(results.map((r) => r.player))];
  const series = players.map((player) => {
    let cum = start10;
    const values = dates.map((d) => {
      for (const r of results) if (r.player === player && r.date === d) cum += r.points10 - r.fee10;
      return cum;
    });
    return { player, values, final10: cum };
  });
  series.sort((a, b) => b.final10 - a.final10 || (a.player < b.player ? -1 : 1));
  return { start10, dates, series };
}

/** Race chart data: cumulative totals per player at each distinct date in the month. */
export function raceData(playerResults, month) {
  return raceOf(playerResults.filter((r) => r.month === month), 0);
}

// ---------------------------------------------------------------------------
// Season board.
// ---------------------------------------------------------------------------

/** Seasons that have at least one game instance, newest first. */
export function seasonsWithGames(playerResults) {
  return [...new Set(playerResults.map((r) => r.season).filter((s) => s !== null))].sort((a, b) => b - a);
}

/** Months before the first season that have games, newest first. */
export function archiveMonths(playerResults) {
  return monthsWithGames(playerResults.filter((r) => r.season === null));
}

/**
 * A season board: your stake, plus what you earned, minus your seat fees.
 * `ranked` holds the players with enough games, with shared ranks; `short`
 * holds the rest, best total first, each with the games still to play.
 */
function boardOf(results, rules) {
  const rows = totalsRows(results);
  for (const row of rows) {
    row.earned10 = row.total10;
    row.total10 = rules.stake * 10 + row.earned10 - row.fees10;
    row.toGo = Math.max(0, rules.minGames - row.games);
  }
  const byTotal = (a, b) => b.total10 - a.total10;
  const short = rows.filter((row) => row.toGo > 0).sort(byTotal);
  for (const row of short) row.rank = null;
  return { ranked: rankSorted(rows.filter((row) => row.toGo === 0), byTotal), short };
}

/**
 * Resolve a season: the board, the settled board among those who qualified,
 * the treasury of seat fees and who played the most games. `winner` is null
 * while nobody qualifies. Returns null for a season with no games.
 */
export function resolveSeason(playerResults, season) {
  const results = playerResults.filter((r) => r.season === season);
  if (results.length === 0) return null;
  const rules = rulesFor(season);
  const { ranked, short } = boardOf(results, rules);
  const everyone = [...ranked, ...short];
  const games = Math.max(...everyone.map((row) => row.games));
  return {
    season,
    rules,
    ranked,
    short,
    ...settle(playerResults, ranked, seasonSpan(season).to),
    treasury10: results.reduce((sum, r) => sum + r.fee10, 0),
    mostGames: { games, players: everyone.filter((row) => row.games === games).map((row) => row.player).sort() },
  };
}

/** Race chart data for a season: every balance from the stake on, up and down. */
export function seasonRace(playerResults, season) {
  return raceOf(playerResults.filter((r) => r.season === season), rulesFor(season).stake * 10);
}

/** What-if for the launch: the months before the seasons as one board under `rules`. Changes no score. */
export function archiveReplay(playerResults, rules) {
  const results = playerResults.filter((r) => r.season === null).map((r) => ({
    ...r,
    points10: points10(r.weight, r.n, r.p, rules),
    fee10: fee10(r.weight, rules),
  }));
  return boardOf(results, rules);
}

/** Hall of snacks: one resolved entry per period with games, newest first: seasons, then the monthly archive. */
export function hallRows(playerResults) {
  return [
    ...seasonsWithGames(playerResults).map((s) => resolveSeason(playerResults, s)),
    ...archiveMonths(playerResults).map((m) => resolveMonth(playerResults, m)),
  ];
}

// ---------------------------------------------------------------------------
// Game night: everything played on one date.
// ---------------------------------------------------------------------------

/** Dates with at least one game instance, newest first. */
export function nightDates(playerResults) {
  return [...new Set(playerResults.map((r) => r.date))].sort().reverse();
}

/**
 * One game night: its instances in ledger order, each seat best place first
 * with its points, and the night's totals per player ranked like the monthly
 * board. Returns null for a date without games.
 */
export function nightSummary(instances, playerResults, date) {
  const tonight = instances.filter((inst) => inst.date === date);
  if (tonight.length === 0) return null;
  const games = tonight.map((inst) => {
    const maxPlace = Math.max(...inst.seats.map((s) => s.place));
    return {
      game: inst.game,
      round: inst.round,
      repeated: tonight.filter((i) => i.game === inst.game).length > 1,
      n: inst.n,
      weight: inst.weight,
      fee10: inst.fee10,
      seats: [...inst.seats].sort((a, b) => a.place - b.place || a.line - b.line).map((s) => ({
        players: s.players,
        n: inst.n,
        p: s.place,
        points10: points10(inst.weight, inst.n, s.place, inst.rules),
        win: s.place === 1,
        last: s.place !== 1 && s.place === maxPlace,
      })),
    };
  });
  return { date, games, rows: totalsRows(playerResults.filter((r) => r.date === date)) };
}

// ---------------------------------------------------------------------------
// Performance board (section 6).
// ---------------------------------------------------------------------------

/** Weighted mean placement score over a list of player-results, or null if empty. */
export function groupMean(results) {
  let ws = 0, w = 0;
  for (const r of results) { ws += r.weight * r.score; w += r.weight; }
  return w > 0 ? ws / w : null;
}

/** P for one player's results given the group mean mu. */
export function performanceOf(results, mu) {
  let ws = 0, w = 0;
  for (const r of results) { ws += r.weight * r.score; w += r.weight; }
  return (ws + K * mu) / (w + K);
}

/** Map of player id to { P, games, wins, rawMean, weightPlayed, results }. */
export function performanceMap(playerResults, mu = groupMean(playerResults)) {
  const by = new Map();
  for (const r of playerResults) {
    let e = by.get(r.player);
    if (!e) {
      e = { player: r.player, results: [], games: 0, wins: 0, weightPlayed: 0 };
      by.set(r.player, e);
    }
    e.results.push(r);
    e.games += 1;
    e.weightPlayed += r.weight;
    if (r.win) e.wins += 1;
  }
  for (const e of by.values()) {
    e.P = performanceOf(e.results, mu);
    e.rawMean = groupMean(e.results);
  }
  return by;
}

/** Performance board rows ranked by P at full precision, shared ranks on exact ties. */
export function performanceRows(playerResults) {
  return rankSorted([...performanceMap(playerResults).values()], (a, b) => b.P - a.P);
}

// ---------------------------------------------------------------------------
// Wins board (section 8).
// ---------------------------------------------------------------------------

/** Wins board rows, optionally restricted to one game id. */
export function winsRows(playerResults, gameId = null) {
  const by = new Map();
  for (const r of playerResults) {
    if (gameId !== null && r.game !== gameId) continue;
    let e = by.get(r.player);
    if (!e) {
      e = { player: r.player, wins: 0, games: 0, weightedWins: 0, winsByGame: new Map() };
      by.set(r.player, e);
    }
    e.games += 1;
    if (r.win) {
      e.wins += 1;
      e.weightedWins += r.weight;
      e.winsByGame.set(r.game, (e.winsByGame.get(r.game) || 0) + 1);
    }
  }
  return rankSorted([...by.values()], (a, b) => (b.wins - a.wins) || (b.weightedWins - a.weightedWins));
}

// ---------------------------------------------------------------------------
// Player page (section 15).
// ---------------------------------------------------------------------------

/** Everything the player page shows: results, form, streaks, best and worst game. */
export function playerSummary(playerResults, id) {
  const results = playerResults.filter((r) => r.player === id); // chronological
  let run = 0, longest = 0;
  for (const r of results) {
    if (r.win) { run += 1; if (run > longest) longest = run; } else run = 0;
  }
  const byGame = new Map();
  for (const r of results) {
    const e = byGame.get(r.game) || { game: r.game, sum: 0, count: 0 };
    e.sum += r.score;
    e.count += 1;
    byGame.set(r.game, e);
  }
  let best = null, worst = null;
  for (const e of byGame.values()) {
    const m = { game: e.game, mean: e.sum / e.count, count: e.count };
    if (best === null || m.mean > best.mean) best = m;
    if (worst === null || m.mean < worst.mean) worst = m;
  }
  return {
    id,
    results,
    form: results.slice(-5),
    currentStreak: run,
    longestStreak: longest,
    bestGame: best,
    worstGame: worst,
    games: results.length,
    wins: results.filter((r) => r.win).length,
  };
}
