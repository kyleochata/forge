---
description: Delegate a coding task to a cheaper model inside a review-fix loop (plan here, execute autonomously)
argument-hint: "<task>" [--model haiku|sonnet|local]
---

# /forge — delegated execution

The user wants this task executed by a cheaper model: **$ARGUMENTS**

Parse the arguments: everything except a trailing `--model <alias>` flag is the
task description. If `--model` is absent, use the `defaultModel` from
`${CLAUDE_PLUGIN_ROOT}/config.json` (default: `haiku`).

You (Claude Code) do Phase 1 — strategy — in this conversation. The cheap model
does Phase 2 — execution — via a script. Do NOT implement the task yourself.

## Phase 1 — Conversational (you, now)

### Step 1: Refine intent

Read `${CLAUDE_PLUGIN_ROOT}/prompts/intent.txt` and follow it against the task
description and the current repository. Explore the codebase as needed.

If the intent has genuine UNKNOWNS, ask the user up to 3 specific clarifying
questions and STOP until they answer. Never assume implementation details.

### Step 2: Plan tickets

Read `${CLAUDE_PLUGIN_ROOT}/prompts/planner.txt` and follow it to produce the
ticket JSON array. Read the real files first — every file path, pattern, and
API in a ticket must exist. Remember: the executor sees ONLY the ticket text
plus the declared files, so ticket descriptions must be self-contained.

Write the array to `.forge/tickets.json` in the repository root (create the
`.forge/` directory if needed).

### Step 3: Get approval

Show the user the plan as a readable summary (ticket titles, files touched,
acceptance criteria) and ask for explicit approval. STOP and wait. Do not
start Phase 2 until the user clearly approves in conversation. If they request
changes, revise `.forge/tickets.json` and ask again.

## Phase 2 — Autonomous (on approval only)

Run the ticket runner via Bash from the repository root:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/ticketRunner.js .forge/tickets.json --model <alias>
```

Use a timeout of at least 10 minutes. The runner needs no further interaction:
it executes tickets sequentially with the weak model, self-reviews each
attempt, retries up to 3 times per ticket (escalating the reviewer to sonnet
before the final attempt), applies passing changes to the working tree, and
logs every attempt to `.forge/logs/<run>.jsonl`.

## Afterwards

- Relay the runner's per-ticket results to the user.
- If the runner exits non-zero with an `ESCALATION` block, a ticket failed 3
  attempts. The block contains the ticket, the last proposed changes, and the
  reviewer's issues. Take over that ticket yourself: fix it directly with
  minimal changes, then continue any remaining tickets by re-running the
  runner with `--start-at <ticket-id>`.
- Suggest the user review the diff (`git diff`) before committing. Do not
  commit unless asked.
