# Forge eval & regression suite

Two-arm comparison measuring whether the Forge harness lifts a weak model on
small coding tasks. Arm **direct** gives the model (default: the `haiku`
alias, claude-haiku-4-5) the task in one shot; arm **forge** drives the same
model through weak-model ticket planning plus the ticketRunner review-fix
loop. See `../EVAL_DESIGN.md` for the full rationale and assumptions.

## Commands

| Command | What it does |
|---|---|
| `make eval` | Full suite: every task × 2 arms × 3 reps, then writes the report. |
| `make eval-smoke` | Quick subset: 6 tasks × 1 rep into `eval/results/smoke`, report at `eval/report-smoke.*`. |
| `make baseline` | Snapshots `eval/report.json` as `eval/baseline.json` for regression tracking. |
| `make selftest` | Offline plumbing check with mocked models — validates the corpus and pipeline, zero spend. |

Runs are **resumable**: rerunning `make eval` skips any run whose result JSON
already exists in `eval/results/current/runs/`. To start over, run
`node eval/runEval.js --fresh`.

## Layout

| Path | What it is |
|---|---|
| `tasks/<id>/` | one eval task: `task.json` (metadata + prompt), starter file(s), `check.js` |
| `eval/results/current/runs/` | one JSON result per task × arm × rep |
| `eval/results/current/transcripts/` | full prompt/response transcripts per run (JSONL) |
| `eval/results/current/usage/` | per-run token/cost lines from `FORGE_USAGE_LOG` |
| `eval/report.md`, `eval/report.json` | scored report (pass rates, deltas, variance, regressions) |
| `eval/baseline.json` | committed regression baseline (compare target) |

## Adding a task

Create `tasks/<id>/` with:

1. `task.json` — `{ id, category, difficulty, prompt, files, checker }`.
   `id` must equal the directory name; `category` is one of `bugfix`,
   `feature`, `refactor`, `multifile`, `underspec`; `difficulty` is `easy`,
   `medium`, or `hard`; `files` lists the starter files; `checker` is
   `node check.js`.
2. The starter file(s) named in `files`.
3. `check.js` — programmatic checker, run with `node check.js` inside a
   sandbox copy of the task; exit 0 = pass. It MUST fail against the
   unmodified starter (`make selftest` enforces this — a checker that passes
   on the starter is vacuous).

## Cost note

A full `make eval` makes several hundred haiku calls through the `claude`
CLI (each arm-B run is a plan call plus execute/review calls per ticket,
times retries). This burns your Claude subscription quota — use
`make eval-smoke` while iterating.
