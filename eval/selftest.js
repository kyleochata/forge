'use strict';

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
let failures = 0;

function check(name, ok, detail) {
  const symbol = ok ? '✓' : '✗';
  console.log(`  ${symbol} ${name}`);
  if (detail && !ok) {
    console.log(`    ${detail}`);
  }
  if (!ok) {
    failures++;
  }
}

// PART 1: Corpus validation
console.log('PART 1: Corpus Validation');
let tasks = [];
try {
  const { loadTasks, materializeSandbox, runChecker } = require('./lib/tasks.js');
  tasks = loadTasks(path.join(repoRoot, 'tasks'));
  check('tasks.length >= 20', tasks.length >= 20, `Got ${tasks.length} tasks`);

  // For every task, validate checker
  for (const task of tasks) {
    try {
      const sandbox = fs.mkdtempSync(path.join(repoRoot, '.tmp-'));
      try {
        materializeSandbox(task, sandbox);
        const result = runChecker(task, sandbox);
        check(`${task.id}: checker fails on starter`, result.pass === false,
              result.pass === true ? 'Checker passed on starter (should fail)' : '');
      } finally {
        fs.rmSync(sandbox, { recursive: true, force: true });
      }
    } catch (err) {
      check(`${task.id}: materialize and check`, false, err.message);
    }
  }
} catch (err) {
  check('load tasks', false, err.message);
}

// PART 2 & 3: Mocked end-to-end pipeline and scoring
console.log('\nPART 2: Mocked End-to-End Pipeline');
try {
  const tmpDir = fs.mkdtempSync(path.join(repoRoot, '.tmp-'));
  try {
    const tmpResultsDir = path.join(tmpDir, 'results');
    fs.mkdirSync(tmpResultsDir);

    const fixedPaginate = 'function paginate(items, page, size) {\n  const start = (page - 1) * size;\n  return items.slice(start, start + size);\n}\nmodule.exports = { paginate };\n';

    // Build mock response queue
    const mockResponses = [
      // [1] Arm A execution
      JSON.stringify({ changes: [{ file: 'paginate.js', content: fixedPaginate }], notes: 'fixed off-by-one' }),
      // [2] Arm B planning
      JSON.stringify([{ id: 'T1', title: 'Fix paginate', description: 'Change start to (page - 1) * size in paginate.js.', files: ['paginate.js'], acceptanceCriteria: ['paginate([1,2,3,4,5,6,7,8,9,10], 1, 3) returns [1,2,3]'] }]),
      // [3] Arm B ticket execution
      JSON.stringify({ changes: [{ file: 'paginate.js', content: fixedPaginate }], notes: 'fixed off-by-one' }),
      // [4] Arm B review
      JSON.stringify({ verdict: 'PASS', issues: [] })
    ];

    const mockFile = path.join(tmpDir, 'mock.json');
    fs.writeFileSync(mockFile, JSON.stringify(mockResponses));

    // Run eval
    const env = { ...process.env, FORGE_MOCK_RESPONSES: mockFile };
    const result = spawnSync(process.execPath, [
      path.join(repoRoot, 'eval', 'runEval.js'),
      '--tasks', 'bugfix-off-by-one',
      '--reps', '1',
      '--results', tmpResultsDir,
      '--fresh'
    ], { encoding: 'utf8', env, timeout: 120000 });

    check('runEval.js exit code 0', result.status === 0, result.status !== 0 ? `Exit ${result.status}` : '');

    // Check results exist
    const directResult = path.join(tmpResultsDir, 'runs', 'bugfix-off-by-one__direct__r1.json');
    const forgeResult = path.join(tmpResultsDir, 'runs', 'bugfix-off-by-one__forge__r1.json');

    if (fs.existsSync(directResult)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(directResult, 'utf8'));
        check('direct arm: pass === true', parsed.pass === true);
      } catch (err) {
        check('direct arm result parsing', false, err.message);
      }
    } else {
      check('direct arm result exists', false, `File not found: ${directResult}`);
    }

    if (fs.existsSync(forgeResult)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(forgeResult, 'utf8'));
        check('forge arm: pass === true', parsed.pass === true);
      } catch (err) {
        check('forge arm result parsing', false, err.message);
      }
    } else {
      check('forge arm result exists', false, `File not found: ${forgeResult}`);
    }

    // Check transcripts exist
    const transcriptDir = path.join(tmpResultsDir, 'transcripts');
    if (fs.existsSync(transcriptDir)) {
      const files = fs.readdirSync(transcriptDir);
      check('transcripts directory has files', files.length > 0, files.length === 0 ? 'No transcript files' : '');
    } else {
      check('transcripts directory exists', false, 'transcripts dir not found');
    }

    // PART 3: Scoring
    console.log('\nPART 3: Scoring');
    // --out is a path PREFIX: score.js writes <prefix>.json and <prefix>.md.
    const reportPrefix = path.join(tmpResultsDir, 'report');

    const scoreResult = spawnSync(process.execPath, [
      path.join(repoRoot, 'eval', 'score.js'),
      '--results', tmpResultsDir,
      '--out', reportPrefix
    ], { encoding: 'utf8', timeout: 120000 });

    check('score.js exit code 0', scoreResult.status === 0, scoreResult.status !== 0 ? `Exit ${scoreResult.status}` : '');

    // Check report.json
    const reportJsonPath = reportPrefix + '.json';
    if (fs.existsSync(reportJsonPath)) {
      try {
        const report = JSON.parse(fs.readFileSync(reportJsonPath, 'utf8'));
        check('report.json has totals.direct.passes === 1',
              report.totals && report.totals.direct && report.totals.direct.passes === 1);
        check('report.json has totals.forge.passes === 1',
              report.totals && report.totals.forge && report.totals.forge.passes === 1);
        check('report.json has delta === 0',
              report.delta === 0);
      } catch (err) {
        check('report.json parsing', false, err.message);
      }
    } else {
      check('report.json exists', false, 'File not found');
    }

    // Check report.md
    const reportMdPath = reportPrefix + '.md';
    if (fs.existsSync(reportMdPath)) {
      const content = fs.readFileSync(reportMdPath, 'utf8');
      check('report.md contains ## Regressions', content.includes('## Regressions'));
    } else {
      check('report.md exists', false, 'File not found');
    }

  } finally {
    // Clean up temp dir
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  }
} catch (err) {
  check('create temp dir for e2e and scoring', false, err.message);
}

// Exit
if (failures === 0) {
  console.log('\nEVAL SELFTEST PASSED');
  process.exit(0);
} else {
  console.log(`\nEVAL SELFTEST FAILED (${failures} check${failures === 1 ? '' : 's'})`);
  process.exit(1);
}
