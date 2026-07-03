# Forge eval report

Generated: 2026-07-03T21:24:06.656Z
Model: haiku
Repetitions: 3

## Summary

| | Runs | Passes | Pass rate | Avg duration | Input tokens | Output tokens | Cost (USD) |
|---|---|---|---|---|---|---|---|
| direct | 72 | 70 | 97.22% | 11.9s | 648 | 85295 | $0.8212 |
| forge | 72 | 68 | 94.44% | 70.2s | 5780 | 386166 | $4.3903 |

**Delta (forge - direct): -2.8 pp**

> The harness shows NO measurable improvement in this run. This is reported honestly, not massaged. Plausible causes: weak-model planning produced bad tickets; the review loop rejected working changes; tasks too easy (ceiling) or too hard (floor) to differentiate; N too small — check the variance section.

## By category

| Category | Direct | Forge | Delta (pp) |
|---|---|---|---|
| bugfix | 94.44% | 94.44% | 0.0 |
| feature | 100.00% | 88.89% | -11.1 |
| multifile | 100.00% | 100.00% | 0.0 |
| refactor | 100.00% | 100.00% | 0.0 |
| underspec | 91.67% | 91.67% | 0.0 |

## By difficulty

| Difficulty | Direct | Forge | Delta (pp) |
|---|---|---|---|
| medium | 100.00% | 92.31% | -7.7 |
| hard | 100.00% | 93.33% | -6.7 |
| easy | 88.89% | 100.00% | 11.1 |

## Per task

| Task | Category | Difficulty | Direct | Forge |
|---|---|---|---|---|
| bugfix-async-loop | bugfix | medium | 3/3 | 2/3* |
| bugfix-deep-get | bugfix | hard | 3/3 | 3/3 |
| bugfix-mutation | bugfix | medium | 3/3 | 3/3 |
| bugfix-null-check | bugfix | easy | 3/3 | 3/3 |
| bugfix-off-by-one | bugfix | easy | 2/3* | 3/3 |
| bugfix-slugify | bugfix | medium | 3/3 | 3/3 |
| feature-cli-json | feature | easy | 3/3 | 3/3 |
| feature-csv-parse | feature | medium | 3/3 | 2/3* |
| feature-emitter | feature | hard | 3/3 | 2/3* |
| feature-lru | feature | medium | 3/3 | 3/3 |
| feature-retry | feature | medium | 3/3 | 3/3 |
| feature-stats | feature | easy | 3/3 | 3/3 |
| multifile-http-health | multifile | hard | 3/3 | 3/3 |
| multifile-logger-config | multifile | medium | 3/3 | 3/3 |
| multifile-split-utils | multifile | medium | 3/3 | 3/3 |
| multifile-validators | multifile | medium | 3/3 | 3/3 |
| refactor-dedupe-format | refactor | medium | 3/3 | 3/3 |
| refactor-extract-validate | refactor | easy | 3/3 | 3/3 |
| refactor-id-factory | refactor | hard | 3/3 | 3/3 |
| refactor-promisify | refactor | medium | 3/3 | 3/3 |
| underspec-email | underspec | easy | 2/3* | 3/3 |
| underspec-money | underspec | medium | 3/3 | 3/3 |
| underspec-robust-parse | underspec | hard | 3/3 | 3/3 |
| underspec-search-rank | underspec | medium | 3/3 | 2/3* |

*Mixed results: passed on some repetitions and failed on others in the same arm.

## Variance

Tasks with mixed results: bugfix-async-loop, bugfix-off-by-one, feature-csv-parse, feature-emitter, underspec-email, underspec-search-rank

Tasks listed here passed on some repetitions and failed on others in the same arm; treat their per-task deltas as noise.

## Tokens & time

- direct: 648 input, 85295 output, 11.9s avg
- forge: 5780 input, 386166 output, 70.2s avg

## Regressions vs baseline

No baseline saved yet. Run `make baseline` after a good run to enable regression tracking.
