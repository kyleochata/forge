'use strict';
// Forge autonomous ticket runner (Phase 2).
// Executes tickets sequentially with a weak model inside a review-fix loop:
//   execute -> review -> PASS: apply / FAIL: feed issues back, retry (max 3).
// The reviewer is the execution model, escalated to sonnet for the final
// attempt after two failures. Three failures stop the run and print an
// ESCALATION block for Claude Code to take over.
//
// Usage: node ticketRunner.js <tickets.json> [--model <alias>] [--start-at <ticketId>] [--config <path>]

const fs = require('fs');
const path = require('path');
const { callModel, loadConfig } = require('./modelRouter');
const { verifyImports } = require('./preToolUse');
const { extractJsonObject } = require('./jsonExtract');

const PROMPTS_DIR = path.join(__dirname, '..', 'prompts');

function readPrompt(name) {
  return fs.readFileSync(path.join(PROMPTS_DIR, name), 'utf8');
}

function parseArgs(argv) {
  const args = { ticketsFile: null, model: null, startAt: null, configPath: null };
  const rest = [...argv];
  while (rest.length) {
    const a = rest.shift();
    if (a === '--model') args.model = rest.shift();
    else if (a === '--start-at') args.startAt = rest.shift();
    else if (a === '--config') args.configPath = rest.shift();
    else if (!args.ticketsFile) args.ticketsFile = a;
    else throw new Error(`Unexpected argument: ${a}`);
  }
  if (!args.ticketsFile) {
    throw new Error('Usage: node ticketRunner.js <tickets.json> [--model <alias>] [--start-at <ticketId>]');
  }
  return args;
}

function loadTickets(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read tickets file ${file}: ${err.message}`);
  }
  let tickets;
  try {
    tickets = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Tickets file ${file} is not valid JSON: ${err.message}`);
  }
  if (!Array.isArray(tickets) || tickets.length === 0) {
    throw new Error(`Tickets file ${file} must be a non-empty JSON array of tickets.`);
  }
  tickets.forEach((t, i) => {
    for (const field of ['id', 'title', 'description', 'files', 'acceptanceCriteria']) {
      if (!t[field]) throw new Error(`Ticket ${i} (${t.id || 'no id'}) is missing required field "${field}".`);
    }
    if (!Array.isArray(t.files) || t.files.length === 0) {
      throw new Error(`Ticket ${t.id} must declare a non-empty "files" array.`);
    }
  });
  return tickets;
}


function safeResolve(cwd, rel) {
  const abs = path.resolve(cwd, rel);
  if (!abs.startsWith(cwd + path.sep)) {
    throw new Error(`Ticket file path "${rel}" escapes the repository root — refusing to write it.`);
  }
  return abs;
}

function readTicketFiles(cwd, ticket) {
  const contents = {};
  for (const rel of ticket.files) {
    const abs = safeResolve(cwd, rel);
    contents[rel] = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null; // null = new file
  }
  return contents;
}

function renderFiles(contents) {
  return Object.entries(contents)
    .map(([rel, body]) => (body === null
      ? `--- FILE: ${rel} (does not exist yet — you may create it) ---`
      : `--- FILE: ${rel} ---\n${body}\n--- END FILE: ${rel} ---`))
    .join('\n\n');
}

function buildExecutionPrompt(cwd, ticket, contents, priorIssues) {
  const pkgPath = path.join(cwd, 'package.json');
  const pkg = fs.existsSync(pkgPath) ? fs.readFileSync(pkgPath, 'utf8') : null;
  const parts = [
    `TICKET:\n${JSON.stringify(ticket, null, 2)}`,
    pkg ? `PROJECT package.json (context only — do NOT modify unless declared in the ticket):\n${pkg}` : 'This project has no package.json.',
    `CURRENT FILE CONTENTS:\n${renderFiles(contents)}`,
  ];
  if (priorIssues && priorIssues.length) {
    parts.push(`YOUR PREVIOUS ATTEMPT FAILED REVIEW. Fix exactly these issues:\n${priorIssues.map((i) => `- ${i}`).join('\n')}`);
  }
  return parts.join('\n\n');
}

function buildReviewPrompt(ticket, originals, changes) {
  const proposed = changes.map((c) => `--- PROPOSED: ${c.file} ---\n${c.content}\n--- END PROPOSED: ${c.file} ---`).join('\n\n');
  return [
    `TICKET:\n${JSON.stringify(ticket, null, 2)}`,
    `ORIGINAL FILE CONTENTS:\n${renderFiles(originals)}`,
    `PROPOSED NEW CONTENTS:\n${proposed}`,
  ].join('\n\n');
}

// Deterministic checks on the model's proposed changes, mirroring the
// PreToolUse hook (the runner writes via fs, so the hook can't intercept it).
function deterministicIssues(cwd, ticket, parsed) {
  const issues = [];
  if (!Array.isArray(parsed.changes)) {
    return ['Response JSON must have a "changes" array.'];
  }
  if (parsed.changes.length === 0) {
    return [`Executor returned no changes. Notes: ${parsed.notes || '(none)'}`];
  }
  for (const change of parsed.changes) {
    if (!change.file || typeof change.content !== 'string') {
      issues.push('Each change needs "file" and string "content".');
      continue;
    }
    if (!ticket.files.includes(change.file)) {
      issues.push(`Change touches "${change.file}" which is not in the ticket's declared files [${ticket.files.join(', ')}]. Only touch declared files.`);
    }
    const importCheck = verifyImports(change.content, change.file, cwd, { plannedFiles: ticket.files });
    for (const missing of importCheck.missing) {
      issues.push(`"${change.file}" imports "${missing}" which does not exist in package.json, node_modules, or the repo. Do not invent imports.`);
    }
  }
  return issues;
}

function applyChanges(cwd, changes) {
  for (const change of changes) {
    const abs = safeResolve(cwd, change.file);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, change.content);
  }
}

async function runTicket({ cwd, ticket, index, total, modelAlias, config, configPath, logLine, currentTicketFile }) {
  const ticketSystem = readPrompt('ticket.txt');
  const reviewSystem = readPrompt('review.txt');
  const maxAttempts = config.maxRetries || 3;
  const escalationReviewer = config.reviewerEscalationModel || 'sonnet';

  fs.writeFileSync(currentTicketFile, JSON.stringify({ id: ticket.id, files: ticket.files, startedAt: new Date().toISOString() }, null, 2));
  process.stdout.write(`[${index + 1}/${total}] ${ticket.title}... `);

  let priorIssues = null;
  let lastParsed = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // After the 2nd failure, the final attempt is reviewed by the escalation model.
    const reviewerAlias = attempt === maxAttempts && maxAttempts > 1 ? escalationReviewer : modelAlias;
    const originals = readTicketFiles(cwd, ticket);
    const record = { ts: new Date().toISOString(), ticket: ticket.id, attempt, model: modelAlias, reviewer: reviewerAlias, result: null, issues: [] };

    try {
      const exec = await callModel(modelAlias, {
        system: ticketSystem,
        prompt: buildExecutionPrompt(cwd, ticket, originals, priorIssues),
        config, configPath,
      });
      record.model = exec.alias; // records the model that actually answered (may be a fallback)

      let parsed;
      try {
        parsed = extractJsonObject(exec.text);
      } catch (err) {
        record.result = 'FAIL';
        record.issues = [`Executor output was not valid JSON (${err.message}). Respond with only the JSON object described in your instructions.`];
        logLine(record);
        priorIssues = record.issues;
        continue;
      }
      lastParsed = parsed;

      const hardIssues = deterministicIssues(cwd, ticket, parsed);
      if (hardIssues.length) {
        record.result = 'FAIL';
        record.issues = hardIssues;
        logLine(record);
        priorIssues = hardIssues;
        continue;
      }

      const review = await callModel(reviewerAlias, {
        system: reviewSystem,
        prompt: buildReviewPrompt(ticket, originals, parsed.changes),
        config, configPath,
      });
      record.reviewer = review.alias;

      let verdict;
      try {
        verdict = extractJsonObject(review.text);
      } catch (err) {
        verdict = { verdict: 'FAIL', issues: [`Reviewer output was not valid JSON (${err.message}).`] };
      }

      if (String(verdict.verdict).toUpperCase() === 'PASS') {
        applyChanges(cwd, parsed.changes);
        record.result = 'PASS';
        logLine(record);
        process.stdout.write('✓\n');
        return { ok: true, ticket: ticket.id, attempts: attempt };
      }

      record.result = 'FAIL';
      record.issues = Array.isArray(verdict.issues) && verdict.issues.length ? verdict.issues : ['Reviewer failed the change without specific issues.'];
      logLine(record);
      priorIssues = record.issues;
    } catch (err) {
      // Model/router failure (all fallbacks exhausted) — burn the attempt and log it.
      record.result = 'ERROR';
      record.issues = [err.message];
      logLine(record);
      priorIssues = record.issues;
    }
  }

  process.stdout.write('✗\n');
  return { ok: false, ticket: ticket.id, attempts: maxAttempts, lastIssues: priorIssues || [], lastChanges: lastParsed ? lastParsed.changes : null };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const config = loadConfig(args.configPath);
  const modelAlias = args.model || config.defaultModel || 'haiku';
  const tickets = loadTickets(args.ticketsFile);

  let queue = tickets;
  if (args.startAt) {
    const idx = tickets.findIndex((t) => t.id === args.startAt);
    if (idx === -1) throw new Error(`--start-at ${args.startAt}: no ticket with that id. Ids: ${tickets.map((t) => t.id).join(', ')}`);
    queue = tickets.slice(idx);
  }

  const forgeDir = path.join(cwd, '.forge');
  const logsDir = path.join(forgeDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const logFile = path.join(logsDir, `run-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
  const logLine = (obj) => fs.appendFileSync(logFile, JSON.stringify(obj) + '\n');
  const currentTicketFile = path.join(forgeDir, 'current-ticket.json');

  console.log(`Forge: ${queue.length} ticket(s), model=${modelAlias}, log=${path.relative(cwd, logFile)}`);

  const results = [];
  try {
    for (let i = 0; i < queue.length; i++) {
      const ticket = queue[i];
      const result = await runTicket({
        cwd, ticket, index: i, total: queue.length, modelAlias, config, configPath: args.configPath, logLine, currentTicketFile,
      });
      results.push(result);

      if (!result.ok) {
        const remaining = queue.slice(i + 1).map((t) => t.id);
        console.error('\nESCALATION');
        console.error(JSON.stringify({
          reason: `Ticket ${ticket.id} failed ${result.attempts} attempts.`,
          ticket,
          lastReviewIssues: result.lastIssues,
          lastProposedChanges: result.lastChanges,
          remainingTickets: remaining,
          resumeCommand: remaining.length ? `node ${__filename} ${args.ticketsFile} --model ${modelAlias} --start-at ${remaining[0]}` : null,
          log: logFile,
        }, null, 2));
        process.exitCode = 1;
        return;
      }
    }
  } finally {
    fs.rmSync(currentTicketFile, { force: true });
  }

  console.log('\nAll tickets passed:');
  for (const r of results) console.log(`  ${r.ticket}: PASS (${r.attempts} attempt${r.attempts > 1 ? 's' : ''})`);
  console.log(`Log: ${logFile}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`Forge runner error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { deterministicIssues, loadTickets };
