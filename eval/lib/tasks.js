'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function loadTasks(tasksDir) {
  const tasks = [];

  const entries = fs.readdirSync(tasksDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const taskDirAbsolute = path.resolve(tasksDir, entry.name);
    const taskDirError = path.join(tasksDir, entry.name);

    // Read task.json
    const taskJsonPath = path.join(taskDirAbsolute, 'task.json');
    let taskData;
    try {
      const jsonContent = fs.readFileSync(taskJsonPath, 'utf8');
      taskData = JSON.parse(jsonContent);
    } catch (err) {
      throw new Error(`Task ${taskDirError}: Failed to read or parse task.json: ${err.message}`);
    }

    // Validate id matches dirname
    if (taskData.id !== entry.name) {
      throw new Error(`Task ${taskDirError}: "id" must equal directory name "${entry.name}".`);
    }

    // Validate category
    const validCategories = ['bugfix', 'feature', 'refactor', 'multifile', 'underspec'];
    if (!validCategories.includes(taskData.category)) {
      throw new Error(`Task ${taskDirError}: "category" must be one of ${validCategories.join(', ')}.`);
    }

    // Validate difficulty
    const validDifficulties = ['easy', 'medium', 'hard'];
    if (!validDifficulties.includes(taskData.difficulty)) {
      throw new Error(`Task ${taskDirError}: "difficulty" must be one of ${validDifficulties.join(', ')}.`);
    }

    // Validate prompt
    if (typeof taskData.prompt !== 'string' || taskData.prompt.trim() === '') {
      throw new Error(`Task ${taskDirError}: "prompt" must be a non-empty string.`);
    }

    // Validate files
    if (!Array.isArray(taskData.files) || taskData.files.length === 0) {
      throw new Error(`Task ${taskDirError}: "files" must be a non-empty array.`);
    }

    for (const file of taskData.files) {
      const filePath = path.join(taskDirAbsolute, file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Task ${taskDirError}: File "${file}" does not exist.`);
      }
    }

    // Validate checker
    if (typeof taskData.checker !== 'string' || taskData.checker.trim() === '') {
      throw new Error(`Task ${taskDirError}: "checker" must be a non-empty string.`);
    }

    // Validate check.js exists
    const checkJsPath = path.join(taskDirAbsolute, 'check.js');
    if (!fs.existsSync(checkJsPath)) {
      throw new Error(`Task ${taskDirError}: check.js does not exist.`);
    }

    // Add task with absolute dir
    tasks.push({
      ...taskData,
      dir: taskDirAbsolute
    });
  }

  // Sort by id
  tasks.sort((a, b) => a.id.localeCompare(b.id));

  return tasks;
}

function materializeSandbox(task, sandboxDir) {
  fs.mkdirSync(sandboxDir, { recursive: true });

  for (const rel of task.files) {
    const srcPath = path.join(task.dir, rel);
    const dstPath = path.join(sandboxDir, rel);

    // Create parent directories
    const dstDir = path.dirname(dstPath);
    fs.mkdirSync(dstDir, { recursive: true });

    // Copy file
    fs.copyFileSync(srcPath, dstPath);
  }
}

function runChecker(task, sandboxDir) {
  // Copy check.js to sandbox
  const checkJsSrcPath = path.join(task.dir, 'check.js');
  const checkJsDstPath = path.join(sandboxDir, 'check.js');
  fs.copyFileSync(checkJsSrcPath, checkJsDstPath);

  // Run checker
  const res = spawnSync(process.execPath, ['check.js'], {
    cwd: sandboxDir,
    encoding: 'utf8',
    timeout: 30000
  });

  return {
    pass: res.status === 0,
    exitCode: res.status,
    timedOut: res.signal === 'SIGTERM',
    stdout: (res.stdout || '').slice(-2000),
    stderr: (res.stderr || '').slice(-2000)
  };
}

module.exports = {
  loadTasks,
  materializeSandbox,
  runChecker
};