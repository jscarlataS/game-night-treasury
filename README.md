# Game Night Treasury

A static leaderboard for a weekly board game evening among friends. HTML, CSS,
vanilla JavaScript and four CSV files; every number is computed in the browser
on every visit. No build step, no dependencies, no external requests. The one
prize is snacks, bought by the host for each month's winner.

Live site: https://jscarlatas.github.io/game-night-treasury/

Players appear under nicknames and gem IDs only. Real names never enter this
repository: not in data, code, comments, commit messages, or issues.

## The rules, one sentence each

- **Placement score:** ten for playing, thirty for the win, sixty split by how many opponents you finished above.
- **Points:** a game's weight is what a win in it is worth, and a result scores that weight times the placement score divided by 100, rounded half up to one decimal.
- **Monthly board:** your points in the calendar month, added up; the highest total wins the snacks.
- **Monthly winner:** an exact tie is broken by most wins in the month, then the highest weight among games won, then most games played, then highest performance at month end, then the gem name alphabetically.
- **Performance:** your average placement score, weighted by game, after adding ten phantom Dune games at the group's average.
- **Wins board:** most wins first; equal wins are ordered by the summed weight of the games won.
- **Ties inside a game:** tied seats take the higher place and the next place is skipped (1, 2, 2, 4); a tie for first is a full win for everyone in it.
- **Shared seat or team:** one seat, written `a+b`; every member gets the seat's full score, a win if it placed first, and one game played, and the seat counts as one opponent for everyone else.
- **Seat count:** `n` is the number of seats in the game, so a two-seat win scores 100 and a six-seat second place beats a four-seat second place.
- **Weights over time:** a weight change starts on the 1st of a month and never changes points already awarded.
- **Boards and ties:** ranks are shared on every board (1, 2, 2, 4); only the monthly winner is fully resolved.
- **Departed players:** results stay, because removing them would change `n` for everyone else; on request the nickname becomes the capitalised gem name.
- **Constants:** `FLOOR`, `SPREAD`, `BONUS`, `K` and `PERIOD_MONTHS` live in `scoring.js`, may change retroactively until 2026-12-31, and are fixed afterwards.

### Placement ladder

`score(n, p) = 10 + 60 × (n − p) / (n − 1) + 30 × [p = 1]`

| n | 1st | 2nd | 3rd | 4th | 5th | 6th | 7th |
|---|---|---|---|---|---|---|---|
| 2 | 100 | 10 | | | | | |
| 3 | 100 | 40 | 10 | | | | |
| 4 | 100 | 50 | 30 | 10 | | | |
| 5 | 100 | 55 | 40 | 25 | 10 | | |
| 6 | 100 | 58 | 46 | 34 | 22 | 10 | |
| 7 | 100 | 60 | 50 | 40 | 30 | 20 | 10 |

### Weights

A weight is the value of a win in that game. Dune is the reference at 100.
The criterion for a new game is how much the game is the point of the evening:
length, intensity, and how much the group invests in it.

| game id | name | weight | from |
|---|---|---|---|
| dune | Dune: Imperium – Uprising | 100 | 2026-09-01 |
| catan | Catan | 60 | 2026-09-01 |
| risk | Risk | 60 | 2026-09-01 |
| wizard | Wizard | 40 | 2026-09-01 |
| smash | Super Smash Bros. | 20 | 2026-09-01 |
| skipbo | Skip-Bo | 10 | 2026-09-01 |

### Performance formula

```
P = ( Σ weight_i × score_i + K × mu ) / ( Σ weight_i + K )
K  = 1000  (ten Dune games)
mu = weighted mean score over every result in the dataset
```

## Entering results

Only the maintainer enters results. Friends have no write access and no entry
UI. The procedure:

1. During the evening, note the results outside the repo in any notes app.
2. Afterwards, at a laptop, tell the assistant the results by nickname. The
   assistant maps nicknames to IDs via `data/players.csv`, appends rows to
   `data/results.csv`, and writes nothing but IDs.
3. Preview locally, review the diff, commit, push.

Corrections edit rows in place. Git history is the audit trail; no correction
records exist. A correction can change a displayed past winner; snacks already
given are not re-awarded.

Weight changes: add a `data/games.csv` row with `from` equal to the 1st of the
next month, committed before any result of that month. A `from` that is not the
1st is rejected.

### Row format

One row per seat in `data/results.csv`:

```
date,game,round,place,players
2026-09-19,dune,1,1,ruby
2026-09-19,dune,1,2,opal+jade
2026-09-19,dune,1,3,onyx
2026-09-19,dune,1,4,amber
```

- `date`: the finish date, `YYYY-MM-DD`, local time. A paused game is entered
  when it finishes, dated with the finish date. A game that never finishes is
  never entered.
- `game`: an id from `data/games.csv`.
- `round`: the nth instance of that game on that date, starting at 1.
- `place`: competition rank, 1 for the winner. Tied seats share the higher
  place and the next place is skipped, so `1,2,2,4` and `1,1,3` are valid and
  `1,2,2,3` is not.
- `players`: one or more IDs joined by `+`. A shared seat or team is one row.
- Keep the file sorted by date and the rows of one instance contiguous.
- One-seat games and co-op games are not recorded. Sitting out is no row.

### Checklist for the assistant

1. Read `data/players.csv` and map every nickname to its ID. Never write a
   nickname, and never a real name, into `data/results.csv`.
2. Append the rows, one per seat, contiguous per instance, in date order.
3. Run `node tests.js`; every test must pass.
4. Preview with `python -m http.server` in the repo root and open
   `http://localhost:8000/`. Bad data shows a red banner naming the file and
   line; nothing else renders until it is fixed.
5. Commit with the message `results: YYYY-MM-DD` and push.

Commit message conventions: `results: YYYY-MM-DD`,
`weights: <game> from YYYY-MM-01`, `players: rename <id>`.

### How the full placement is decided at the table

| Game | Full ranking |
|---|---|
| Dune | All players by final victory points; ties by the rulebook's tiebreakers. |
| Catan | All players by final victory points including hidden ones; unresolved ties share a place. |
| Risk | Survivors at the end or at an agreed cutoff, ranked by troops then territories, all above eliminated players, who rank by elimination order with the last eliminated highest. |
| Wizard | Final score. |
| Skip-Bo | Winner first; others by cards remaining in the stock pile, fewer is better. |
| Smash | Bracket placement; players knocked out in the same round tie. |

## Identity

- `data/gems.csv` is the fixed pool of 24 gem IDs with a colour each.
- `data/players.csv` maps ID to nickname and is the only place a nickname
  exists. A rename edits one field; history is untouched.
- An ID is assigned once, never changed, never reused, even after a player
  leaves. A guest gets an ID like anyone else.
- Nickname policy: unique, no commas, no surnames, no initials, nothing a
  search engine links to a person.
- The seven stones in use were tuned so that every pair stays distinguishable
  under colour-vision deficiency on both themes. When a new player joins, pick a
  free stone from the pool; the chart also carries a legend, tooltips and the
  standings table, so no reading depends on colour alone.

## Validation

The site refuses to render on any of these, naming the file and line:

- a file with a wrong header, a wrong field count, a blank line, quotes,
  a byte order mark, or CRLF line endings;
- a player ID missing from `gems.csv`, a duplicate ID or nickname;
- a game with a non-integer weight or a `from` that is not the 1st;
- a result with an unknown game, an unknown player ID, an invalid or future
  date, or a date before the game's first `from`;
- an instance with fewer than two seats, a player in two seats, or places that
  break competition ranking.

## Site

Single page with hash routes, every route shareable:

- `#/` current month, `#/month/YYYY-MM` any month
- `#/performance`
- `#/wins`, `#/wins/<gameId>`
- `#/player/<id>`
- `#/hall`

Files: `index.html`, `style.css`, `app.js` (rendering and routing),
`scoring.js` (pure functions: parsing, validation, scoring, boards),
`strings.js` (all copy), `data/`, `tests.js`. Colours are CSS custom
properties in `style.css` and copy lives in `strings.js`, so a plain look is a
swap of those two files.

## Development

```
node tests.js              # 65 tests, Node built-ins only
python -m http.server      # preview at http://localhost:8000/
```

Browsers block fetching CSVs from `file://`, so always preview over HTTP.

## License

MIT, see `LICENSE`.
