# Forge

A Claude Code plugin that makes weaker models (Haiku, local Ollama models)
produce coding output comparable to frontier models. Strategy work — intent
refinement, planning, approval — stays with Claude Code in your session.
Execution is delegated to a cheaper model inside an automated review-fix loop.

Verified against Claude Code **2.1.198**.

## How it works

```
/forge "add a /health endpoint" --model haiku
│
├── Phase 1 (Claude Code, conversational)
│   1. Refine intent          — asks up to 3 clarifying questions if ambiguous
│   2. Plan ordered tickets   — each: title, description, files, acceptance criteria
│   3. Wait for your approval — nothing runs until you say go
│
└── Phase 2 (autonomous, scripts/ticketRunner.js)
    for each ticket (max 3 attempts):
      read ONLY the ticket's declared files
      execute with the weak model        (prompts/ticket.txt)
      review with the reviewer model     (prompts/review.txt)
      PASS → apply change, next ticket
      FAIL → feed review issues back, retry
             (final attempt is reviewed by sonnet)
    3 failures → stop, escalate to Claude Code with full context
```

A deterministic `PreToolUse` hook (no LLM calls) additionally blocks any file
write outside the active ticket's declared file list and any code containing
imports that don't exist in `package.json`, `node_modules`, or the repo. The
same import check runs inside the ticket runner before any change is applied.

## Install

Requires Node.js (any recent version; no npm dependencies) and the `claude` CLI
on PATH. Model calls reuse your existing Claude Code auth — no API keys.

Claude Code auto-loads plugins from `~/.claude/skills/`, so link this repo
there:

```bash
git clone <this-repo> ~/Documents/forge        # or wherever you keep it
ln -s ~/Documents/forge ~/.claude/skills/forge
```

Restart Claude Code (or run `/reload-plugins`). The plugin loads as
`forge@skills-dir`; `/forge` and the PreToolUse hook are then active.

> Note: this plugin's spec originally called for `~/.claude/plugins/forge/`.
> In Claude Code 2.1.x, `~/.claude/plugins/` is managed by the marketplace
> installer (`cache/`, `installed_plugins.json`) — the supported location for
> a local, unpackaged plugin is `~/.claude/skills/<name>/`, which is what
> `claude plugin init` itself uses.

For local models, install [Ollama](https://ollama.com), then:

```bash
ollama serve
ollama pull llama3
```

## Usage

```
/forge "<task>" [--model haiku|sonnet|local]
```

Examples:

```
/forge "add a /health endpoint returning {status:'ok'}"
/forge "add dark mode toggle to the settings page" --model local
```

Claude Code will show you the ticket plan and wait for approval before
anything executes. Per-ticket progress prints as it runs:

```
[1/2] Add /health route... ✓
[2/2] Register route in app.js... ✓
```

You can also drive the runner directly (e.g. to resume after an escalation):

```bash
node ~/.claude/skills/forge/scripts/ticketRunner.js .forge/tickets.json \
  --model haiku --start-at T2
```

### Artifacts in your project

| Path | What it is |
|---|---|
| `.forge/tickets.json` | the approved plan (written by Phase 1) |
| `.forge/current-ticket.json` | active ticket marker; enforced by the hook |
| `.forge/logs/run-*.jsonl` | one line per ticket attempt |
| `.forge/logs/hook-warnings.log` | hook fail-open warnings, if any |

Each JSONL line: `{ ts, ticket, attempt, model, reviewer, result, issues }`
where `result` is `PASS`, `FAIL`, or `ERROR` (model/provider failure).

Add `.forge/` to your project's `.gitignore` if you don't want to commit run
artifacts.

## Configuration (`config.json`)

```json
{
  "defaultModel": "haiku",
  "maxRetries": 3,
  "reviewerEscalationModel": "sonnet",
  "models": {
    "haiku":  { "provider": "claude-cli", "model": "claude-haiku-4-5" },
    "sonnet": { "provider": "claude-cli", "model": "claude-sonnet-5" },
    "local":  { "provider": "ollama", "model": "llama3",
                "endpoint": "http://localhost:11434" }
  }
}
```

| Field | Meaning |
|---|---|
| `defaultModel` | Model alias used when `/forge` is called without `--model`. |
| `maxRetries` | Attempts per ticket in the review-fix loop, and retry count per model inside the router. Default 3. |
| `reviewerEscalationModel` | Alias that reviews the final attempt after two failures. Default `sonnet`. |
| `models.<alias>.provider` | `claude-cli` (spawns `claude -p`, reuses your login) or `ollama` (HTTP). |
| `models.<alias>.model` | Real model ID passed to the provider. Verified working IDs as of 2026-07: `claude-haiku-4-5`, `claude-sonnet-5`. For Ollama, the pulled model name (e.g. `llama3`). |
| `models.<alias>.endpoint` | Ollama only. Base URL, default `http://localhost:11434`. |

Aliases are free-form: add `"mini": { "provider": "ollama", "model": "qwen2.5-coder:7b", "endpoint": "..." }`
and use `--model mini`.

### Failure behavior

- Router retries each model `maxRetries` times with exponential backoff
  (500ms, 1s, 2s), then falls back along the chain
  **requested model → haiku → sonnet**.
- Unreachable Ollama, unknown model IDs, and malformed config produce
  actionable one-line errors (what broke, how to fix it) — never stack-trace
  crashes. An unknown *alias* fails immediately (it's a config typo, not a
  transient error).
- If the hook itself errors, it **fails open**: the write is allowed and the
  error is logged to `.forge/logs/hook-warnings.log`. The hook never blocks a
  session due to its own bugs.
- After 3 failed attempts on a ticket the runner exits 1 with an `ESCALATION`
  JSON block (ticket, last proposed changes, reviewer issues, resume command)
  that Claude Code uses to take over.

## Smoke test

```bash
cd <any scratch dir>
node ~/.claude/skills/forge/scripts/smokeTest.js
```

Runs entirely offline with mocked model responses. It verifies that:
1. a trivial ticket flows end-to-end (execute → review → PASS → file applied),
2. every attempt lands in the JSONL log,
3. the PreToolUse hook blocks a write containing a hallucinated import
   (and allows a legitimate one),
4. an unreachable Ollama endpoint produces a clear error and the router
   falls back to the next model in the chain.

## Layout

```
.claude-plugin/plugin.json   plugin manifest
commands/forge.md            /forge slash command (Phase 1 instructions)
hooks/hooks.json             PreToolUse hook registration
scripts/preToolUse.js        deterministic tool-use guard
scripts/ticketRunner.js      autonomous execution loop (Phase 2)
scripts/modelRouter.js       alias → provider routing, retries, fallback
scripts/smokeTest.js         offline end-to-end sanity check
prompts/*.txt                system prompts (intent, planner, ticket, review)
config.json                  models and loop settings
```
