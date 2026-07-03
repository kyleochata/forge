'use strict';
// Eval arms: A = the model called directly (one shot), B = the model driven
// through the Forge harness (weak-model planning + ticketRunner review loop).

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { callModel } = require('../../scripts/modelRouter.js');
const { extractJsonObject, extractJsonArray } = require('../../scripts/jsonExtract.js');

function safeResolve(sandboxDir, rel) {
  const abs = path.resolve(sandboxDir, rel);
  if (!abs.startsWith(sandboxDir + path.sep)) {
    throw new Error(`path "${rel}" escapes the sandbox`);
  }
  return abs;
}

function renderFiles(sandboxDir, relPaths) {
  return relPaths
    .map((rel) => {
      const abs = path.join(sandboxDir, rel);
      if (!fs.existsSync(abs)) return `--- FILE: ${rel} (does not exist yet) ---`;
      return `--- FILE: ${rel} ---\n${fs.readFileSync(abs, 'utf8')}\n--- END FILE: ${rel} ---`;
    })
    .join('\n\n');
}

function applyChanges(sandboxDir, changes) {
  for (const change of changes) {
    if (!change || typeof change.file !== 'string' || typeof change.content !== 'string') {
      throw new Error('each change needs a string "file" and string "content"');
    }
    const abs = safeResolve(sandboxDir, change.file);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, change.content);
  }
}

async function runArmA({ task, sandboxDir, repoRoot, modelAlias, config }) {
  const system = fs.readFileSync(path.join(repoRoot, 'eval', 'prompts', 'direct.txt'), 'utf8');
  const prompt = `TASK:\n${task.prompt}\n\nCURRENT FILE CONTENTS:\n${renderFiles(sandboxDir, task.files)}`;
  const transcript = [{ kind: 'system', text: system }, { kind: 'prompt', text: prompt }];
  try {
    const result = await callModel(modelAlias, { system, prompt, config });
    transcript.push({ kind: 'response', text: result.text, answeredBy: result.alias });
    const parsed = extractJsonObject(result.text);
    if (!Array.isArray(parsed.changes) || parsed.changes.length === 0) {
      throw new Error('response has no non-empty "changes" array');
    }
    applyChanges(sandboxDir, parsed.changes);
    return { ok: true, error: null, transcript };
  } catch (err) {
    // One shot, no retries — that is the point of the baseline.
    return { ok: false, error: String(err.message), transcript };
  }
}

function validateTickets(tickets, sandboxDir) {
  if (!Array.isArray(tickets) || tickets.length === 0) return 'output is not a non-empty JSON array of tickets';
  for (const t of tickets) {
    for (const field of ['id', 'title', 'description']) {
      if (typeof t[field] !== 'string' || t[field].trim() === '') {
        return `a ticket is missing a non-empty string "${field}"`;
      }
    }
    if (!Array.isArray(t.files) || t.files.length === 0) return `ticket ${t.id} needs a non-empty "files" array`;
    if (!Array.isArray(t.acceptanceCriteria) || t.acceptanceCriteria.length === 0) {
      return `ticket ${t.id} needs a non-empty "acceptanceCriteria" array`;
    }
    for (const rel of t.files) {
      try {
        safeResolve(sandboxDir, rel);
      } catch (err) {
        return `ticket ${t.id}: ${err.message}`;
      }
    }
  }
  return null;
}

async function runArmB({ task, sandboxDir, repoRoot, modelAlias, config }) {
  const plannerSystem = fs.readFileSync(path.join(repoRoot, 'prompts', 'planner.txt'), 'utf8');
  const basePrompt = `TASK:\n${task.prompt}\n\nCURRENT FILE CONTENTS:\n${renderFiles(sandboxDir, task.files)}\n\nPlan tickets to complete this task in this project. You cannot read any other files or use any tools — plan ONLY from the file contents shown above. The executor will see only each ticket and its declared files. Output ONLY the JSON array of tickets.`;
  const transcript = [];

  let tickets = null;
  let planAttempts = 0;
  let reason = null;
  for (let attempt = 1; attempt <= 2 && !tickets; attempt++) {
    planAttempts = attempt;
    const prompt = attempt === 1
      ? basePrompt
      : `${basePrompt}\n\nYOUR PREVIOUS OUTPUT WAS REJECTED: ${reason}. Output ONLY a valid JSON array of tickets.`;
    transcript.push({ kind: 'plan-prompt', text: prompt });
    try {
      const result = await callModel(modelAlias, { system: plannerSystem, prompt, config });
      transcript.push({ kind: 'plan-response', text: result.text, answeredBy: result.alias });
      const parsed = extractJsonArray(result.text);
      reason = validateTickets(parsed, sandboxDir);
      if (!reason) tickets = parsed;
    } catch (err) {
      reason = String(err.message);
      transcript.push({ kind: 'plan-error', text: reason });
    }
  }
  if (!tickets) {
    return { ok: false, error: `plan-unparseable: ${reason}`, transcript, runnerExitCode: null, planAttempts };
  }

  fs.writeFileSync(path.join(sandboxDir, 'tickets.json'), JSON.stringify(tickets, null, 2));

  const res = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'ticketRunner.js'), 'tickets.json', '--model', modelAlias], {
    cwd: sandboxDir,
    encoding: 'utf8',
    timeout: 900000,
    env: { ...process.env },
  });
  transcript.push({ kind: 'runner-stdout', text: res.stdout || '' });
  transcript.push({ kind: 'runner-stderr', text: res.stderr || '' });

  const forgeLogsDir = path.join(sandboxDir, '.forge', 'logs');
  if (fs.existsSync(forgeLogsDir)) {
    for (const name of fs.readdirSync(forgeLogsDir)) {
      if (name.endsWith('.jsonl')) {
        transcript.push({ kind: 'forge-log', file: name, text: fs.readFileSync(path.join(forgeLogsDir, name), 'utf8') });
      }
    }
  }

  // Even on runner escalation (non-zero status) the checker decides pass/fail.
  return { ok: true, error: null, transcript, runnerExitCode: res.status, planAttempts };
}

module.exports = { runArmA, runArmB };
