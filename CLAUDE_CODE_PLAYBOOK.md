# After Forge: A Playbook for Plain Claude Code

**Date:** 2026-07-03
**Input data:** `eval/report.md` (24 tasks × 2 arms × 3 reps, haiku-4.5 both arms)

## Verdict

The eval answered the research question cleanly: Forge's scaffolding does not lift a
weak model's accuracy on small coding tasks. It costs 5.3× more, runs 6× slower, and
scored 2.8 points *worse* than calling the same model directly. The harness was an
overhang — the capability it was built to compensate for is already in the model.

The right response is not "orchestration is bad." It is: **the things Forge did well
(tickets, autonomy, deterministic gates) are UX and process wins that Claude Code
provides natively, and the thing Forge did badly (replacing execution-and-verification
with plan-and-LLM-review) is exactly the part to drop.**

## What the numbers said

| | Pass rate | Avg duration | Cost (72 runs) | Cost / task |
|---|---|---|---|---|
| Direct (one-shot haiku) | 97.2% (70/72) | 11.9s | $0.82 | ~$0.011 |
| Forge (plan → execute → review loop) | 94.4% (68/72) | 70.2s | $4.39 | ~$0.061 |

Post-hoc adjustment: 3 of the 6 total failures were a single harness bug (the
markdown-fence JSON parser, fixed in `scripts/jsonExtract.js`). Replaying the failed
transcripts through the fixed parser gives an adjusted ~71/72 direct vs ~70/72 forge.
**Even with its own bug forgiven, the harness doesn't win** — and the two remaining
forge failures were *reviewer-approved wrong code* (a CSV parser that mishandled quoted
commas, a search ranker that didn't put exact matches first). The review loop's whole
job was to catch those, and it didn't.

Caveat: direct haiku is at 97% — a ceiling effect. The corpus can't detect a harness
that only helps on tasks the model can't already do. But that cuts the other way too:
if the model one-shots the work, every layer between you and the model is pure cost.

## Why the harness lost (mechanisms, not vibes)

1. **The plumbing became the dominant failure mode.** Half of all failures across both
   arms came from the harness's own JSON extraction, not from any model. Every layer of
   glue code between the model and the repo is a new place to fail that didn't exist
   before. This generalizes: an orchestrator has to be *more* reliable than the error
   rate it's trying to fix, and that's a high bar when the model is already at 97%.

2. **LLM review is a weaker verifier than running the code.** A same-strength model
   reviewing diffs against prose acceptance criteria approved semantically wrong
   implementations twice. A 5-line test would have caught both deterministically, for
   free. Review-by-model is a supplement to execution, never a substitute.

3. **Blind handoffs lose context.** Forge's planner saw pasted file contents with no
   tools; the executor saw only the ticket and its declared files. Every handoff
   re-serialized the task into prose, and prose is lossy. The direct arm had one
   context that never lost anything.

4. **Compounding steps compound error rates.** Plan-parse → validate → execute →
   parse → review → parse → apply is a chain of ANDs. Even at 98% per step, seven
   steps is ~87%. The one-shot arm had one step.

5. **The economics inverted.** The premise was "weak model + scaffolding is cheaper
   than a strong model." But the scaffolding multiplied tokens 4.5× (85k → 386k output),
   spawned cold `claude -p` processes that can't share a warm prompt cache, and burned
   retries. Cheap-model savings come from *using the cheap model directly on tasks it
   can handle* — the harness spent the savings on overhead.

## The playbook: getting Forge's wins from plain Claude Code

### 1. Keep the ticket UX — via plan mode, not a pipeline

The decomposition-into-tickets experience was genuinely good. Claude Code has it
built in:

- **Plan mode** (`shift+tab`) gets you the same "review the plan before anything
  executes" gate, with a planner that can actually read the repo and run searches
  instead of planning blind from pasted file contents.
- Ask for the plan **as a checklist with acceptance criteria per item**, and have it
  tracked as a task list (Claude Code's task tools) or committed as `PLAN.md`. You get
  the ticket artifact without the serialization loss — the same context that wrote the
  plan executes it.
- For big features, the durable version is a markdown plan in the repo that survives
  sessions and compactions; tell Claude to check items off as it verifies them.

### 2. Keep the autonomy — via background sessions and permission modes

The "kick it off and walk away" experience is native now:

- **Background sessions / `claude -p`** for headless runs; `--permission-mode
  acceptEdits` (or a tuned allowlist in `.claude/settings.json`) controls how far it
  can go unattended. `/fewer-permission-prompts` builds the allowlist from your history.
- **Worktrees** isolate autonomous runs from your working tree — that's the sandbox
  Forge's `safeResolve` was hand-rolling.
- **`/loop` and scheduled routines** cover the "keep going until done / check back
  later" pattern.
- Subagents run tasks in parallel when the work is actually independent.

### 3. Replace the review loop with executable verification — this is the accuracy lever

Accuracy trumps all, and the single highest-leverage practice in this whole experiment
is: **turn acceptance criteria into runnable checks before or alongside the change,
and make passing them the definition of done.**

- Every eval task had a `check.js`; that checker — not any reviewer — is what actually
  measured correctness. Do the same in real work: ask for the failing test first, then
  the fix. The agentic loop (edit → run → read failure → edit) is where Claude Code
  models earn their accuracy; Forge's protocol amputated it.
- **Hooks are the deterministic gate Forge's `preToolUse.js` wanted to be.** Port the
  good ideas: a PostToolUse hook that lints/typechecks touched files, a Stop hook that
  runs the test suite and refuses "done" on red. Hooks are enforced by the harness, not
  remembered by the model — that's the property Forge's verifier had, without the
  custom runner around it.
- Use **`/code-review` (or the code-reviewer subagent) as a second pass with fresh
  eyes, after tests pass** — review catches design and edge-case issues tests miss,
  but it's a supplement. The eval is the proof: reviewer-approved code failed the
  checker twice; checker-approved code never needed the reviewer.

### 4. Model economics: escalation ladder, not a fixed pipeline

Haiku one-shot 97% of this corpus at a penny a task. The rational policy:

- **Route by task, not by pipeline.** Trivial/mechanical tasks → cheap model directly
  (a haiku subagent, or `/model`). Ambiguous, multi-file, or design-heavy tasks →
  strong model from the start. Don't pay orchestration tax to make a cheap model
  pretend to be a strong one.
- **Escalate on failure, don't pre-review on success.** One retry policy the data
  supports: cheap model attempts with the test in-loop; if red after N minutes, rerun
  the same prompt on the stronger model. That's two steps only when needed, instead of
  seven steps always.
- One warm session beats many cold processes: sequential work in a single session
  reuses the prompt cache; every `claude -p` spawn pays cold input. This alone explains
  a chunk of the 5.3× cost gap.

### 5. Things you may not be thinking about

- **Keep the eval harness — it's the most valuable thing Forge produced.** You now have
  a 144-run harness that can answer "does workflow change X help?" with data for ~$5.
  Before adopting any new workflow (a new hook, a subagent pattern, a prompt), run it
  through `make eval`. Almost nobody measures their tooling; you can.
- **Fix the ceiling before the next experiment.** At 97% direct there's no headroom to
  detect improvement. Add tasks haiku genuinely fails (multi-file features with
  interacting constraints, tasks requiring reading docs/tests to infer behavior), or
  the eval can't distinguish any two workflows. Then `make baseline` for regression
  tracking.
- **Underspecified tasks are where process helps most.** The `underspec` category is
  the one place a "restate the task as acceptance criteria and confirm" step (Forge's
  Phase 1, the part that was never the problem) plausibly pays. Keep that as a habit:
  one clarifying pass before autonomous execution — plan mode does this naturally.
- **Skills encode the workflow so you don't re-prompt it.** The whole loop above —
  plan as checklist, write the check, implement, verify, review — can be a project
  skill or CLAUDE.md section once, instead of per-session prompting.

## On orchestrators: nice in theory — and the theory says when

An orchestrator is attractive because it promises parallelism, specialization, and
cost routing. The eval shows the failure condition: **for sequential tasks that fit in
one context window and one model's capability, orchestration is pure overhead plus new
failure modes.** Handoffs lose context, steps compound error rates, and the glue code
itself becomes the biggest bug surface (it literally was here).

Orchestration starts paying when at least one of these is true:

1. **Real parallelism** — independent workstreams that don't share files (subagents in
   worktrees, N× wall-clock win).
2. **Context exceeds the window** — the task needs more state than one session holds,
   so isolation-with-summaries beats one bloated context (Explore/research subagents
   that return conclusions, not file dumps).
3. **Genuinely different capabilities per role** — cheap fan-out search feeding an
   expensive synthesizer, not same-model-talking-to-itself (Forge's planner, executor,
   and reviewer were all haiku; there was no capability gradient to exploit).
4. **Isolation as a feature** — fresh-eyes review, or exploration too noisy to keep in
   the main context.

The practical conclusion: **Claude Code already ships the orchestrator** — subagents,
background tasks, worktrees, hooks — as capabilities you invoke when a trigger above
appears, at zero plumbing cost. Building a standing pipeline that *always* orchestrates
means paying the overhead on the 97% of tasks that didn't need it to catch the 3% that
might. Reach for orchestration per-task, when the shape of the task demands it, and
keep verification deterministic no matter who does the work.

## One-page summary

| Forge feature | Verdict | Plain Claude Code replacement |
|---|---|---|
| Ticket planning UX | Keep the UX | Plan mode + task checklist / `PLAN.md` |
| Autonomous execution | Keep | Background sessions, `claude -p`, permission modes, worktrees |
| Review-fix loop (LLM reviewer) | Drop | Executable acceptance checks in-loop; `/code-review` after green, not instead of |
| `preToolUse` import/file verifier | Keep the idea | PreToolUse/PostToolUse/Stop hooks running lint + tests |
| Weak-model-everywhere routing | Drop | Route by task difficulty; escalate on failure |
| Model router / retry plumbing | Drop | The CLI/session handles it |
| The eval suite | **Keep — best artifact of the project** | `make eval` before adopting any workflow change |
