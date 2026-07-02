'use strict';
// Forge end-to-end smoke test. Runs entirely offline:
//   1. One trivial ticket through ticketRunner with mocked model responses
//      (attempt 1 FAILs review, attempt 2 PASSes) — verifies the review-fix
//      loop, the applied change, and the JSONL log.
//   2. The PreToolUse hook: blocks a hallucinated import, blocks a write
//      outside the active ticket's file list, allows a legitimate write,
//      and fails open on garbage input.
//   3. The model router: unreachable Ollama produces a clear error and falls
//      back to the next model in the chain (served by a local stub server).
//
// Usage: node scripts/smokeTest.js

const { spawnSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const SCRIPTS = __dirname;
let failures = 0;

function check(name, ok, detail) {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
}

function runHook(event, cwd) {
  const res = spawnSync('node', [path.join(SCRIPTS, 'preToolUse.js')], {
    input: typeof event === 'string' ? event : JSON.stringify({ cwd, ...event }),
    encoding: 'utf8',
  });
  let decision = null;
  try {
    decision = JSON.parse(res.stdout).hookSpecificOutput;
  } catch { /* no JSON output = allow */ }
  return { status: res.status, decision };
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-smoke-'));
  console.log(`Forge smoke test (sandbox: ${tmp})\n`);

  // --- fixture: a tiny express project --------------------------------------
  const serverJs = [
    "const express = require('express');",
    'const app = express();',
    "app.get('/', (req, res) => res.send('hi'));",
    'app.listen(3000);',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({
    name: 'smoke-fixture', version: '1.0.0', dependencies: { express: '^4.19.0' },
  }, null, 2));
  fs.writeFileSync(path.join(tmp, 'server.js'), serverJs);

  const healthyServerJs = serverJs.replace(
    "app.get('/', (req, res) => res.send('hi'));",
    "app.get('/', (req, res) => res.send('hi'));\napp.get('/health', (req, res) => res.json({ status: 'ok' }));",
  );

  const ticket = {
    id: 'T1',
    title: 'Add /health endpoint',
    description: "Add GET /health returning JSON {status:'ok'} to server.js, following the existing app.get pattern.",
    files: ['server.js'],
    acceptanceCriteria: ["GET /health responds with {status:'ok'}", 'No other routes changed'],
  };
  fs.writeFileSync(path.join(tmp, 'tickets.json'), JSON.stringify([ticket], null, 2));

  // --- 1. ticket end-to-end with mocked model -------------------------------
  console.log('1. Ticket runner end-to-end (mocked model, fail-then-pass):');

  // Queue of model responses consumed in order:
  //   attempt 1: execution -> review says FAIL (with an issue)
  //   attempt 2: execution (fixed) -> review says PASS
  const mockFile = path.join(tmp, 'mock-responses.json');
  fs.writeFileSync(mockFile, JSON.stringify([
    JSON.stringify({ changes: [{ file: 'server.js', content: serverJs }], notes: 'first try (forgot the route)' }),
    JSON.stringify({ verdict: 'FAIL', issues: ['Acceptance criterion not met: no /health route was added to server.js.'] }),
    JSON.stringify({ changes: [{ file: 'server.js', content: healthyServerJs }], notes: 'added /health route' }),
    JSON.stringify({ verdict: 'PASS', issues: [] }),
  ], null, 2));

  const run = spawnSync('node', [path.join(SCRIPTS, 'ticketRunner.js'), 'tickets.json', '--model', 'haiku'], {
    cwd: tmp,
    encoding: 'utf8',
    env: { ...process.env, FORGE_MOCK_RESPONSES: mockFile },
  });

  check('runner exits 0', run.status === 0, `exit=${run.status} stderr=${(run.stderr || '').slice(0, 300)}`);
  check('progress line printed ([1/1] ... ✓)', /\[1\/1\] Add \/health endpoint\.\.\. ✓/.test(run.stdout), run.stdout.slice(0, 300));
  const applied = fs.readFileSync(path.join(tmp, 'server.js'), 'utf8');
  check('change applied to server.js', applied.includes("app.get('/health'"));
  check('existing route preserved', applied.includes("app.get('/',"));

  const logsDir = path.join(tmp, '.forge', 'logs');
  const logFile = fs.existsSync(logsDir) ? fs.readdirSync(logsDir).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(logsDir, f))[0] : null;
  check('JSONL log created', Boolean(logFile));
  if (logFile) {
    const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    check('both attempts logged', lines.length === 2, `got ${lines.length} lines`);
    check('attempt 1 = FAIL with issues', lines[0]?.attempt === 1 && lines[0]?.result === 'FAIL' && lines[0]?.issues.length > 0);
    check('attempt 2 = PASS', lines[1]?.attempt === 2 && lines[1]?.result === 'PASS');
    check('log records model and reviewer', lines.every((l) => l.ticket === 'T1' && l.model && l.reviewer));
  }
  check('current-ticket marker cleaned up', !fs.existsSync(path.join(tmp, '.forge', 'current-ticket.json')));

  // --- 2. PreToolUse hook -----------------------------------------------------
  console.log('\n2. PreToolUse hook (deterministic guard):');

  const halluc = runHook({
    tool_name: 'Write',
    tool_input: { file_path: path.join(tmp, 'other.js'), content: "const x = require('totally-hallucinated-pkg');\nmodule.exports = x;" },
  }, tmp);
  check('blocks hallucinated import', halluc.decision?.permissionDecision === 'deny' && /totally-hallucinated-pkg/.test(halluc.decision.permissionDecisionReason), JSON.stringify(halluc));

  const legit = runHook({
    tool_name: 'Write',
    tool_input: { file_path: path.join(tmp, 'other.js'), content: "const express = require('express');\nconst fs = require('fs');\nconst s = require('./server.js');" },
  }, tmp);
  check('allows legitimate imports (dep + builtin + repo file)', legit.decision == null && legit.status === 0, JSON.stringify(legit));

  fs.writeFileSync(path.join(tmp, '.forge', 'current-ticket.json'), JSON.stringify({ id: 'T9', files: ['server.js'] }));
  const outsideTicket = runHook({
    tool_name: 'Write',
    tool_input: { file_path: path.join(tmp, 'not-declared.js'), content: 'module.exports = 1;' },
  }, tmp);
  check('blocks write outside active ticket file list', outsideTicket.decision?.permissionDecision === 'deny' && /T9/.test(outsideTicket.decision.permissionDecisionReason), JSON.stringify(outsideTicket));

  const insideTicket = runHook({
    tool_name: 'Write',
    tool_input: { file_path: path.join(tmp, 'server.js'), content: 'module.exports = 1;' },
  }, tmp);
  check('allows write inside ticket file list', insideTicket.decision == null && insideTicket.status === 0, JSON.stringify(insideTicket));
  fs.rmSync(path.join(tmp, '.forge', 'current-ticket.json'), { force: true });

  const garbage = runHook('this is not json', tmp);
  check('fails open on garbage input (never blocks the session)', garbage.status === 0 && garbage.decision == null, JSON.stringify(garbage));

  // --- 3. Router: unreachable Ollama -> clear error + fallback ----------------
  console.log('\n3. Model router (unreachable Ollama, fallback chain):');

  delete process.env.FORGE_MOCK_RESPONSES;
  const { callModel } = require('./modelRouter');

  const stub = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ response: 'FALLBACK-OK' }));
  });
  await new Promise((resolve) => stub.listen(0, '127.0.0.1', resolve));
  const stubPort = stub.address().port;

  const config = {
    defaultModel: 'local',
    maxRetries: 2,
    models: {
      local: { provider: 'ollama', model: 'llama3', endpoint: 'http://127.0.0.1:9' }, // discard port: always unreachable
      haiku: { provider: 'ollama', model: 'stub', endpoint: `http://127.0.0.1:${stubPort}` },
    },
  };

  const warnings = [];
  const result = await callModel('local', { prompt: 'hi', config, onWarn: (m) => warnings.push(m) });
  check('falls back local -> haiku', result.alias === 'haiku' && result.fellBack === true, JSON.stringify(result));
  check('fallback answer received', result.text === 'FALLBACK-OK');
  check('unreachable error is actionable (mentions ollama serve)', warnings.some((w) => /Ollama unreachable/.test(w) && /ollama serve/.test(w)), warnings.join(' | ').slice(0, 300));

  const noChain = { ...config, models: { local: config.models.local } };
  const allDown = await callModel('local', { prompt: 'hi', config: noChain, onWarn: () => {} }).then(() => null, (e) => e);
  check('all-models-down throws clear aggregate error', allDown != null && /Ollama unreachable/.test(allDown.message) && /fallback chain/.test(allDown.message), allDown?.message?.slice(0, 200));

  const badAlias = await callModel('nope', { prompt: 'hi', config, onWarn: () => {} }).then(() => null, (e) => e);
  check('unknown alias fails fast with known aliases listed', badAlias != null && /Unknown model alias "nope"/.test(badAlias.message) && /local, haiku/.test(badAlias.message), badAlias?.message);

  stub.close();

  // --- verdict -----------------------------------------------------------------
  console.log(failures === 0 ? '\nSMOKE TEST PASSED' : `\nSMOKE TEST FAILED (${failures} check(s))`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`Smoke test crashed: ${err.stack}`);
  process.exit(1);
});
