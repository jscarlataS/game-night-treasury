/*
 * tests.js — run with `node tests.js`. No dependencies beyond Node built-ins.
 *
 * Encodes every worked example of requirements section 16 plus the validation
 * cases, running the same pure functions the site uses (scoring.js).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as S from './scoring.js';

// ---- tiny runner -----------------------------------------------------------
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ---- fixtures --------------------------------------------------------------
const GEMS_CSV = readFileSync(new URL('./data/gems.csv', import.meta.url), 'utf8');
const GAMES_CSV = readFileSync(new URL('./data/games.csv', import.meta.url), 'utf8');
const TODAY = '2027-12-31'; // fixtures use dates in 2026 and 2027

const TEST_PLAYERS = ['ruby', 'opal', 'jade', 'onyx', 'amber', 'sapphire', 'emerald'];
const playersCsv = (ids = TEST_PLAYERS) => 'id,nickname\n' + ids.map((id) => `${id},Seat of ${id}\n`).join('');
const resultsCsv = (rows) => 'date,game,round,place,players\n' + rows.map((r) => r + '\n').join('');

/** Build a dataset from result rows (strings like "2026-09-19,dune,1,1,ruby"). */
function dataset(rows, { games = GAMES_CSV, players = playersCsv(), today = TODAY } = {}) {
  return S.build({ gems: GEMS_CSV, players, games, results: resultsCsv(rows) }, today);
}
function ok(rows, opts) {
  const { errors, data } = dataset(rows, opts);
  assert.deepEqual(errors.map(String), [], 'expected clean data');
  return data;
}
function errorsOf(rows, opts) {
  return dataset(rows, opts).errors;
}
function assertError(errors, file, line, pattern) {
  assert.ok(errors.length > 0, 'expected at least one error');
  const hit = errors.find((e) => e.file === file && e.line === line && pattern.test(e.detail));
  assert.ok(hit, `expected an error at ${file} line ${line} matching ${pattern}; got:\n  ${errors.map(String).join('\n  ')}`);
}
const resultOf = (data, player, date, game) => data.playerResults.find((r) => r.player === player && r.date === date && r.game === game);

// A 4-seat Dune instance won by `first` with fillers in the remaining seats.
const dune4 = (date, round, first, second, third, fourth) => [
  `${date},dune,${round},1,${first}`, `${date},dune,${round},2,${second}`,
  `${date},dune,${round},3,${third}`, `${date},dune,${round},4,${fourth}`,
];

// =============================================================================
// 16.1 The ladder in section 4 for n = 2 through 7
// =============================================================================
const LADDER = {
  2: [100, 10],
  3: [100, 40, 10],
  4: [100, 50, 30, 10],
  5: [100, 55, 40, 25, 10],
  6: [100, 58, 46, 34, 22, 10],
  7: [100, 60, 50, 40, 30, 20, 10],
};
for (const [n, row] of Object.entries(LADDER)) {
  test(`16.1 ladder n=${n}: ${row.join(' ')}`, () => {
    row.forEach((expected, i) => {
      const p = i + 1;
      assert.equal(S.round1(S.score(Number(n), p)), expected, `score(${n}, ${p})`);
      assert.equal(S.points10(100, Number(n), p), expected * 10, `points10(100, ${n}, ${p})`);
    });
  });
}
test('16.1 range: every seat count gives 100 for 1st and 10 for last', () => {
  for (let n = 2; n <= 12; n++) {
    assert.equal(S.score(n, 1), 100);
    assert.equal(S.score(n, n), 10);
    assert.equal(S.frac(n, 1), 1);
    assert.equal(S.frac(n, n), 0);
  }
});
test('16.1 accepted consequences: 2nd of 6 beats 2nd of 4; 1st of 2 equals 1st of 6', () => {
  assert.ok(S.score(6, 2) > S.score(4, 2));
  assert.equal(S.score(2, 1), S.score(6, 1));
});

// =============================================================================
// 16.2 Ties: 4 seats, places 1, 2, 2, 4 give scores 100, 50, 50, 10
// =============================================================================
test('16.2 ties 1,2,2,4 score 100, 50, 50, 10 and both tied seats are place 2', () => {
  const data = ok(['2026-09-19,dune,1,1,ruby', '2026-09-19,dune,1,2,opal', '2026-09-19,dune,1,2,jade', '2026-09-19,dune,1,4,onyx']);
  const scores = ['ruby', 'opal', 'jade', 'onyx'].map((id) => resultOf(data, id, '2026-09-19', 'dune').score);
  assert.deepEqual(scores, [100, 50, 50, 10]);
  assert.equal(resultOf(data, 'opal', '2026-09-19', 'dune').p, 2);
});
test('16.2 a tie for 1st gives every tied seat the full bonus and a win', () => {
  const data = ok(['2026-09-19,catan,1,1,ruby', '2026-09-19,catan,1,1,opal', '2026-09-19,catan,1,3,jade']);
  assert.equal(resultOf(data, 'ruby', '2026-09-19', 'catan').score, 100);
  assert.equal(resultOf(data, 'opal', '2026-09-19', 'catan').score, 100);
  assert.equal(resultOf(data, 'opal', '2026-09-19', 'catan').win, true);
  assert.equal(resultOf(data, 'jade', '2026-09-19', 'catan').score, 10);
  assert.equal(S.winsRows(data.playerResults).filter((r) => r.wins === 1).length, 2);
});

// =============================================================================
// 16.3 Shared seat: opal+jade at place 2 of 4 in Dune gives each 50.0 points
// =============================================================================
test('16.3 shared seat opal+jade, 2nd of 4 in Dune: 50.0 points each, one game, no win', () => {
  const data = ok(['2026-09-19,dune,1,1,ruby', '2026-09-19,dune,1,2,opal+jade', '2026-09-19,dune,1,3,onyx', '2026-09-19,dune,1,4,amber']);
  assert.equal(data.instances[0].n, 4, 'the shared seat is one seat');
  for (const id of ['opal', 'jade']) {
    const r = resultOf(data, id, '2026-09-19', 'dune');
    assert.equal(r.points10, 500);
    assert.equal(S.formatTenths(r.points10), '50.0');
    assert.equal(r.win, false);
    assert.equal(r.n, 4);
    assert.deepEqual(r.seatmates, [id === 'opal' ? 'jade' : 'opal']);
  }
  const wins = S.winsRows(data.playerResults);
  assert.equal(wins.find((r) => r.player === 'opal').games, 1);
  assert.equal(wins.find((r) => r.player === 'jade').games, 1);
  assert.equal(wins.find((r) => r.player === 'ruby').wins, 1);
});
test('16.3 a shared seat at place 1 gives every member a full win', () => {
  const data = ok(['2026-09-19,dune,1,1,opal+jade', '2026-09-19,dune,1,2,ruby']);
  const wins = S.winsRows(data.playerResults);
  assert.equal(wins.find((r) => r.player === 'opal').wins, 1);
  assert.equal(wins.find((r) => r.player === 'jade').wins, 1);
  assert.equal(resultOf(data, 'jade', '2026-09-19', 'dune').points10, 1000);
});

// =============================================================================
// 16.4 Points: Catan 6 seats 2nd = 34.8; Wizard 5 seats 3rd = 16.0
// =============================================================================
test('16.4 Catan, 6 seats, 2nd: score 58, points 34.8', () => {
  assert.equal(S.score(6, 2), 58);
  assert.equal(S.points10(60, 6, 2), 348);
  assert.equal(S.points(60, 6, 2), 34.8);
});
test('16.4 Wizard, 5 seats, 3rd: score 40, points 16.0', () => {
  assert.equal(S.score(5, 3), 40);
  assert.equal(S.points10(40, 5, 3), 160);
  assert.equal(S.points(40, 5, 3), 16);
});
test('16.4 points equal round1(weight × score / 100) for every weight and ladder cell', () => {
  for (const weight of [10, 20, 40, 60, 90, 100]) {
    for (let n = 2; n <= 7; n++) {
      for (let p = 1; p <= n; p++) {
        assert.equal(S.points(weight, n, p), S.round1((weight * S.score(n, p)) / 100), `weight ${weight} n ${n} p ${p}`);
      }
    }
  }
});
test('16.4 rounding is half up: 0.05 rounds to 0.1, 0.15 to 0.2', () => {
  assert.equal(S.round1(0.05), 0.1);
  assert.equal(S.round1(0.15), 0.2);
  assert.equal(S.round1(2.25), 2.3);
  // 1 × score(3, 2) / 100 = 0.4 exactly; 1 × score(7, 6) / 100 = 0.2
  assert.equal(S.points10(1, 3, 2), 4);
  // 3 × 55 / 100 = 1.65 → 1.7 (half up), computed exactly
  assert.equal(S.points10(3, 5, 2), 17);
});

// =============================================================================
// 16.5 Month test, Dune only
// =============================================================================
test('16.5 arithmetic: four 2nds of 4 = 200.0; two wins + two lasts = 220.0; four 2nds of 6 = 232.0', () => {
  assert.equal(4 * S.points10(100, 4, 2), 2000);
  assert.equal(2 * S.points10(100, 4, 1) + 2 * S.points10(100, 4, 4), 2200);
  assert.equal(4 * S.points10(100, 6, 2), 2320);
  assert.ok(4 * S.points10(100, 6, 2) > 2200);
});
test('16.5 through the monthly board: opal 2nd four times = 200.0; ruby two wins, two lasts = 220.0', () => {
  const rows = [
    ...dune4('2026-09-05', 1, 'ruby', 'opal', 'jade', 'onyx'),
    ...dune4('2026-09-12', 1, 'ruby', 'opal', 'jade', 'onyx'),
    ...dune4('2026-09-19', 1, 'jade', 'opal', 'onyx', 'ruby'),
    ...dune4('2026-09-26', 1, 'onyx', 'opal', 'jade', 'ruby'),
  ];
  const data = ok(rows);
  const board = S.monthlyRows(data.playerResults, '2026-09');
  const opal = board.find((r) => r.player === 'opal');
  const ruby = board.find((r) => r.player === 'ruby');
  assert.equal(opal.total10, 2000);
  assert.equal(ruby.total10, 2200);
  assert.equal(ruby.rank, 1);
  assert.equal(opal.rank, 2);
});

// =============================================================================
// 16.6 Wizard sweep: 160.0 + 24.0 = 184.0 beats 120.0 + 16.0 = 136.0
// =============================================================================
test('16.6 four Wizard wins + four Catan lasts (184.0) beat four Catan 2nds + four Wizard lasts (136.0)', () => {
  const sweep = 4 * S.points10(40, 4, 1) + 4 * S.points10(60, 4, 4);
  const steady = 4 * S.points10(60, 4, 2) + 4 * S.points10(40, 4, 4);
  assert.equal(4 * S.points10(40, 4, 1), 1600);
  assert.equal(4 * S.points10(60, 4, 4), 240);
  assert.equal(sweep, 1840);
  assert.equal(4 * S.points10(60, 4, 2), 1200);
  assert.equal(4 * S.points10(40, 4, 4), 160);
  assert.equal(steady, 1360);
  assert.ok(sweep > steady);
});

// =============================================================================
// 16.7 The performance table in section 6 with mu fixed at 47.5
// =============================================================================
const duneRecord = (wins, places) => {
  const results = [];
  for (let i = 0; i < wins; i++) results.push({ weight: 100, score: S.score(4, 1) });
  for (const p of places) results.push({ weight: 100, score: S.score(4, p) });
  return results;
};
const PERF_TABLE = [
  ['1 win of 1', duneRecord(1, []), 52],
  ['10 of 10', duneRecord(10, []), 74],
  ['20 of 30, ten last places', duneRecord(20, Array(10).fill(4)), 64],
  ['20 of 30, ten 2nd places', duneRecord(20, Array(10).fill(2)), 74],
  ['24 of 30, six last places', duneRecord(24, Array(6).fill(4)), 73],
  ['24 of 30, six 2nd places', duneRecord(24, Array(6).fill(2)), 79],
];
for (const [label, record, expected] of PERF_TABLE) {
  test(`16.7 performance "${label}" → ${expected} with mu = 47.5`, () => {
    const P = S.performanceOf(record, 47.5);
    assert.equal(Math.round(P), expected, `P = ${P}`);
  });
}
test('16.7 K is ten Dune games and mu is the weighted mean of every player-result', () => {
  assert.equal(S.K, 1000);
  const data = ok(['2026-09-19,dune,1,1,ruby', '2026-09-19,dune,1,2,opal', '2026-09-19,skipbo,1,1,opal', '2026-09-19,skipbo,1,2,ruby']);
  // mu = (100·100 + 100·10 + 10·100 + 10·10) / 220 = 12100 / 220 = 55
  assert.equal(S.groupMean(data.playerResults), 55);
  const rows = S.performanceRows(data.playerResults);
  const ruby = rows.find((r) => r.player === 'ruby');
  // ruby: (100·100 + 10·10 + 1000·55) / (110 + 1000)
  assert.ok(Math.abs(ruby.P - (10000 + 100 + 55000) / 1110) < 1e-12);
  assert.equal(ruby.rank, 1);
  assert.equal(rows.find((r) => r.player === 'opal').rank, 2);
});
test('16.7 phantom games pull a few-game player toward the middle, never below', () => {
  const data = ok(['2026-09-19,dune,1,1,ruby', '2026-09-19,dune,1,2,opal', '2026-09-19,dune,1,3,jade', '2026-09-19,dune,1,4,onyx']);
  const rows = S.performanceRows(data.playerResults);
  const mu = S.groupMean(data.playerResults);
  for (const r of rows) {
    if (r.rawMean > mu) assert.ok(r.P < r.rawMean && r.P > mu);
    if (r.rawMean < mu) assert.ok(r.P > r.rawMean && r.P < mu);
  }
});

// =============================================================================
// 16.8 Effective weight
// =============================================================================
const GAMES_TWO_ROWS = 'id,name,weight,from\ndune,Dune: Imperium – Uprising,100,2026-09-01\ndune,Dune: Imperium – Uprising,90,2027-02-01\n';
test('16.8 weightFor: 2027-01-31 uses 100, 2027-02-01 uses 90', () => {
  const games = S.parseCsv(GAMES_TWO_ROWS, 'data/games.csv', S.HEADERS.games);
  assert.equal(S.weightFor(games, 'dune', '2027-01-31'), 100);
  assert.equal(S.weightFor(games, 'dune', '2027-02-01'), 90);
  assert.equal(S.weightFor(games, 'dune', '2026-08-31'), null);
  assert.equal(S.weightFor(games, 'catan', '2027-02-01'), null);
});
test('16.8 through the pipeline: points already awarded do not change', () => {
  const data = ok(['2027-01-31,dune,1,1,ruby', '2027-01-31,dune,1,2,opal', '2027-02-01,dune,1,1,ruby', '2027-02-01,dune,1,2,opal'], { games: GAMES_TWO_ROWS });
  assert.equal(resultOf(data, 'ruby', '2027-01-31', 'dune').weight, 100);
  assert.equal(resultOf(data, 'ruby', '2027-01-31', 'dune').points10, 1000);
  assert.equal(resultOf(data, 'ruby', '2027-02-01', 'dune').weight, 90);
  assert.equal(resultOf(data, 'ruby', '2027-02-01', 'dune').points10, 900);
  assert.equal(resultOf(data, 'opal', '2027-02-01', 'dune').points10, 90);
});

// =============================================================================
// 16.9 Monthly tiebreak: one case per step of the chain
// =============================================================================
// Fillers: jade, onyx, opal. Contenders: ruby and amber (amber sorts first).
test('16.9 step 1: highest total wins', () => {
  const data = ok([...dune4('2026-09-05', 1, 'ruby', 'amber', 'jade', 'onyx')]);
  const m = S.resolveMonth(data.playerResults, '2026-09');
  assert.equal(m.winner.player, 'ruby');
  assert.equal(m.step, 1);
  assert.equal(m.margin10, 500);
  assert.equal(m.runnerUp.player, 'amber');
});
test('16.9 step 2: equal total, most wins in the month', () => {
  const data = ok([
    // dune n=3: ruby 100, amber 40, jade 10
    '2026-09-05,dune,1,1,ruby', '2026-09-05,dune,1,2,amber', '2026-09-05,dune,1,3,jade',
    // catan n=4: jade 60, amber 30, onyx 18, opal 6
    '2026-09-12,catan,1,1,jade', '2026-09-12,catan,1,2,amber', '2026-09-12,catan,1,3,onyx', '2026-09-12,catan,1,4,opal',
    // catan n=4: onyx 60, amber 30, jade 18, opal 6
    '2026-09-19,catan,1,1,onyx', '2026-09-19,catan,1,2,amber', '2026-09-19,catan,1,3,jade', '2026-09-19,catan,1,4,opal',
  ]);
  const m = S.resolveMonth(data.playerResults, '2026-09');
  assert.equal(m.winner.total10, 1000);
  assert.equal(m.runnerUp.total10, 1000);
  assert.equal(m.winner.player, 'ruby');
  assert.equal(m.runnerUp.player, 'amber');
  assert.equal(m.step, 2);
  assert.equal(m.margin10, 0);
  // the board itself shares the rank
  assert.equal(m.rows.find((r) => r.player === 'ruby').rank, 1);
  assert.equal(m.rows.find((r) => r.player === 'amber').rank, 1);
  assert.equal(m.rows.find((r) => r.player === 'jade').rank, 3);
});
test('16.9 step 3: equal total and wins, highest weight among games won', () => {
  const data = ok([
    ...dune4('2026-09-05', 1, 'ruby', 'jade', 'onyx', 'opal'),                                   // ruby 100
    '2026-09-05,catan,1,1,amber', '2026-09-05,catan,1,2,opal',                                     // amber 60, opal 6
    '2026-09-12,risk,1,1,opal', '2026-09-12,risk,1,2,amber', '2026-09-12,risk,1,3,jade', '2026-09-12,risk,1,4,onyx',       // amber 30
    '2026-09-19,smash,1,1,onyx', '2026-09-19,smash,1,2,amber', '2026-09-19,smash,1,3,jade', '2026-09-19,smash,1,4,opal',   // amber 10
  ]);
  const m = S.resolveMonth(data.playerResults, '2026-09');
  assert.equal(m.winner.total10, 1000);
  assert.equal(m.runnerUp.total10, 1000);
  assert.equal(m.winner.wins, 1);
  assert.equal(m.runnerUp.wins, 1);
  assert.equal(m.winner.player, 'ruby');
  assert.equal(m.runnerUp.player, 'amber');
  assert.equal(m.step, 3);
});
test('16.9 step 4: equal total, wins and best weight, most player-results', () => {
  const data = ok([
    ...dune4('2026-09-05', 1, 'amber', 'jade', 'onyx', 'opal'),
    ...dune4('2026-09-05', 2, 'ruby', 'onyx', 'opal', 'jade'),
    '2026-09-12,wizard,1,1,opal', '2026-09-12,wizard,1,2,amber', '2026-09-12,wizard,1,3,jade', '2026-09-12,wizard,1,4,onyx',
    '2026-09-19,smash,1,1,jade', '2026-09-19,smash,1,2,ruby', '2026-09-19,smash,1,3,onyx', '2026-09-19,smash,1,4,opal',
    '2026-09-19,smash,2,1,onyx', '2026-09-19,smash,2,2,ruby', '2026-09-19,smash,2,3,opal', '2026-09-19,smash,2,4,jade',
  ]);
  const m = S.resolveMonth(data.playerResults, '2026-09');
  assert.equal(m.winner.total10, 1200);
  assert.equal(m.runnerUp.total10, 1200);
  assert.equal(m.winner.player, 'ruby');
  assert.equal(m.winner.games, 3);
  assert.equal(m.runnerUp.player, 'amber');
  assert.equal(m.runnerUp.games, 2);
  assert.equal(m.step, 4);
});
test('16.9 step 5: identical month, highest P as of the last day of the month', () => {
  const data = ok([
    '2026-09-26,dune,1,1,ruby', '2026-09-26,dune,1,2,amber',   // September: ruby beat amber
    ...dune4('2026-10-03', 1, 'ruby', 'jade', 'onyx', 'opal'),
    ...dune4('2026-10-10', 1, 'amber', 'jade', 'onyx', 'opal'),
  ]);
  const m = S.resolveMonth(data.playerResults, '2026-10');
  assert.equal(m.winner.player, 'ruby');
  assert.equal(m.runnerUp.player, 'amber');
  assert.equal(m.step, 5);
  assert.ok(m.winner.P > m.runnerUp.P);
  // and September has its own winner, decided at step 1
  const sep = S.resolveMonth(data.playerResults, '2026-09');
  assert.equal(sep.winner.player, 'ruby');
  assert.equal(sep.step, 1);
  assert.equal(sep.margin10, 900);
});
test('16.9 step 5 uses P as of the month end, ignoring later results', () => {
  const data = ok([
    ...dune4('2026-09-05', 1, 'ruby', 'jade', 'onyx', 'opal'),
    ...dune4('2026-09-12', 1, 'amber', 'jade', 'onyx', 'opal'),
    '2026-10-03,dune,1,1,ruby', '2026-10-03,dune,1,2,amber',   // October must not decide September
  ]);
  const m = S.resolveMonth(data.playerResults, '2026-09');
  assert.equal(m.step, 6);
  assert.equal(m.winner.player, 'amber');
});
test('16.9 step 6: everything equal, lowest ID alphabetically', () => {
  const data = ok([
    ...dune4('2026-09-05', 1, 'ruby', 'jade', 'onyx', 'opal'),
    ...dune4('2026-09-12', 1, 'amber', 'jade', 'onyx', 'opal'),
  ]);
  const m = S.resolveMonth(data.playerResults, '2026-09');
  assert.equal(m.winner.player, 'amber');
  assert.equal(m.runnerUp.player, 'ruby');
  assert.equal(m.step, 6);
  assert.equal(m.winner.P, m.runnerUp.P);
});
test('16.9 a shared winning seat: members are identical in every step, the lowest ID takes it', () => {
  const data = ok(['2026-09-05,dune,1,1,ruby+amber', '2026-09-05,dune,1,2,jade+onyx+opal']);
  const m = S.resolveMonth(data.playerResults, '2026-09');
  assert.equal(m.step, 6);
  assert.equal(m.winner.player, 'amber');
  assert.equal(m.runnerUp.player, 'ruby');
  assert.equal(m.margin10, 0);
  assert.equal(m.rows.filter((r) => r.rank === 1).length, 2);
});
test('16.9 a month without games resolves to null', () => {
  const data = ok(['2026-09-05,dune,1,1,ruby', '2026-09-05,dune,1,2,opal']);
  assert.equal(S.resolveMonth(data.playerResults, '2026-10'), null);
  assert.deepEqual(S.hallRows([]), []);
});

// =============================================================================
// 16.10 Validation
// =============================================================================
const R = S.FILES.results, G = S.FILES.games, P = S.FILES.players;
test('16.10 places 1,2,2,3 are rejected, naming the file and the offending line', () => {
  const errors = errorsOf(['2026-09-19,dune,1,1,ruby', '2026-09-19,dune,1,2,opal', '2026-09-19,dune,1,2,jade', '2026-09-19,dune,1,3,onyx']);
  assertError(errors, R, 5, /place 3 breaks competition ranking/);
  assert.match(errors[0].message, /^data\/results\.csv, line 5: /);
});
test('16.10 an unknown ID is rejected', () => {
  const errors = errorsOf(['2026-09-19,dune,1,1,ruby', '2026-09-19,dune,1,2,zircon']);
  assertError(errors, R, 3, /player "zircon" is not in data\/players\.csv/);
  const shared = errorsOf(['2026-09-19,dune,1,1,ruby', '2026-09-19,dune,1,2,opal+nobody']);
  assertError(shared, R, 3, /player "nobody" is not in/);
});
test('16.10 from = 2026-09-15 is rejected', () => {
  const games = 'id,name,weight,from\ndune,Dune: Imperium – Uprising,100,2026-09-15\n';
  const errors = errorsOf([], { games });
  assertError(errors, G, 2, /must be the 1st of a month/);
});
test('16.10 a result dated before the game\'s first from is rejected', () => {
  const errors = errorsOf(['2026-08-29,dune,1,1,ruby', '2026-08-29,dune,1,2,opal']);
  assertError(errors, R, 2, /no weight in effect on 2026-08-29; its first from is 2026-09-01/);
  assertError(errors, R, 3, /no weight in effect/);
});
test('16.10 ranking sequences: 1,1,3 passes; 1,2,2,4 passes; 2,3,4 fails', () => {
  ok(['2026-09-19,dune,1,1,ruby', '2026-09-19,dune,1,1,opal', '2026-09-19,dune,1,3,jade']);
  ok(['2026-09-19,dune,1,1,ruby', '2026-09-19,dune,1,2,opal', '2026-09-19,dune,1,2,jade', '2026-09-19,dune,1,4,onyx']);
  const errors = errorsOf(['2026-09-19,dune,1,2,ruby', '2026-09-19,dune,1,3,opal', '2026-09-19,dune,1,4,jade']);
  assertError(errors, R, 2, /place 2 breaks competition ranking .* must be place 1/);
});
test('16.10 an instance needs at least two seats', () => {
  assertError(errorsOf(['2026-09-19,dune,1,1,ruby']), R, 2, /has one seat; at least 2 are needed/);
});
test('16.10 a player cannot sit in two seats of one instance', () => {
  assertError(errorsOf(['2026-09-19,dune,1,1,ruby', '2026-09-19,dune,1,2,ruby']), R, 3, /player "ruby" appears twice/);
  assertError(errorsOf(['2026-09-19,dune,1,1,ruby+opal', '2026-09-19,dune,1,2,jade+opal']), R, 3, /player "opal" appears twice/);
});
test('16.10 two rounds of one game on one date are separate instances', () => {
  const data = ok(['2026-09-19,dune,1,1,ruby', '2026-09-19,dune,1,2,opal', '2026-09-19,dune,2,1,opal', '2026-09-19,dune,2,2,ruby']);
  assert.equal(data.instances.length, 2);
  assert.equal(S.winsRows(data.playerResults).every((r) => r.wins === 1 && r.games === 2), true);
});
test('16.10 dates must be real and not in the future', () => {
  assertError(errorsOf(['2026-02-30,dune,1,1,ruby', '2026-02-30,dune,1,2,opal']), R, 2, /not a valid YYYY-MM-DD date/);
  assertError(errorsOf(['2026-9-19,dune,1,1,ruby', '2026-9-19,dune,1,2,opal']), R, 2, /not a valid YYYY-MM-DD date/);
  assertError(errorsOf(['2026-09-20,dune,1,1,ruby', '2026-09-20,dune,1,2,opal'], { today: '2026-09-19' }), R, 2, /is in the future \(today is 2026-09-19\)/);
  ok(['2026-09-19,dune,1,1,ruby', '2026-09-19,dune,1,2,opal'], { today: '2026-09-19' });
});
test('16.10 round and place must be positive integers', () => {
  assertError(errorsOf(['2026-09-19,dune,0,1,ruby', '2026-09-19,dune,0,2,opal']), R, 2, /round "0" must be a positive integer/);
  assertError(errorsOf(['2026-09-19,dune,1,01,ruby', '2026-09-19,dune,1,2,opal']), R, 2, /place "01" must be a positive integer/);
});
test('16.10 an unknown game is rejected', () => {
  assertError(errorsOf(['2026-09-19,chess,1,1,ruby', '2026-09-19,chess,1,2,opal']), R, 2, /game "chess" is not in data\/games\.csv/);
});
test('16.10 players.csv: ids must exist in gems.csv, ids and nicknames unique', () => {
  assertError(errorsOf([], { players: 'id,nickname\ndiamond,Alpha\n' }), P, 2, /id "diamond" is not in data\/gems\.csv/);
  assertError(errorsOf([], { players: 'id,nickname\nruby,Alpha\nruby,Bravo\n' }), P, 3, /duplicate id "ruby"/);
  assertError(errorsOf([], { players: 'id,nickname\nruby,Alpha\nopal,Alpha\n' }), P, 3, /duplicate nickname "Alpha"/);
  assertError(errorsOf([], { players: 'id,nickname\nruby,\n' }), P, 2, /nickname is empty/);
});
test('16.10 games.csv: weight positive integer, (id, from) unique, id well formed', () => {
  assertError(errorsOf([], { games: 'id,name,weight,from\ndune,Dune,0,2026-09-01\n' }), G, 2, /weight "0" must be a positive integer/);
  assertError(errorsOf([], { games: 'id,name,weight,from\ndune,Dune,100,2026-09-01\ndune,Dune,90,2026-09-01\n' }), G, 3, /duplicate \(id, from\)/);
  assertError(errorsOf([], { games: 'id,name,weight,from\nDune,Dune,100,2026-09-01\n' }), G, 2, /must be lowercase a-z and 0-9/);
});
test('16.10 file format: header, field count, blank lines, CRLF, quotes, BOM', () => {
  const H = S.HEADERS.results;
  assert.throws(() => S.parseCsv('date,game,round,place\n', R, H), (e) => e.file === R && e.line === 1 && /expected the header/.test(e.detail));
  assert.throws(() => S.parseCsv('date,game,round,place,players\n2026-09-19,dune,1,1\n', R, H), (e) => e.line === 2 && /expected 5 fields but found 4/.test(e.detail));
  assert.throws(() => S.parseCsv('date,game,round,place,players\n\n2026-09-19,dune,1,1,ruby\n', R, H), (e) => e.line === 2 && /blank line/.test(e.detail));
  assert.throws(() => S.parseCsv('date,game,round,place,players\n2026-09-19,dune,1,1,ruby\n\n', R, H), (e) => e.line === 3 && /blank line/.test(e.detail));
  assert.throws(() => S.parseCsv('date,game,round,place,players\r\n', R, H), (e) => e.line === 1 && /carriage return/.test(e.detail));
  assert.throws(() => S.parseCsv('date,game,round,place,players\n2026-09-19,"dune",1,1,ruby\n', R, H), (e) => e.line === 2 && /quotes/.test(e.detail));
  assert.throws(() => S.parseCsv('﻿date,game,round,place,players\n', R, H), (e) => e.line === 1 && /byte order mark/.test(e.detail));
  assert.throws(() => S.parseCsv('', R, H), (e) => e.line === 1 && /file is empty/.test(e.detail));
  // a missing trailing newline is tolerated; a header-only file has no rows
  assert.deepEqual(S.parseCsv('date,game,round,place,players', R, H), []);
  assert.deepEqual(S.parseCsv('date,game,round,place,players\n', R, H), []);
  // a format error in one file surfaces through build()
  const { errors, data } = S.build({ gems: GEMS_CSV, players: playersCsv(), games: GAMES_CSV, results: 'wrong\n' }, TODAY);
  assert.equal(data, null);
  assert.equal(errors[0].file, R);
  assert.equal(errors[0].line, 1);
});
test('16.10 every error is reported, not only the first', () => {
  const errors = errorsOf(['2026-09-19,dune,1,1,zircon', '2026-09-19,dune,1,2,spinel']);
  assert.equal(errors.length, 2);
});

// =============================================================================
// Boards, ranks, race data, player summary, hall
// =============================================================================
test('boards: ranks are shared and the next rank skips (1, 2, 2, 4)', () => {
  const rows = [{ v: 5 }, { v: 9 }, { v: 5 }, { v: 1 }];
  S.rankSorted(rows, (a, b) => b.v - a.v);
  assert.deepEqual(rows.map((r) => [r.v, r.rank]), [[9, 1], [5, 2], [5, 2], [1, 4]]);
});
test('wins board: wins desc, then weighted wins, shared ranks; per-game filter', () => {
  const data = ok([
    '2026-09-05,dune,1,1,ruby', '2026-09-05,dune,1,2,opal',
    '2026-09-05,skipbo,1,1,opal', '2026-09-05,skipbo,1,2,ruby',
    '2026-09-12,catan,1,1,jade', '2026-09-12,catan,1,2,ruby',
    '2026-09-12,skipbo,1,1,onyx', '2026-09-12,skipbo,1,2,jade',
  ]);
  const rows = S.winsRows(data.playerResults);
  assert.deepEqual(rows.map((r) => [r.player, r.wins, r.games, r.weightedWins, r.rank]), [
    ['ruby', 1, 3, 100, 1],
    ['jade', 1, 2, 60, 2],
    ['opal', 1, 2, 10, 3],
    ['onyx', 1, 1, 10, 3],
  ]);
  const skipbo = S.winsRows(data.playerResults, 'skipbo');
  assert.deepEqual(skipbo.map((r) => [r.player, r.wins, r.games, r.rank]), [['opal', 1, 1, 1], ['onyx', 1, 1, 1], ['ruby', 0, 1, 3], ['jade', 0, 1, 3]]);
  assert.equal(S.winsRows(data.playerResults, 'risk').length, 0, 'players without a result in the game are not listed');
});
test('performance board: players with no results are not listed; P shown at full precision order', () => {
  const data = ok(['2026-09-05,dune,1,1,ruby', '2026-09-05,dune,1,2,opal', '2026-09-05,dune,1,3,jade']);
  const rows = S.performanceRows(data.playerResults);
  assert.deepEqual(rows.map((r) => r.player), ['ruby', 'opal', 'jade']);
  assert.deepEqual(rows.map((r) => r.rank), [1, 2, 3]);
  assert.ok(!rows.some((r) => r.player === 'onyx'));
});
test('monthly board: players without a result in the month are not listed; months are listed newest first', () => {
  const data = ok(['2026-09-26,dune,1,1,ruby', '2026-09-26,dune,1,2,opal', '2026-10-03,dune,1,1,jade', '2026-10-03,dune,1,2,onyx']);
  assert.deepEqual(S.monthsWithGames(data.playerResults), ['2026-10', '2026-09']);
  assert.deepEqual(S.monthlyRows(data.playerResults, '2026-10').map((r) => r.player), ['jade', 'onyx']);
  assert.deepEqual(S.monthlyRows(data.playerResults, '2026-11'), []);
  assert.equal(S.resolveMonth(data.playerResults, '2026-11'), null);
});
test('race data: cumulative totals per player per distinct date, carried forward', () => {
  const data = ok([
    '2026-09-05,dune,1,1,ruby', '2026-09-05,dune,1,2,opal',
    '2026-09-12,catan,1,1,opal', '2026-09-12,catan,1,2,jade',
    '2026-09-19,skipbo,1,1,ruby', '2026-09-19,skipbo,1,2,opal',
  ]);
  const race = S.raceData(data.playerResults, '2026-09');
  assert.deepEqual(race.dates, ['2026-09-05', '2026-09-12', '2026-09-19']);
  const s = Object.fromEntries(race.series.map((x) => [x.player, x.values]));
  assert.deepEqual(s.ruby, [1000, 1000, 1100]);
  assert.deepEqual(s.opal, [100, 700, 710]);
  assert.deepEqual(s.jade, [0, 60, 60]);
  assert.deepEqual(race.series.map((x) => x.player), ['ruby', 'opal', 'jade']);
});
test('player summary: form is the last five, streaks, best and worst game by mean unrounded score', () => {
  const data = ok([
    '2026-09-01,dune,1,1,ruby', '2026-09-01,dune,1,2,opal',           // W
    '2026-09-02,catan,1,1,ruby', '2026-09-02,catan,1,2,opal',         // W
    '2026-09-03,catan,1,2,ruby', '2026-09-03,catan,1,1,opal',         // L (last)
    '2026-09-04,wizard,1,1,ruby', '2026-09-04,wizard,1,2,opal', '2026-09-04,wizard,1,3,jade',  // W
    '2026-09-05,wizard,1,2,ruby', '2026-09-05,wizard,1,1,opal', '2026-09-05,wizard,1,3,jade',  // other (2nd of 3)
    '2026-09-06,dune,1,1,ruby', '2026-09-06,dune,1,2,opal',           // W
    '2026-09-07,dune,1,1,ruby', '2026-09-07,dune,1,2,opal',           // W
  ]);
  const ruby = S.playerSummary(data.playerResults, 'ruby');
  assert.equal(ruby.games, 7);
  assert.equal(ruby.wins, 5);
  assert.equal(ruby.currentStreak, 2);
  assert.equal(ruby.longestStreak, 2);
  assert.deepEqual(ruby.form.map((r) => (r.win ? 'W' : r.last ? 'L' : 'O')), ['L', 'W', 'O', 'W', 'W']);
  assert.equal(ruby.bestGame.game, 'dune');   // mean 100
  assert.equal(ruby.bestGame.mean, 100);
  assert.equal(ruby.worstGame.game, 'catan'); // mean (100 + 10) / 2 = 55 < wizard (100 + 40) / 2 = 70
  assert.equal(ruby.worstGame.mean, 55);
  const opal = S.playerSummary(data.playerResults, 'opal');
  assert.equal(opal.currentStreak, 0);
  assert.equal(opal.longestStreak, 1);
  const nobody = S.playerSummary(data.playerResults, 'onyx');
  assert.equal(nobody.games, 0);
  assert.equal(nobody.bestGame, null);
  assert.deepEqual(nobody.form, []);
});
test('show the math: every field for a Catan 2nd of 6', () => {
  const data = ok(['2026-09-05,catan,1,1,ruby', '2026-09-05,catan,1,2,opal', '2026-09-05,catan,1,3,jade', '2026-09-05,catan,1,4,onyx', '2026-09-05,catan,1,5,amber', '2026-09-05,catan,1,6,sapphire']);
  const m = S.mathOf(resultOf(data, 'opal', '2026-09-05', 'catan'));
  assert.equal(m.n, 6);
  assert.equal(m.p, 2);
  assert.equal(m.frac, 0.8);
  assert.equal(m.floor, 10);
  assert.equal(m.spreadPart, 48);
  assert.equal(m.bonus, 0);
  assert.equal(m.score, 58);
  assert.equal(m.weight, 60);
  assert.equal(S.formatTenths(m.points10), '34.8');
  assert.equal(S.mathOf(resultOf(data, 'ruby', '2026-09-05', 'catan')).bonus, 30);
});
test('hall of snacks: one entry per month with games, newest first, with margin and step', () => {
  const data = ok([
    '2026-09-26,dune,1,1,ruby', '2026-09-26,dune,1,2,opal',
    ...dune4('2026-10-03', 1, 'ruby', 'jade', 'onyx', 'opal'),
    ...dune4('2026-10-10', 1, 'amber', 'jade', 'onyx', 'opal'),
  ]);
  const hall = S.hallRows(data.playerResults);
  assert.deepEqual(hall.map((h) => [h.month, h.winner.player, S.formatTenths(h.winner.total10), h.margin10, h.step, h.runnerUp.player]), [
    ['2026-10', 'ruby', '100.0', 0, 5, 'amber'],
    ['2026-09', 'ruby', '100.0', 900, 1, 'opal'],
  ]);
});
test('formatTenths and dates', () => {
  assert.equal(S.formatTenths(0), '0.0');
  assert.equal(S.formatTenths(5), '0.5');
  assert.equal(S.formatTenths(348), '34.8');
  assert.equal(S.formatTenths(2200), '220.0');
  assert.equal(S.lastDayOfMonth('2026-02'), '2026-02-28');
  assert.equal(S.lastDayOfMonth('2028-02'), '2028-02-29');
  assert.equal(S.lastDayOfMonth('2026-09'), '2026-09-30');
  assert.equal(S.isValidMonth('2026-09'), true);
  assert.equal(S.isValidMonth('2026-13'), false);
  assert.equal(S.monthOf('2026-09-19'), '2026-09');
});
test('game names come from the latest games.csv row; game order is first appearance', () => {
  const games = 'id,name,weight,from\ndune,Dune: Imperium – Uprising,100,2026-09-01\ncatan,Catan,60,2026-09-01\ndune,Dune Uprising,90,2027-02-01\n';
  const data = ok([], { games });
  assert.equal(data.gameNames.get('dune'), 'Dune Uprising');
  assert.deepEqual(data.gameOrder, ['dune', 'catan']);
});

// =============================================================================
// The shipped data files
// =============================================================================
test('the shipped data files parse and validate', () => {
  const texts = Object.fromEntries(Object.entries(S.FILES).map(([k, f]) => [k, readFileSync(new URL('./' + f, import.meta.url), 'utf8')]));
  const today = new Date().toISOString().slice(0, 10);
  const { errors, data } = S.build(texts, today);
  assert.deepEqual(errors.map(String), []);
  assert.equal(data.players.length, 7);
  assert.equal(data.games.length, 6);
  assert.equal(data.gemHex.size, 24);
  for (const p of data.players) assert.match(p.hex, /^#[0-9A-F]{6}$/);
});
test('constants are the documented values', () => {
  assert.equal(S.FLOOR, 10);
  assert.equal(S.SPREAD, 60);
  assert.equal(S.BONUS, 30);
  assert.equal(S.K, 1000);
  assert.equal(S.PERIOD_MONTHS, 1);
  assert.equal(S.FLOOR + S.SPREAD + S.BONUS, 100);
});

// ---- run ---------------------------------------------------------------------
let passed = 0, failed = 0;
for (const t of tests) {
  try {
    t.fn();
    passed += 1;
    console.log(`  ok   ${t.name}`);
  } catch (e) {
    failed += 1;
    console.log(`  FAIL ${t.name}\n       ${String(e.message).split('\n').join('\n       ')}`);
  }
}
console.log(`\n${passed} passed, ${failed} failed, ${tests.length} total`);
process.exit(failed ? 1 : 0);
