'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { loadTasks, materializeSandbox, runChecker } = require('./lib/tasks');
const { runArmA, runArmB } = require('./lib/arms');
const { loadConfig } = require('../scripts/modelRouter');

const repoRoot = path.resolve(__dirname, '..');

async function main() {
  // Parse args
  const args = process.argv.slice(2);
  const opts = {
    tasks: null,
    reps: 3,
    model: 'haiku',
    results: path.join(repoRoot, 'eval', 'results', 'current'),
    fresh: false
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === '--tasks') {
      opts.tasks = args[++i].split(',');
      i++;
    } else if (arg === '--reps') {
      opts.reps = parseInt(args[++i], 10);
      i++;
    } else if (arg === '--model') {
      opts.model = args[++i];
      i++;
    } else if (arg === '--results') {
      opts.results = args[++i];
      i++;
    } else if (arg === '--fresh') {
      opts.fresh = true;
      i++;
    } else {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }

  // Absolute: FORGE_USAGE_LOG is consumed by the ticketRunner subprocess too,
  // whose cwd is the sandbox — a relative path would scatter usage lines there.
  const resultsDir = path.resolve(opts.results);

  // Handle --fresh
  if (opts.fresh) {
    fs.rmSync(resultsDir, { recursive: true, force: true });
  }

  // Create directories
  fs.mkdirSync(path.join(resultsDir, 'runs'), { recursive: true });
  fs.mkdirSync(path.join(resultsDir, 'transcripts'), { recursive: true });
  fs.mkdirSync(path.join(resultsDir, 'usage'), { recursive: true });

  // Load tasks
  const allTasks = loadTasks(path.join(repoRoot, 'tasks'));
  let tasks = allTasks;

  if (opts.tasks) {
    const requestedIds = new Set(opts.tasks);
    const foundIds = new Set();
    tasks = allTasks.filter(t => {
      if (requestedIds.has(t.id)) {
        foundIds.add(t.id);
        return true;
      }
      return false;
    });

    for (const id of requestedIds) {
      if (!foundIds.has(id)) {
        const knownIds = allTasks.map(t => t.id).join(', ');
        throw new Error(`Unknown task id: ${id}. Known ids: ${knownIds}`);
      }
    }
  }

  // Load config
  const config = loadConfig();

  // Calculate total planned runs
  const arms = ['direct', 'forge'];
  const totalPlanned = tasks.length * opts.reps * arms.length;
  let done = 0;

  // Main loop
  for (const task of tasks) {
    for (let rep = 1; rep <= opts.reps; rep++) {
      for (const arm of arms) {
        const key = `${task.id}__${arm}__r${rep}`;
        const runJsonPath = path.join(resultsDir, 'runs', `${key}.json`);

        if (fs.existsSync(runJsonPath)) {
          console.log(`skip ${key} (already done)`);
          done++;
          continue;
        }

        console.log(`[${done + 1}/${totalPlanned}] ${key} ...`);

        let sandbox;
        let startedAt;
        let result;

        try {
          // Create temp sandbox
          sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-eval-'));

          // Materialize starter files
          materializeSandbox(task, sandbox);

          // Set usage log
          const usageFile = path.join(resultsDir, 'usage', `${key}.jsonl`);
          process.env.FORGE_USAGE_LOG = usageFile;

          startedAt = new Date().toISOString();
          const t0 = Date.now();

          // Run the arm
          const armResult = await (arm === 'direct' ? runArmA : runArmB)({
            task,
            sandboxDir: sandbox,
            repoRoot,
            modelAlias: opts.model,
            config
          });

          const armDurationMs = Date.now() - t0;

          // Always run checker
          const checker = runChecker(task, sandbox);

          // Read usage file
          let tokens = {
            calls: 0,
            inputTokens: 0,
            outputTokens: 0,
            costUsd: 0
          };

          if (fs.existsSync(usageFile)) {
            const lines = fs.readFileSync(usageFile, 'utf8').split('\n').filter(l => l.trim());
            tokens.calls = lines.length;
            for (const line of lines) {
              try {
                const entry = JSON.parse(line);
                tokens.inputTokens += entry.inputTokens || 0;
                tokens.outputTokens += entry.outputTokens || 0;
                tokens.costUsd += entry.costUsd || 0;
              } catch (e) {
                // Skip invalid lines
              }
            }
          }

          // Build result
          result = {
            key,
            task: task.id,
            category: task.category,
            difficulty: task.difficulty,
            arm,
            rep,
            model: opts.model,
            pass: checker.pass,
            status: armResult.ok ? 'completed' : 'arm-error',
            error: armResult.error || null,
            armDurationMs,
            runnerExitCode: armResult.runnerExitCode ?? null,
            checker: {
              exitCode: checker.exitCode,
              timedOut: checker.timedOut,
              stdoutTail: checker.stdout,
              stderrTail: checker.stderr
            },
            tokens,
            startedAt,
            finishedAt: new Date().toISOString()
          };

          // Write run JSON
          fs.writeFileSync(runJsonPath, JSON.stringify(result, null, 2));

          // Write transcript JSONL
          const transcriptPath = path.join(resultsDir, 'transcripts', `${key}.jsonl`);
          let transcriptContent = '';
          if (armResult.transcript) {
            for (const entry of armResult.transcript) {
              transcriptContent += JSON.stringify(entry) + '\n';
            }
          }
          transcriptContent += JSON.stringify({
            kind: 'checker',
            pass: checker.pass,
            exitCode: checker.exitCode,
            stdout: checker.stdout,
            stderr: checker.stderr
          }) + '\n';
          fs.writeFileSync(transcriptPath, transcriptContent);

          console.log(`    ${checker.pass ? 'PASS' : 'FAIL'} (${(armDurationMs / 1000).toFixed(1)}s)`);
        } catch (err) {
          // Unexpected error
          result = {
            key,
            task: task.id,
            category: task.category,
            difficulty: task.difficulty,
            arm,
            rep,
            model: opts.model,
            pass: false,
            status: 'run-error',
            error: err.message,
            armDurationMs: 0,
            runnerExitCode: null,
            checker: {
              exitCode: null,
              timedOut: false,
              stdoutTail: '',
              stderrTail: err.message
            },
            tokens: {
              calls: 0,
              inputTokens: 0,
              outputTokens: 0,
              costUsd: 0
            },
            startedAt: startedAt || new Date().toISOString(),
            finishedAt: new Date().toISOString()
          };

          fs.writeFileSync(runJsonPath, JSON.stringify(result, null, 2));

          // Write error to transcript
          const transcriptPath = path.join(resultsDir, 'transcripts', `${key}.jsonl`);
          fs.writeFileSync(
            transcriptPath,
            JSON.stringify({ kind: 'error', message: err.message }) + '\n'
          );

          console.log(`    FAIL (error)`);
        } finally {
          // Clean up
          delete process.env.FORGE_USAGE_LOG;
          if (sandbox && fs.existsSync(sandbox)) {
            fs.rmSync(sandbox, { recursive: true, force: true });
          }
        }

        done++;
      }
    }
  }

  // Print summary
  const summary = {};
  for (const arm of arms) {
    let passed = 0;
    let total = 0;
    for (const task of tasks) {
      for (let rep = 1; rep <= opts.reps; rep++) {
        const key = `${task.id}__${arm}__r${rep}`;
        const runJsonPath = path.join(resultsDir, 'runs', `${key}.json`);
        if (fs.existsSync(runJsonPath)) {
          total++;
          try {
            const data = JSON.parse(fs.readFileSync(runJsonPath, 'utf8'));
            if (data.pass) passed++;
          } catch (e) {
            // Skip
          }
        }
      }
    }
    summary[arm] = `${passed}/${total} passed`;
  }

  console.log('\nSummary:');
  console.log(`  direct: ${summary.direct}`);
  console.log(`  forge: ${summary.forge}`);
  console.log(`\nResults: ${resultsDir}`);

  process.exit(0);
}

if (require.main === module) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
