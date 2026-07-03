'use strict';
// Model alias -> provider routing for Forge.
// Providers: "claude-cli" (claude -p subprocess, reuses existing auth) and
// "ollama" (HTTP). Retries with exponential backoff, then falls back along
// the chain: requested model -> haiku -> sonnet.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG_PATH = path.join(__dirname, '..', 'config.json');

function loadConfig(configPath) {
  const p = configPath || DEFAULT_CONFIG_PATH;
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch (err) {
    throw new Error(`Forge config not found at ${p}: ${err.message}`);
  }
  let config;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Forge config at ${p} is not valid JSON: ${err.message}. Fix the file or restore it from the README's config reference.`);
  }
  if (!config.models || typeof config.models !== 'object' || Object.keys(config.models).length === 0) {
    throw new Error(`Forge config at ${p} has no "models" map. See README.md for the expected shape.`);
  }
  return config;
}

function resolveAlias(alias, config) {
  const entry = config.models[alias];
  if (!entry) {
    const known = Object.keys(config.models).join(', ');
    throw new Error(`Unknown model alias "${alias}". Known aliases in config.json: ${known}. Add an entry under "models" or pass one of the known aliases.`);
  }
  if (!entry.provider || !entry.model) {
    throw new Error(`Model alias "${alias}" in config.json must have "provider" and "model" fields.`);
  }
  return entry;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logUsage(record) {
  const file = process.env.FORGE_USAGE_LOG;
  if (!file) return;
  try {
    fs.appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), ...record }) + '\n');
  } catch { /* usage logging must never break a model call */ }
}

// --- provider: claude-cli ---------------------------------------------------

function callClaudeCli(entry, { system, prompt, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--model', entry.model, '--output-format', 'json', '--max-turns', '1'];
    if (system) args.push('--system-prompt', system);

    const child = spawn('claude', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      settled = true;
      child.kill('SIGKILL');
      reject(new Error(`claude -p (${entry.model}) timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err.code === 'ENOENT') {
        reject(new Error('The "claude" CLI was not found on PATH. Install Claude Code (https://claude.com/claude-code) or fix PATH for this shell.'));
      } else {
        reject(new Error(`Failed to spawn claude CLI: ${err.message}`));
      }
    });

    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`claude -p (${entry.model}) exited with code ${code}: ${(stderr || stdout).trim().slice(0, 500)}`));
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch (err) {
        reject(new Error(`claude -p (${entry.model}) returned non-JSON output: ${stdout.trim().slice(0, 300)}`));
        return;
      }
      if (parsed.is_error) {
        reject(new Error(`claude -p (${entry.model}) reported an error: ${String(parsed.result).slice(0, 500)}`));
        return;
      }
      logUsage({
        provider: 'claude-cli',
        model: entry.model,
        inputTokens: parsed.usage ? (parsed.usage.input_tokens ?? null) : null,
        outputTokens: parsed.usage ? (parsed.usage.output_tokens ?? null) : null,
        costUsd: parsed.total_cost_usd ?? null,
        durationMs: parsed.duration_ms ?? null,
      });
      resolve(String(parsed.result ?? ''));
    });

    child.stdin.end(prompt);
  });
}

// --- provider: ollama --------------------------------------------------------

async function callOllama(entry, { system, prompt, timeoutMs }) {
  const endpoint = (entry.endpoint || 'http://localhost:11434').replace(/\/$/, '');
  const url = `${endpoint}/api/generate`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: entry.model, prompt, system: system || undefined, stream: false }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Ollama at ${endpoint} timed out after ${timeoutMs}ms (model ${entry.model}).`);
    }
    throw new Error(`Ollama unreachable at ${endpoint}: ${err.cause?.code || err.message}. Start it with \`ollama serve\` or fix the "endpoint" for this model in config.json.`);
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 404) {
    throw new Error(`Ollama at ${endpoint} does not have model "${entry.model}". Pull it with \`ollama pull ${entry.model}\` or change the model in config.json.`);
  }
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`Ollama at ${endpoint} returned HTTP ${res.status} for model "${entry.model}": ${body}`);
  }
  const data = await res.json().catch(() => {
    throw new Error(`Ollama at ${endpoint} returned non-JSON output.`);
  });
  if (typeof data.response !== 'string') {
    throw new Error(`Ollama response for model "${entry.model}" had no "response" field: ${JSON.stringify(data).slice(0, 300)}`);
  }
  logUsage({
    provider: 'ollama',
    model: entry.model,
    inputTokens: data.prompt_eval_count ?? null,
    outputTokens: data.eval_count ?? null,
    costUsd: null,
    durationMs: data.total_duration ? Math.round(data.total_duration / 1e6) : null,
  });
  return data.response;
}

// --- mock (smoke test) --------------------------------------------------------
// When FORGE_MOCK_RESPONSES points to a JSON file containing an array of
// strings, calls consume responses from that queue instead of hitting any
// provider. Lets the smoke test run the full pipeline offline and for free.

function callMock(alias) {
  const file = process.env.FORGE_MOCK_RESPONSES;
  const queue = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(queue) || queue.length === 0) {
    throw new Error(`Mock response queue ${file} is empty — the test made more model calls than it queued responses for (call was for "${alias}").`);
  }
  const next = queue.shift();
  fs.writeFileSync(file, JSON.stringify(queue, null, 2));
  return next;
}

// --- public API ----------------------------------------------------------------

/**
 * Call a model by alias with retries and fallback.
 * @param {string} alias - key in config.models
 * @param {object} opts - { system, prompt, config, configPath, timeoutMs, maxRetries, onWarn }
 * @returns {Promise<{ text, alias, modelId, provider, fellBack }>}
 */
async function callModel(alias, opts = {}) {
  const config = opts.config || loadConfig(opts.configPath);
  const timeoutMs = opts.timeoutMs || 300000;
  const maxRetries = opts.maxRetries || config.maxRetries || 3;
  const warn = opts.onWarn || ((msg) => process.stderr.write(`[forge:router] ${msg}\n`));

  if (process.env.FORGE_MOCK_RESPONSES) {
    return { text: callMock(alias), alias, modelId: 'mock', provider: 'mock', fellBack: false };
  }

  // Unknown alias is a config error, not a transient failure: no fallback.
  resolveAlias(alias, config);

  const chain = [...new Set([alias, 'haiku', 'sonnet'])].filter((a) => config.models[a]);
  const failures = [];

  for (const candidate of chain) {
    const entry = config.models[candidate];
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const call = entry.provider === 'ollama' ? callOllama : entry.provider === 'claude-cli' ? callClaudeCli : null;
        if (!call) {
          throw new Error(`Model alias "${candidate}" has unknown provider "${entry.provider}". Supported providers: claude-cli, ollama.`);
        }
        const text = await call(entry, { system: opts.system, prompt: opts.prompt, timeoutMs });
        return { text, alias: candidate, modelId: entry.model, provider: entry.provider, fellBack: candidate !== alias };
      } catch (err) {
        failures.push(`${candidate} attempt ${attempt}: ${err.message}`);
        if (err.message.includes('unknown provider')) break; // config error: skip retries for this candidate
        if (attempt < maxRetries) {
          const backoff = 500 * 2 ** (attempt - 1);
          warn(`${candidate} attempt ${attempt}/${maxRetries} failed (${err.message}). Retrying in ${backoff}ms...`);
          await sleep(backoff);
        }
      }
    }
    const nextIdx = chain.indexOf(candidate) + 1;
    if (nextIdx < chain.length) {
      warn(`Model "${candidate}" failed ${maxRetries} attempts; falling back to "${chain[nextIdx]}".`);
    }
  }

  throw new Error(`All models in fallback chain [${chain.join(' -> ')}] failed.\n${failures.join('\n')}`);
}

module.exports = { callModel, loadConfig, resolveAlias };

// CLI: node modelRouter.js <alias> "<prompt>" [--system "<system>"]
if (require.main === module) {
  const [alias, prompt] = process.argv.slice(2);
  if (!alias || !prompt) {
    console.error('Usage: node modelRouter.js <alias> "<prompt>"');
    process.exit(1);
  }
  callModel(alias, { prompt })
    .then((r) => {
      console.log(r.text);
      if (r.fellBack) console.error(`[forge:router] (answered by fallback model "${r.alias}")`);
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
