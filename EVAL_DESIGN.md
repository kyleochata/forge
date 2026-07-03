# Forge Eval & Regression Suite — Design

## How the Harness Works

Forge is a Claude Code plugin that automates coding-task execution by delegating to a weak model (haiku) inside a review-fix loop. The harness operates in two phases.

Phase 1 (intent refinement, ticket planning, and user approval) normally runs in the user's Claude Code session. Phase 2 is the automated execution engine: `scripts/ticketRunner.js` processes each ticket by reading only the files declared in the ticket itself, passing them to the weak model with a request for complete new file contents (via `prompts/ticket.txt`), and then running deterministic validation checks. The `scripts/preToolUse.js` verifier enforces that no files are added beyond those declared and that no hallucinated imports are introduced. When the output passes basic validation, a reviewer model evaluates the change against the ticket's acceptance criteria (`prompts/review.txt`). If the reviewer approves, the change is applied immediately. If review fails, the runner feeds the issue back to the weak model and retries; the harness attempts up to 3 fixes, and on the final attempt, escalates to the sonnet alias (per `config.json` reviewerEscalationModel) to ensure quality.

Models are invoked through `scripts/modelRouter.js`. The claude-cli provider spawns `claude -p --output-format json` (reusing the user's existing Claude Code authentication, no API keys required); the ollama provider makes HTTP calls. The router implements retries with exponential backoff and graceful fallback: if a requested model fails, the system tries haiku, then sonnet.

## What the Eval Measures

The core research question is: **Does Forge's scaffolding lift a weak model's performance on small coding tasks?**

The eval compares two arms, both using the same weak model (haiku-4.5):

**Arm A (Direct):** The weak model receives the task prompt and all starter file contents in a single request, with a JSON-changes output protocol (`eval/prompts/direct.txt`). The model's output is parsed, changes are applied, and the task checker runs immediately. There are no retries and no separate review step. This is the "raw" weak-model baseline.

**Arm B (Forge):** The same weak model first plans a set of tickets from the high-level task prompt using `prompts/planner.txt`. Then, `scripts/ticketRunner.js` executes each planned ticket through the full review-fix loop: the weak model outputs a change, a reviewer evaluates it, and if review fails, the weak model retries (up to 3 times total, with final-attempt escalation to sonnet). The sonnet escalation is intentionally kept because it is part of the production harness design; weak-model planning ensures the comparison isolates the scaffolding's value, not a stronger planner's impact.

The eval isolates the effect of structured iteration and review: if Arm B's pass rate is significantly higher, it demonstrates that the harness design materially improves weak-model code quality.

## Task Corpus

The eval task suite is located in `tasks/<id>/`, where each task directory contains:

- **task.json**: metadata including id, category, difficulty level, task prompt, declared files list, and checker configuration.
- **Starter files**: one or more initial file(s) that the model must modify or extend.
- **check.js**: a programmatic validation script, run with `node check.js` inside a sandbox copy of the task directory; exit code 0 indicates pass.

The suite comprises approximately 24 tasks distributed across multiple categories (bugfix, feature, refactor, multifile, and underspec—deliberately vague prompts with lenient checkers) and difficulty levels (easy, medium, hard). Tasks are intentionally small (single- or two-file scope, pure Node.js, no npm dependencies) to keep a full eval run affordable and reproducible.

Checkers are deterministic and run offline: most use plain Node.js assertions, though one task does start a local HTTP server on an ephemeral port. A safety check (`eval/selftest.js`) enforces that every checker fails against the unmodified starter file, ensuring that checkers actually validate the expected changes.

## Runner, Scoring, and Regression Tracking

**Execution:** `eval/runEval.js` orchestrates the eval by running each task across both arms for N repetitions (default 3), with each run in a fresh temporary sandbox. The runner is resumable: if a result JSON already exists in `eval/results/current/runs/`, that run is skipped, allowing long eval campaigns to pause and resume without redundant work. Full transcripts are captured for each run, and token usage is logged via the `FORGE_USAGE_LOG` environment variable hook in `modelRouter.js`; wall-clock execution time is also recorded.

**Scoring:** `eval/score.js` aggregates results and produces a comprehensive report. It calculates pass rates per arm, per category, and per difficulty level; computes the delta (forge pass rate minus direct pass rate) to measure improvement; and tracks per-task repetition variance to assess consistency. Token efficiency and execution time metrics are included. The scorer writes two output files: `eval/report.md` (human-readable markdown summary) and `eval/report.json` (machine-parseable results). When available, it compares results against `eval/baseline.json` to detect regressions.

**Entry Points:**
- `make eval`: Full suite plus report generation (all tasks, default 3 reps per arm).
- `make eval-smoke`: Fast smoke test (6 tasks, 1 rep per arm) for rapid iteration.
- `make selftest`: Offline validation (mocked models, no spend) to verify checker correctness and runner logic.
- `make baseline`: Snapshots the current `eval/report.json` as the new `eval/baseline.json` for future regression detection.

## Assumptions

1. **Environment:** The `claude` CLI is on PATH and authenticated. Model calls consume subscription quota, not API dollars.
2. **Baseline fairness:** A single-shot JSON-changes protocol (Arm A) is the fairest baseline for the weak model. This protocol gives the weak model the same structured output format that Forge itself uses, ensuring that parse failures measure format-following ability, which is part of what the harness design fixes.
3. **Weak-model planning lift:** Arm B's planning phase uses the weak model (not a strong Claude Code session planner). This is an eval-only design choice that isolates the scaffolding's value. In production, Phase 1 planning is typically done by a human or strong model, so real-world lift is likely higher than measured in this eval.
4. **Pass/fail semantics:** Pass or fail is determined solely by the task checker's exit code (0 = pass, any other exit = fail). If a run encounters an error—such as unparseable model output or a runner crash—it counts as a failure for its arm. There is no LLM-as-judge; all evaluation is deterministic.
5. **Checker properties:** Checkers are deterministic and run entirely offline (using plain Node.js asserts and possibly simple file I/O). One task does start a local HTTP server on an ephemeral port for testing purposes, but the server is isolated to the sandbox.
