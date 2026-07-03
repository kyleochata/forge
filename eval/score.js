'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

// Parse command-line arguments
const args = process.argv.slice(2);
let resultsDir = path.join(repoRoot, 'eval', 'results', 'current');
let outPrefix = path.join(repoRoot, 'eval', 'report');
let baselineFile = path.join(repoRoot, 'eval', 'baseline.json');
let failOnRegression = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--results') {
    resultsDir = args[++i];
  } else if (args[i] === '--out') {
    outPrefix = args[++i];
  } else if (args[i] === '--baseline') {
    baselineFile = args[++i];
  } else if (args[i] === '--fail-on-regression') {
    failOnRegression = true;
  }
}

// Read all runs
const runsDir = path.join(resultsDir, 'runs');
if (!fs.existsSync(runsDir)) {
  console.error(`Error: runs directory does not exist at ${runsDir}`);
  console.error('Run `node eval/runEval.js` first to generate results.');
  process.exit(1);
}

const files = fs.readdirSync(runsDir).filter(f => f.endsWith('.json'));
if (files.length === 0) {
  console.error(`Error: no results found in ${runsDir}`);
  console.error('Run `node eval/runEval.js` first to generate results.');
  process.exit(1);
}

const runs = [];
for (const file of files) {
  const content = fs.readFileSync(path.join(runsDir, file), 'utf8');
  runs.push(JSON.parse(content));
}

// Aggregation helper
function aggregate(runList) {
  const passes = runList.filter(r => r.pass).length;
  const runCount = runList.length;
  const passRate = runCount === 0 ? 0 : Number((passes / runCount).toFixed(4));

  let totalDuration = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUsd = 0;

  for (const r of runList) {
    totalDuration += r.armDurationMs || 0;
    if (r.tokens) {
      totalInputTokens += r.tokens.inputTokens || 0;
      totalOutputTokens += r.tokens.outputTokens || 0;
      totalCostUsd += r.tokens.costUsd || 0;
    }
  }

  const avgDurationMs = runCount === 0 ? 0 : Math.round(totalDuration / runCount);
  totalCostUsd = Number(totalCostUsd.toFixed(4));

  return {
    runs: runCount,
    passes,
    passRate,
    avgDurationMs,
    totalInputTokens,
    totalOutputTokens,
    totalCostUsd
  };
}

// Group runs by arm
const byArm = { direct: [], forge: [] };
for (const run of runs) {
  if (run.arm === 'direct') {
    byArm.direct.push(run);
  } else if (run.arm === 'forge') {
    byArm.forge.push(run);
  }
}

// Get model and reps
const model = runs.length > 0 ? runs[0].model : '';
const maxRep = Math.max(...runs.map(r => r.rep || 0));

// Build report object
const report = {
  generatedAt: new Date().toISOString(),
  model,
  reps: maxRep,
  totals: {
    direct: aggregate(byArm.direct),
    forge: aggregate(byArm.forge)
  },
  delta: 0,
  byCategory: {},
  byDifficulty: {},
  byTask: [],
  variance: {
    tasksWithMixedResults: [],
    note: 'Tasks listed here passed on some repetitions and failed on others in the same arm; treat their per-task deltas as noise.'
  },
  armErrors: {
    direct: byArm.direct.filter(r => r.status !== 'completed').length,
    forge: byArm.forge.filter(r => r.status !== 'completed').length
  },
  regressions: null
};

report.delta = Number((report.totals.forge.passRate - report.totals.direct.passRate).toFixed(4));

// Group by category
const byCategory = {};
for (const run of runs) {
  const cat = run.category;
  if (!byCategory[cat]) {
    byCategory[cat] = { direct: [], forge: [] };
  }
  byCategory[cat][run.arm].push(run);
}

for (const cat in byCategory) {
  report.byCategory[cat] = {
    direct: aggregate(byCategory[cat].direct),
    forge: aggregate(byCategory[cat].forge),
    delta: 0
  };
  report.byCategory[cat].delta = Number((report.byCategory[cat].forge.passRate - report.byCategory[cat].direct.passRate).toFixed(4));
}

// Group by difficulty
const byDifficulty = {};
for (const run of runs) {
  const diff = run.difficulty;
  if (!byDifficulty[diff]) {
    byDifficulty[diff] = { direct: [], forge: [] };
  }
  byDifficulty[diff][run.arm].push(run);
}

for (const diff in byDifficulty) {
  report.byDifficulty[diff] = {
    direct: aggregate(byDifficulty[diff].direct),
    forge: aggregate(byDifficulty[diff].forge),
    delta: 0
  };
  report.byDifficulty[diff].delta = Number((report.byDifficulty[diff].forge.passRate - report.byDifficulty[diff].direct.passRate).toFixed(4));
}

// Build per-task report
const byTask = {};
for (const run of runs) {
  const taskId = run.task;
  if (!byTask[taskId]) {
    byTask[taskId] = {
      task: taskId,
      category: run.category,
      difficulty: run.difficulty,
      direct: { passes: 0, runs: 0 },
      forge: { passes: 0, runs: 0 }
    };
  }
  byTask[taskId][run.arm].runs++;
  if (run.pass) {
    byTask[taskId][run.arm].passes++;
  }
}

// Mark mixed results and build array
const tasksWithMixedResults = [];
for (const taskId in byTask) {
  const task = byTask[taskId];
  const directMixed = task.direct.runs > 0 && task.direct.passes > 0 && task.direct.passes < task.direct.runs;
  const forgeMixed = task.forge.runs > 0 && task.forge.passes > 0 && task.forge.passes < task.forge.runs;
  if (directMixed || forgeMixed) {
    task.mixed = true;
    tasksWithMixedResults.push(taskId);
  }
  report.byTask.push(task);
}

report.byTask.sort((a, b) => a.task.localeCompare(b.task));
report.variance.tasksWithMixedResults = tasksWithMixedResults;

// Load baseline if it exists
if (fs.existsSync(baselineFile)) {
  const baselineContent = fs.readFileSync(baselineFile, 'utf8');
  const baseline = JSON.parse(baselineContent);

  const overallDeltaVsBaseline = {
    direct: Number((report.totals.direct.passRate - baseline.totals.direct.passRate).toFixed(4)),
    forge: Number((report.totals.forge.passRate - baseline.totals.forge.passRate).toFixed(4))
  };

  const taskRegressions = [];
  const taskImprovements = [];

  // Map baseline tasks by id
  const baselineByTask = {};
  for (const task of baseline.byTask) {
    baselineByTask[task.task] = task;
  }

  // Compare each current task
  for (const currentTask of report.byTask) {
    const baselineTask = baselineByTask[currentTask.task];
    if (!baselineTask) continue;

    // Check direct arm
    if (currentTask.direct.passes < baselineTask.direct.passes) {
      taskRegressions.push({
        task: currentTask.task,
        arm: 'direct',
        baseline: `${baselineTask.direct.passes}/${baselineTask.direct.runs}`,
        current: `${currentTask.direct.passes}/${currentTask.direct.runs}`
      });
    } else if (currentTask.direct.passes > baselineTask.direct.passes) {
      taskImprovements.push({
        task: currentTask.task,
        arm: 'direct',
        baseline: `${baselineTask.direct.passes}/${baselineTask.direct.runs}`,
        current: `${currentTask.direct.passes}/${currentTask.direct.runs}`
      });
    }

    // Check forge arm
    if (currentTask.forge.passes < baselineTask.forge.passes) {
      taskRegressions.push({
        task: currentTask.task,
        arm: 'forge',
        baseline: `${baselineTask.forge.passes}/${baselineTask.forge.runs}`,
        current: `${currentTask.forge.passes}/${currentTask.forge.runs}`
      });
    } else if (currentTask.forge.passes > baselineTask.forge.passes) {
      taskImprovements.push({
        task: currentTask.task,
        arm: 'forge',
        baseline: `${baselineTask.forge.passes}/${baselineTask.forge.runs}`,
        current: `${currentTask.forge.passes}/${currentTask.forge.runs}`
      });
    }
  }

  report.regressions = {
    baselineGeneratedAt: baseline.generatedAt,
    overallDeltaVsBaseline,
    taskRegressions,
    taskImprovements
  };
}

// Write report.json
const jsonPath = outPrefix + '.json';
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

// Build markdown
const formatDuration = (ms) => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;

let markdown = `# Forge eval report

Generated: ${report.generatedAt}
Model: ${report.model}
Repetitions: ${report.reps}

## Summary

| | Runs | Passes | Pass rate | Avg duration | Input tokens | Output tokens | Cost (USD) |
|---|---|---|---|---|---|---|---|
| direct | ${report.totals.direct.runs} | ${report.totals.direct.passes} | ${(report.totals.direct.passRate * 100).toFixed(2)}% | ${formatDuration(report.totals.direct.avgDurationMs)} | ${report.totals.direct.totalInputTokens} | ${report.totals.direct.totalOutputTokens} | \$${report.totals.direct.totalCostUsd} |
| forge | ${report.totals.forge.runs} | ${report.totals.forge.passes} | ${(report.totals.forge.passRate * 100).toFixed(2)}% | ${formatDuration(report.totals.forge.avgDurationMs)} | ${report.totals.forge.totalInputTokens} | ${report.totals.forge.totalOutputTokens} | \$${report.totals.forge.totalCostUsd} |

**Delta (forge - direct): ${(report.delta * 100).toFixed(1)} pp**

`;

if (report.delta <= 0) {
  markdown += `> The harness shows NO measurable improvement in this run. This is reported honestly, not massaged. Plausible causes: weak-model planning produced bad tickets; the review loop rejected working changes; tasks too easy (ceiling) or too hard (floor) to differentiate; N too small — check the variance section.

`;
}

markdown += `## By category

| Category | Direct | Forge | Delta (pp) |
|---|---|---|---|
`;

for (const cat in report.byCategory) {
  const c = report.byCategory[cat];
  markdown += `| ${cat} | ${(c.direct.passRate * 100).toFixed(2)}% | ${(c.forge.passRate * 100).toFixed(2)}% | ${(c.delta * 100).toFixed(1)} |
`;
}

markdown += `
## By difficulty

| Difficulty | Direct | Forge | Delta (pp) |
|---|---|---|---|
`;

for (const diff in report.byDifficulty) {
  const d = report.byDifficulty[diff];
  markdown += `| ${diff} | ${(d.direct.passRate * 100).toFixed(2)}% | ${(d.forge.passRate * 100).toFixed(2)}% | ${(d.delta * 100).toFixed(1)} |
`;
}

markdown += `
## Per task

| Task | Category | Difficulty | Direct | Forge |
|---|---|---|---|---|
`;

for (const task of report.byTask) {
  const directMixed = task.direct.runs > 0 && task.direct.passes > 0 && task.direct.passes < task.direct.runs;
  const forgeMixed = task.forge.runs > 0 && task.forge.passes > 0 && task.forge.passes < task.forge.runs;
  const directStr = directMixed ? `${task.direct.passes}/${task.direct.runs}*` : `${task.direct.passes}/${task.direct.runs}`;
  const forgeStr = forgeMixed ? `${task.forge.passes}/${task.forge.runs}*` : `${task.forge.passes}/${task.forge.runs}`;
  markdown += `| ${task.task} | ${task.category} | ${task.difficulty} | ${directStr} | ${forgeStr} |
`;
}

markdown += `
*Mixed results: passed on some repetitions and failed on others in the same arm.

## Variance

`;

if (report.variance.tasksWithMixedResults.length === 0) {
  markdown += `No task showed mixed results across repetitions.

`;
} else {
  markdown += `Tasks with mixed results: ${report.variance.tasksWithMixedResults.join(', ')}

`;
}

markdown += `${report.variance.note}

## Tokens & time

- direct: ${report.totals.direct.totalInputTokens} input, ${report.totals.direct.totalOutputTokens} output, ${formatDuration(report.totals.direct.avgDurationMs)} avg
- forge: ${report.totals.forge.totalInputTokens} input, ${report.totals.forge.totalOutputTokens} output, ${formatDuration(report.totals.forge.avgDurationMs)} avg

## Regressions vs baseline

`;

if (report.regressions === null) {
  markdown += `No baseline saved yet. Run \`make baseline\` after a good run to enable regression tracking.
`;
} else {
  markdown += `Baseline generated: ${report.regressions.baselineGeneratedAt}

Overall delta vs baseline:
- direct: ${(report.regressions.overallDeltaVsBaseline.direct * 100).toFixed(1)} pp
- forge: ${(report.regressions.overallDeltaVsBaseline.forge * 100).toFixed(1)} pp

`;

  if (report.regressions.taskRegressions.length === 0) {
    markdown += `Task regressions: None.

`;
  } else {
    markdown += `Task regressions:
`;
    for (const reg of report.regressions.taskRegressions) {
      markdown += `- ${reg.task} [${reg.arm}]: ${reg.baseline} -> ${reg.current}
`;
    }
    markdown += `
`;
  }

  if (report.regressions.taskImprovements.length === 0) {
    markdown += `Task improvements: None.
`;
  } else {
    markdown += `Task improvements:
`;
    for (const imp of report.regressions.taskImprovements) {
      markdown += `- ${imp.task} [${imp.arm}]: ${imp.baseline} -> ${imp.current}
`;
    }
  }
}

// Write report.md
const mdPath = outPrefix + '.md';
fs.writeFileSync(mdPath, markdown);

// Print summary to stdout
console.log('\n=== Eval Report Summary ===\n');
console.log('| | Runs | Passes | Pass rate |');
console.log('|---|---|---|---|');
console.log(`| direct | ${report.totals.direct.runs} | ${report.totals.direct.passes} | ${(report.totals.direct.passRate * 100).toFixed(2)}% |`);
console.log(`| forge | ${report.totals.forge.runs} | ${report.totals.forge.passes} | ${(report.totals.forge.passRate * 100).toFixed(2)}% |`);
console.log(`\n**Delta (forge - direct): ${(report.delta * 100).toFixed(1)} pp**\n`);
console.log(`Report written to:\n  ${mdPath}\n  ${jsonPath}\n`);

// Exit code handling
let exitCode = 0;
if (failOnRegression && report.regressions && report.regressions.taskRegressions.length > 0) {
  exitCode = 2;
}
process.exit(exitCode);
