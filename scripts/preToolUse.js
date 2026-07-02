'use strict';
// Forge PreToolUse guard — deterministic only, no LLM calls.
//
// 1. While a Forge ticket is active (.forge/current-ticket.json exists in the
//    project), block file writes outside the ticket's declared file list.
// 2. Verify that imports/requires in proposed JS/TS code exist in
//    package.json, node_modules, or the repo.
//
// FAIL OPEN: if any check itself throws, the write is allowed and a warning
// is appended to .forge/logs/hook-warnings.log. The hook must never break a
// session because of its own bugs.

const fs = require('fs');
const path = require('path');
const { builtinModules } = require('module');

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const JS_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
const RESOLVE_SUFFIXES = ['', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.json',
  '/index.js', '/index.jsx', '/index.ts', '/index.tsx', '/index.mjs', '/index.cjs'];

// --- import verification -----------------------------------------------------

function extractImports(code) {
  const specs = new Set();
  const patterns = [
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,          // require('x')
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,            // import('x')
    /\bimport\s+[^'"]*?\bfrom\s+['"]([^'"]+)['"]/g,      // import a from 'x'
    /\bimport\s+['"]([^'"]+)['"]/g,                      // import 'x'
    /\bexport\s+[^'"]*?\bfrom\s+['"]([^'"]+)['"]/g,      // export * from 'x'
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(code)) !== null) specs.add(m[1]);
  }
  return [...specs];
}

function packageNameOf(spec) {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function relativeResolves(fromDir, spec, plannedFiles) {
  for (const suffix of RESOLVE_SUFFIXES) {
    const candidate = path.resolve(fromDir, spec + suffix);
    if (fs.existsSync(candidate)) return true;
    if (plannedFiles && plannedFiles.has(candidate)) return true;
  }
  return false;
}

function loadDeclaredDeps(cwd) {
  const deps = new Set();
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) return deps;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const name of Object.keys(pkg[field] || {})) deps.add(name);
  }
  return deps;
}

/**
 * Check every import/require in `code` (destined for `filePath`) against
 * package.json, node_modules, and the repo.
 * @param {object} [opts] - { plannedFiles: string[] } repo-relative paths that
 *   are about to be created in the same change (count as existing).
 * @returns {{ missing: string[], checked: number }}
 */
function verifyImports(code, filePath, cwd, opts = {}) {
  if (!JS_EXTENSIONS.has(path.extname(filePath))) return { missing: [], checked: 0 };
  const specs = extractImports(code);
  if (specs.length === 0) return { missing: [], checked: 0 };

  const deps = loadDeclaredDeps(cwd);
  const builtins = new Set(builtinModules);
  const planned = new Set((opts.plannedFiles || []).map((p) => path.resolve(cwd, p)));
  const fromDir = path.dirname(path.resolve(cwd, filePath));
  const missing = [];

  for (const spec of specs) {
    if (spec.startsWith('.') || spec.startsWith('/')) {
      const base = spec.startsWith('/') ? cwd : fromDir;
      const rel = spec.startsWith('/') ? '.' + spec : spec;
      if (!relativeResolves(base, rel, planned)) missing.push(spec);
      continue;
    }
    const name = packageNameOf(spec.replace(/^node:/, ''));
    if (spec.startsWith('node:') || builtins.has(name)) continue;
    if (deps.has(name)) continue;
    if (fs.existsSync(path.join(cwd, 'node_modules', name))) continue;
    missing.push(spec);
  }
  return { missing, checked: specs.length };
}

// --- hook plumbing -------------------------------------------------------------

function proposedContentOf(toolName, toolInput) {
  if (toolName === 'Write') return toolInput.content || '';
  if (toolName === 'Edit') return toolInput.new_string || '';
  if (toolName === 'MultiEdit') return (toolInput.edits || []).map((e) => e.new_string || '').join('\n');
  if (toolName === 'NotebookEdit') return toolInput.new_source || '';
  return '';
}

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}

function allow() {
  process.exit(0);
}

function warnFailOpen(cwd, err) {
  try {
    const dir = path.join(cwd || process.cwd(), '.forge', 'logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'hook-warnings.log'),
      `${new Date().toISOString()} preToolUse failed open: ${err.stack || err.message}\n`);
  } catch { /* even warning failed — still fail open */ }
  allow();
}

function main(event) {
  const toolName = event.tool_name;
  if (!WRITE_TOOLS.has(toolName)) return allow();

  const toolInput = event.tool_input || {};
  const filePath = toolInput.file_path || toolInput.notebook_path;
  if (!filePath) return allow();

  const cwd = event.cwd || process.cwd();
  const absTarget = path.resolve(cwd, filePath);
  const relTarget = path.relative(cwd, absTarget);

  // Guard 1: ticket file-list enforcement (only while a ticket is active).
  const currentTicketPath = path.join(cwd, '.forge', 'current-ticket.json');
  if (fs.existsSync(currentTicketPath) && !relTarget.startsWith('.forge')) {
    const ticket = JSON.parse(fs.readFileSync(currentTicketPath, 'utf8'));
    const allowed = (ticket.files || []).map((f) => path.resolve(cwd, f));
    if (!allowed.includes(absTarget)) {
      return deny(`Forge ticket ${ticket.id} is active and only declares [${(ticket.files || []).join(', ')}]. Writing ${relTarget} is outside the ticket's file list. Finish or escalate the ticket first (or delete .forge/current-ticket.json if the run is over).`);
    }
  }

  // Guard 2: no hallucinated imports.
  const { missing } = verifyImports(proposedContentOf(toolName, toolInput), absTarget, cwd);
  if (missing.length) {
    return deny(`Blocked: ${relTarget} imports module(s) that do not exist in package.json, node_modules, or the repo: ${missing.join(', ')}. Install the dependency first or import something that exists.`);
  }

  return allow();
}

module.exports = { verifyImports, extractImports };

if (require.main === module) {
  let input = '';
  process.stdin.on('data', (d) => { input += d; });
  process.stdin.on('end', () => {
    let event = {};
    try {
      event = JSON.parse(input || '{}');
    } catch (err) {
      return warnFailOpen(process.cwd(), err);
    }
    try {
      main(event);
    } catch (err) {
      warnFailOpen(event.cwd, err);
    }
  });
}
