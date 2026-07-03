# Forge eval report

Generated: 2026-07-03T19:42:36.262Z
Model: haiku
Repetitions: 1

## Summary

| | Runs | Passes | Pass rate | Avg duration | Input tokens | Output tokens | Cost (USD) |
|---|---|---|---|---|---|---|---|
| direct | 6 | 6 | 100.00% | 8.5s | 54 | 6311 | $0.0924 |
| forge | 6 | 6 | 100.00% | 51.8s | 72 | 11569 | $0.1446 |

**Delta (forge - direct): 0.0 pp**

> The harness shows NO measurable improvement in this run. This is reported honestly, not massaged. Plausible causes: weak-model planning produced bad tickets; the review loop rejected working changes; tasks too easy (ceiling) or too hard (floor) to differentiate; N too small — check the variance section.

## By category

| Category | Direct | Forge | Delta (pp) |
|---|---|---|---|
| bugfix | 100.00% | 100.00% | 0.0 |
| feature | 100.00% | 100.00% | 0.0 |
| multifile | 100.00% | 100.00% | 0.0 |
| refactor | 100.00% | 100.00% | 0.0 |
| underspec | 100.00% | 100.00% | 0.0 |

## By difficulty

| Difficulty | Direct | Forge | Delta (pp) |
|---|---|---|---|
| easy | 100.00% | 100.00% | 0.0 |
| medium | 100.00% | 100.00% | 0.0 |

## Per task

| Task | Category | Difficulty | Direct | Forge |
|---|---|---|---|---|
| bugfix-off-by-one | bugfix | easy | 1/1 | 1/1 |
| feature-cli-json | feature | easy | 1/1 | 1/1 |
| feature-lru | feature | medium | 1/1 | 1/1 |
| multifile-split-utils | multifile | medium | 1/1 | 1/1 |
| refactor-extract-validate | refactor | easy | 1/1 | 1/1 |
| underspec-email | underspec | easy | 1/1 | 1/1 |

*Mixed results: passed on some repetitions and failed on others in the same arm.

## Variance

No task showed mixed results across repetitions.

Tasks listed here passed on some repetitions and failed on others in the same arm; treat their per-task deltas as noise.

## Tokens & time

- direct: 54 input, 6311 output, 8.5s avg
- forge: 72 input, 11569 output, 51.8s avg

## Regressions vs baseline

No baseline saved yet. Run `make baseline` after a good run to enable regression tracking.
