# Game Night Treasury

A static leaderboard for a weekly board game evening among friends. HTML, CSS,
vanilla JavaScript and four CSV files; every number is computed in the browser
on every visit. No build step, no dependencies, no external requests. The one
prize is snacks, bought by the host for each season's champion.

Live site: https://jscarlatas.github.io/game-night-treasury/

Players appear under nicknames and gem IDs only. Real names never enter this
repository: not in data, code, comments, commit messages, or issues.

## The rules, one sentence each

- **Season:** two calendar months starting on every odd month; Season 1 runs from 1 November to 31 December 2026.
- **Payout:** thirty-five for playing and thirty split by how many opponents you finished above, with no extra points for the win.
- **Points:** a result earns the game's weight times the payout divided by 100, rounded half up to one decimal.
- **Seat fee:** every seat in every game pays 49% of the game's weight, rounded the same way.
- **Season board:** you start on 100, add what you earned and subtract your seat fees; the highest total among players with five games wins the snacks.
- **Qualifying:** five games in the season qualify you for the title; below that you stay on the board under a line.
- **Season champion:** an exact tie is broken by most wins in the season, then the highest weight among games won, then most games played, then highest performance at season end, then the gem name alphabetically.
- **Treasury:** the season's seat fees add up to a treasury the champion claims in the Hall of Snacks; it is ceremony and never changes a score.
- **Most games:** whoever played the most games in the season gets the honour in the Hall of Snacks, shared on a tie.
- **Performance:** your average placement score, weighted by game, after adding ten phantom Dune games at the group's average.
- **Placement score:** ten for playing, thirty for the win, sixty split by how many opponents you finished above; it prices the Performance board and the monthly boards.
- **Monthly boards:** September and October 2026 stay as played: placement-score points, no seat fee, and their own winners under the same tiebreak chain.
- **Wins board:** most wins first; equal wins are ordered by the summed weight of the games won.
- **Ties inside a game:** tied seats take the higher place and the next place is skipped (1, 2, 2, 4); a tie for first is a full win for everyone in it.
- **Shared seat or team:** one seat, written `a+b`; every member gets the seat's full score and pays a full seat fee, a win if it placed first, and one game played, and the seat counts as one opponent for everyone else.
- **Seat count:** `n` is the number of seats in the game, so a two-seat win pays the same as a six-seat win and a six-seat second place beats a four-seat second place.
- **Weights over time:** a weight change starts on the first day of a season and never changes points already awarded; a new game may start on the 1st of any month.
- **Boards and ties:** ranks are shared on every board (1, 2, 2, 4); only the champion and the monthly winners are fully resolved.
- **Departed players:** results stay, because removing them would change `n` for everyone else; on request the nickname becomes the capitalised gem name.
- **Old scores:** `FLOOR`, `SPREAD`, `BONUS` and `K` in `scoring.js` are frozen, so a played month never changes.
- **Rules over time:** `SEASON_RULES` in `scoring.js` can change between seasons by adding a row dated to a season's first day, and never during one.

### Season payouts

`payout(n, p) = 35 + 30 × (n − p) / (n − 1)`, and every seat pays 49.

| n | 1st | 2nd | 3rd | 4th | 5th | 6th | 7th |
|---|---|---|---|---|---|---|---|
| 2 | 65 | 35 | | | | | |
| 3 | 65 | 50 | 35 | | | | |
| 4 | 65 | 55 | 45 | 35 | | | |
| 5 | 65 | 57.5 | 50 | 42.5 | 35 | | |
| 6 | 65 | 59 | 53 | 47 | 41 | 35 | |
| 7 | 65 | 60 | 55 | 50 | 45 | 40 | 35 |

These are for a weight of 100, so a four-seat Dune nets +16, +6, −4 and −14
after the fee. Game pages show what each seat earned, and the fee stays one line
in a player's details. A fee in the 45 to 50 range is what keeps attendance from
deciding a season: the average seat should net close to zero, and the fee is the
dial if a later season needs more or less of that.

### Placement ladder

Prices the Performance board and the monthly boards of September and October
2026.

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

A weight is the size of a game's stakes: payouts and seat fees both scale with
it. Dune is the reference at 100. The criterion for a new game is how much the game is the point of the evening:
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

Weight changes: add a `data/games.csv` row with `from` equal to the first day of
the next season, committed before any result of that season. A `from` that is
not the 1st, or a change inside a season, is rejected.

Rule changes: add a row to `SEASON_RULES` in `scoring.js` with `from` equal to the
first day of the next season. Rows are not edited once their season has results.

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
- a game with a non-integer weight, a `from` that is not the 1st, or a weight
  change that does not start on a season's first day;
- a result with an unknown game, an unknown player ID, an invalid or future
  date, or a date before the game's first `from`;
- an instance with fewer than two seats, a player in two seats, or places that
  break competition ranking.

## Site

Single page with hash routes, every route shareable:

- `#/` current season, `#/season/<n>` any season
- `#/month/YYYY-MM` the monthly boards of September and October 2026; a month
  from November 2026 on opens its season
- `#/night` the latest game night, `#/night/YYYY-MM-DD` any night
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
node tests.js              # 91 tests, Node built-ins only
python -m http.server      # preview at http://localhost:8000/
```

Browsers block fetching CSVs from `file://`, so always preview over HTTP.

## License

MIT, see `LICENSE`.
