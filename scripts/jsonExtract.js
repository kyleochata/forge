'use strict';
// Extract a JSON value from model output that may be wrapped in markdown
// fences or prose. A naive fence regex breaks when descriptions contain
// nested ``` blocks or when a prose code block precedes the JSON one, so
// instead scan for balanced brackets (string-aware) and parse each candidate
// until one succeeds.

function extractBalanced(text, open, close) {
  for (let start = text.indexOf(open); start !== -1; start = text.indexOf(open, start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
      } else if (ch === '"') {
        inString = true;
      } else if (ch === open) {
        depth++;
      } else if (ch === close) {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(text.slice(start, i + 1));
          } catch {
            break; // balanced but not valid JSON — try the next opening bracket
          }
        }
      }
    }
  }
  return undefined;
}

function extractJsonObject(text) {
  const value = extractBalanced(text, '{', '}');
  if (value === undefined) throw new Error('no JSON object found in model output');
  return value;
}

function extractJsonArray(text) {
  const value = extractBalanced(text, '[', ']');
  if (value === undefined) throw new Error('no JSON array found in model output');
  return value;
}

module.exports = { extractJsonObject, extractJsonArray };
